"use client";

import { useCallback, useRef, useState } from "react";
import { syncConversation } from "@/app/actions/chat";
import { rememberExchange } from "@/app/actions/memory";
import { mask } from "@/lib/ai/blind-prompting";
import { detectImageIntent } from "@/lib/chat/image-intent";
import { streamChat } from "@/lib/chat/sse-client";
import { buildUserContent, type Attachment } from "@/lib/chat/attachments";
import { CUSTOM_SKILL_PREFIX, useChat, uuid, type ChatMessage, type Project } from "@/store/chat";

/** Cowork papka ro'yxati + loyiha ko'rsatmasi — bitta kontekst matni (server 6000 belgi qabul qiladi). */
function buildContext(cowork: string | null, project?: Project): string | undefined {
  const parts: string[] = [];
  if (project?.instructions.trim()) parts.push(`LOYIHA "${project.name}" KO'RSATMALARI (har javobda amal qil):\n${project.instructions.trim()}`);
  if (cowork) parts.push(cowork);
  const text = parts.join("\n\n");
  return text ? text.slice(0, 6000) : undefined;
}

/**
 * Maps stored messages to the API wire format. When Blind Prompting is on,
 * PII in the *latest* user message is replaced with tokens; the returned
 * `tokenMap` is used to un-mask the streamed answer on the client.
 */
function toWire(messages: ChatMessage[], blind: boolean) {
  const tokenMap: Record<string, string> = {};
  const wire = messages.map((m) => {
    // Blind Prompting yoqilganda BARCHA user xabarlari (nafaqat oxirgi)
    // maskalanadi — chunki avvalgi turlarda ham PII kelishi mumkin.
    const isMaskable = blind && m.role === "user" && typeof m.content === "string";
    const raw = isMaskable
      ? (() => {
          const r = mask(m.content as string);
          Object.assign(tokenMap, r.tokenMap);
          return r.masked;
        })()
      : m.content;
    return {
      role: m.role,
      content: m.role === "user" && m.attachments?.length ? buildUserContent(raw as string, m.attachments) : raw,
    };
  });
  return { wire, tokenMap };
}

function applyTokenMap(text: string, tokenMap: Record<string, string>): string {
  if (!text) return text;
  let out = text;
  for (const [tok, val] of Object.entries(tokenMap)) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(esc, "g"), val);
  }
  return out;
}

const HISTORY_LIMIT = 24;

