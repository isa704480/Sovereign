"use client";

import { useCallback, useRef, useState } from "react";
import { syncConversation } from "@/app/actions/chat";
import { rememberExchange } from "@/app/actions/memory";
import { streamChat } from "@/lib/chat/sse-client";
import { buildUserContent, type Attachment } from "@/lib/chat/attachments";
import { useChat, uuid, type ChatMessage } from "@/store/chat";

/** Maps stored messages to the API wire format, expanding attachments. */
function toWire(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content:
      m.role === "user" && m.attachments?.length ? buildUserContent(m.content, m.attachments) : m.content,
  }));
}

const HISTORY_LIMIT = 24;

/** Sends a message to the active (or a new) conversation and streams the reply. */
export function useSendMessage() {
  const [isStreaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (conversationId: string, history: ChatMessage[]) => {
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
    let citations: string[] | undefined;
    let skills: string[] | undefined;
    let failed: string | null = null;

    try {
      await streamChat({
        modelId: conv.modelId,
        research: conv.research,
        skills: useChat.getState().enabledSkills,
        messages: toWire(history.slice(-HISTORY_LIMIT)),
        signal: controller.signal,
        onEvent: (ev) => {
          const s = useChat.getState();
          if (ev.type === "text") {
            text += ev.text;
            s.updateMessage(conversationId, assistant.id, { content: text });
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
      s.updateMessage(conversationId, assistant.id, { status: "done", content: text, citations, skills });
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
    if (!failed && text) {
      const firstUser = [...history].reverse().find((mm) => mm.role === "user");
      if (firstUser && typeof firstUser.content === "string") {
        void rememberExchange(firstUser.content, text).catch(() => {});
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
    async (text: string, attachments?: Attachment[]) => {
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
      const history = useChat.getState().conversations[conversationId]?.messages ?? [user];
      await run(conversationId, history);
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

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { send, regenerate, stop, isStreaming };
}