/** Sends a message to the active (or a new) conversation and streams the reply. */
export function useSendMessage() {
  const [isStreaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (conversationId: string, history: ChatMessage[], docIds?: string[]) => {
    const state = useChat.getState();
    const conv = state.conversations[conversationId];
    if (!conv) return;

    const assistant: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: "",
      modelId: conv.modelId,
      createdAt: new Date().toISOString(),
      status: "streaming",
    };
    state.appendMessage(conversationId, assistant);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    let text = "";
    let reasoning = "";
    let citations: string[] | undefined;
    let skills: string[] | undefined;
    let failed: string | null = null;

    const state0 = useChat.getState();
    const { wire, tokenMap } = toWire(history.slice(-HISTORY_LIMIT), state0.blindPrompting);
    const hasMask = Object.keys(tokenMap).length > 0;

    try {
      await streamChat({
        modelId: conv.modelId,
        research: conv.research,
        skills: state0.enabledSkills,
        // Only the custom skills the user switched on travel with the request.
        customSkills: state0.customSkills
          .filter((k) => state0.enabledSkills.includes(`${CUSTOM_SKILL_PREFIX}${k.id}`))
          .slice(0, 3)
          .map((k) => ({ name: k.name, instructions: k.instructions })),
        docIds,
        lang: state0.lang,
        context: buildContext(state0.coworkOutline, state0.projects.find((p) => p.id === conv.projectId)),
        messages: wire,
        signal: controller.signal,
        onEvent: (ev) => {
          const s = useChat.getState();
          if (ev.type === "text") {
            text += ev.text;
            const shown = hasMask ? applyTokenMap(text, tokenMap) : text;
            s.updateMessage(conversationId, assistant.id, { content: shown });
          } else if (ev.type === "reasoning") {
            reasoning += ev.text;
            s.updateMessage(conversationId, assistant.id, { reasoning });
          } else if (ev.type === "citations") {
            citations = ev.citations;
            s.updateMessage(conversationId, assistant.id, { citations });
          } else if (ev.type === "skills") {
            skills = ev.skills;
            s.updateMessage(conversationId, assistant.id, { skills });
          } else if (ev.type === "route") {
            s.updateMessage(conversationId, assistant.id, {
              route: { reason: ev.reason, steps: ev.steps },
              usedModels: ev.steps.map((st) => st.modelId),
            });
          } else if (ev.type === "step") {
            // Show which model is active for the current pipeline step.
            s.updateMessage(conversationId, assistant.id, { modelId: ev.modelId });
          } else if (ev.type === "reading") {
            s.updateMessage(conversationId, assistant.id, { reading: ev.urls });
          } else if (ev.type === "switch") {
            const prev = s.conversations[conversationId]?.messages.find((m) => m.id === assistant.id)?.switched ?? [];
            s.updateMessage(conversationId, assistant.id, {
              switched: [...prev, { from: ev.from, to: ev.to, reason: ev.reason }],
              modelId: ev.to,
            });
          } else if (ev.type === "cache") {
            s.updateMessage(conversationId, assistant.id, {
              cache: { model: ev.model, similarity: ev.similarity },
            });
          } else if (ev.type === "verifier") {
            s.updateMessage(conversationId, assistant.id, { verifier: ev.issues });
          } else if (ev.type === "error") {
            if (ev.message.startsWith("[upgrade]")) {
              failed = ev.message.replace("[upgrade]", "").trim();
              window.dispatchEvent(new CustomEvent("sovereign:upgrade", { detail: { reason: failed } }));
            } else {
              failed = ev.message;
            }
          }
        },
      });
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        failed = err instanceof Error ? err.message : "Ulanish xatosi";
      }
    }

    const s = useChat.getState();
    if (failed && !text) {
      s.updateMessage(conversationId, assistant.id, { status: "error", error: failed });
    } else {
      const finalContent = hasMask ? applyTokenMap(text, tokenMap) : text;
      s.updateMessage(conversationId, assistant.id, { status: "done", content: finalContent, citations, skills });
    }

    // First exchange names the conversation.
    const c = s.conversations[conversationId];
    if (c && c.title === "Yangi suhbat") {
      const firstUser = c.messages.find((m) => m.role === "user");
      if (firstUser) s.setTitle(conversationId, firstUser.content.slice(0, 48).replace(/\s+/g, " "));
    }

    setStreaming(false);
    abortRef.current = null;

    // Learn durable facts from this exchange (server no-ops without a session).
    // MUHIM: Blind Prompting yoqilgan bo'lsa, serverga masked matnni yuboramiz —
    // aks holda "AI ko'rmaydi" va'dasi memory extraction bosqichida buziladi.
    if (!failed && text) {
      const firstUser = [...history].reverse().find((mm) => mm.role === "user");
      if (firstUser && typeof firstUser.content === "string") {
        const userForMemory = state0.blindPrompting
          ? mask(firstUser.content).masked
          : firstUser.content;
        const answerForMemory = hasMask ? text : text; // model allaqachon masked tokenlarda javob berdi
        void rememberExchange(userForMemory, answerForMemory).catch(() => {});
      }
    }

    // Mirror to Supabase when a session exists (no-op otherwise).
    const final = useChat.getState().conversations[conversationId];
    if (final) {
      void syncConversation({
        ...final,
        messages: final.messages
          .filter((m) => m.status !== "error" && m.content)
          .map(({ id, role, content, modelId, citations: cit, createdAt }) => ({
            id,
            role,
            content,
            modelId: modelId ?? null,
            citations: cit ?? null,
            createdAt,
          })),
      }).catch(() => {});
    }
  }, []);

  const send = useCallback(
    async (text: string, attachments?: Attachment[], docIds?: string[]) => {
      const state = useChat.getState();
      let conversationId = state.activeId;
      if (!conversationId || !state.conversations[conversationId]) {
        conversationId = state.createConversation(state.modelId, state.research).id;
      }
      const user: ChatMessage = {
        id: uuid(),
        role: "user",
        content: text,
        attachments: attachments?.length ? attachments : undefined,
        createdAt: new Date().toISOString(),
        status: "done",
      };
      state.appendMessage(conversationId, user);

      // Image-generation shortcut: skip the LLM and call the image endpoint.
      if (detectImageIntent(text) && !attachments?.length) {
        const assistant: ChatMessage = {
          id: uuid(),
          role: "assistant",
          content: "Rasm chizilyapti...",
          createdAt: new Date().toISOString(),
          status: "streaming",
        };
        state.appendMessage(conversationId, assistant);
        setStreaming(true);
        try {
          const res = await fetch("/api/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text }),
          });
          const data = (await res.json()) as { urls?: string[]; error?: string };
          if (!res.ok || !data.urls?.length) {
            useChat.getState().updateMessage(conversationId, assistant.id, {
              status: "error",
              error: data.error ?? "Rasm yaratilmadi",
            });
          } else {
            const md = data.urls.map((u) => `![](${u})`).join("\n\n");
            useChat.getState().updateMessage(conversationId, assistant.id, {
              status: "done",
              content: `Mana chizilgan rasm:\n\n${md}`,
            });
          }
        } catch (err) {
          useChat.getState().updateMessage(conversationId, assistant.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Ulanish xatosi",
          });
        }
        setStreaming(false);
        return;
      }

      const history = useChat.getState().conversations[conversationId]?.messages ?? [user];
      await run(conversationId, history, docIds);
    },
    [run],
  );

  const regenerate = useCallback(async () => {
    const state = useChat.getState();
    const id = state.activeId;
    if (!id) return;
    const conv = state.conversations[id];
    if (!conv) return;
    const last = conv.messages[conv.messages.length - 1];
    const history = last?.role === "assistant" ? conv.messages.slice(0, -1) : conv.messages;
    if (last?.role === "assistant") {
      // Drop the previous answer, then stream a fresh one.
      useChat.setState((s) => ({
        conversations: { ...s.conversations, [id]: { ...conv, messages: history } },
      }));
    }
    await run(id, history);
  }, [run]);

  /**
   * Foydalanuvchi o'z xabarini tahrirladi: o'sha xabardan keyingi hamma narsa
   * o'chiriladi, matn almashtiriladi va javob qaytadan olinadi (ChatGPT kabi).
   */
  const editAndResend = useCallback(
    async (messageId: string, text: string) => {
      const state = useChat.getState();
      const id = state.activeId;
      if (!id) return;
      const conv = state.conversations[id];
      const idx = conv?.messages.findIndex((m) => m.id === messageId) ?? -1;
      if (!conv || idx < 0 || conv.messages[idx].role !== "user") return;
      const clean = text.trim();
      if (!clean) return;
      abortRef.current?.abort();
      const history = [...conv.messages.slice(0, idx), { ...conv.messages[idx], content: clean }];
      useChat.setState((s) => ({
        conversations: { ...s.conversations, [id]: { ...conv, messages: history, updatedAt: new Date().toISOString() } },
      }));
      await run(id, history);
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { send, regenerate, editAndResend, stop, isStreaming };
}
