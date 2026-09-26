"use client";

import { useCallback, useRef, useState } from "react";
import { syncConversation } from "@/app/actions/chat";
import { rememberExchange } from "@/app/actions/memory";
import { createMaskSession, mask } from "@/lib/ai/blind-prompting";
import { detectImageIntent } from "@/lib/chat/image-intent";
import { streamChat } from "@/lib/chat/sse-client";
import { buildUserContent, type Attachment } from "@/lib/chat/attachments";
import { CUSTOM_SKILL_PREFIX, useChat, uuid, type ChatMessage, type Project } from "@/store/chat";
import { fmt, translate, type Lang } from "@/lib/i18n";

/** Cowork papka ro'yxati + loyiha ko'rsatmasi — bitta kontekst matni (server 6000 belgi qabul qiladi). */
function buildContext(cowork: string | null, project?: Project): string | undefined {
  const parts: string[] = [];
  if (project?.instructions.trim()) parts.push(`LOYIHA "${project.name}" KO'RSATMALARI (har javobda amal qil):\n${project.instructions.trim()}`);
  if (cowork) parts.push(cowork);
  const text = parts.join("\n\n");
  return text ? text.slice(0, 6000) : undefined;
}

/** Server bitta matn qismiga 20 000 belgigacha ruxsat beradi (chat route zod sxemasi). */
const WIRE_TEXT_MAX = 20_000;

/** Uzun matnni server limitiga sig'diradi — butun suhbat 400 bilan buzilmasin. */
function clampText(text: string): string {
  if (text.length <= WIRE_TEXT_MAX) return text;
  const note = "\n\n[…truncated]";
  return text.slice(0, WIRE_TEXT_MAX - note.length) + note;
}

/**
 * Yaratilgan rasmlar (markdown ichidagi data:image URL, yuzlab KB) tarixda qolsa, keyingi
 * har xabar limitdan oshib 400 olardi — modelga faqat belgisi yuboriladi.
 */
function stripInlineImages(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g, (_m, alt: string) => `[image${alt ? `: ${alt}` : ""}]`);
}

/**
 * Maps stored messages to the API wire format. When Blind Prompting is on,
 * PII in user messages (and their attached file text) is replaced with tokens;
 * the returned `tokenMap` is used to un-mask the streamed answer on the client.
 */
function toWire(messages: ChatMessage[], blind: boolean, lang: Lang) {
  // Bitta sessiya — butun tarix bo'ylab token'lar noyob (turli qiymat → turli token).
  const session = createMaskSession();
  const tokenMap = session.tokenMap;
  const maskText = (text: string) => mask(text, session).masked;
  const wire = messages.map((m) => {
    // Blind Prompting yoqilganda BARCHA user xabarlari (nafaqat oxirgi)
    // maskalanadi — chunki avvalgi turlarda ham PII kelishi mumkin.
    const isMaskable = blind && m.role === "user" && typeof m.content === "string";
    let raw = isMaskable ? maskText(m.content as string) : m.content;
    if (typeof raw === "string") raw = stripInlineImages(raw);
    if (m.role === "user" && m.attachments?.length) {
      // Biriktirilgan fayl/transkript matni ham maskalanadi (aks holda PII ochiq ketardi).
      const atts = blind ? m.attachments.map((a) => (a.text ? { ...a, text: maskText(a.text) } : a)) : m.attachments;
      const built = buildUserContent(raw as string, atts, lang);
      return {
        role: m.role,
        content:
          typeof built === "string"
            ? clampText(built)
            : (built as { type: string; text?: string }[]).map((part) =>
                part.type === "text" && typeof part.text === "string" ? { ...part, text: clampText(part.text) } : part,
              ),
      };
    }
    return { role: m.role, content: typeof raw === "string" ? clampText(raw) : raw };
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

    // Bir vaqtda faqat bitta oqim: oldingisi (boshqa suhbatda qayta yaratish va h.k.)
    // to'xtatiladi — aks holda u boshqarib bo'lmaydigan bo'lib qolardi.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    let text = "";
    let reasoning = "";
    let citations: string[] | undefined;
    let skills: string[] | undefined;
    let failed: string | null = null;

    const state0 = useChat.getState();
    const { wire, tokenMap } = toWire(history.slice(-HISTORY_LIMIT), state0.blindPrompting, state0.lang);
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
        agentMode: state0.agentMode,
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
        failed = err instanceof Error ? err.message : translate(useChat.getState().lang, "chConnectionError");
      }
    }

    const s = useChat.getState();
    if (failed && !text) {
      s.updateMessage(conversationId, assistant.id, { status: "error", error: failed });
    } else if (!text) {
      // Birinchi tokengacha to'xtatildi: bo'sh "done" xabari abadiy typing-indikator bo'lib
      // qolardi — xato holatiga o'tkazamiz, shunda "Qayta urinish" ko'rinadi.
      s.updateMessage(conversationId, assistant.id, { status: "error", error: translate(s.lang, "p3bStopped") });
    } else {
      const finalContent = hasMask ? applyTokenMap(text, tokenMap) : text;
      // Oqim yarmida uzilsa — qisman matnni saqlaymiz va "uzildi · qayta urinish" ko'rsatamiz
      // (status "done" qoladi, shunda qisman javob ham sinxronlanadi).
      s.updateMessage(conversationId, assistant.id, {
        status: "done",
        content: finalContent,
        citations,
        skills,
        ...(failed ? { error: failed } : {}),
      });
    }

    // First exchange names the conversation.
    const c = s.conversations[conversationId];
    if (c && c.title === "Yangi suhbat") {
      const firstUser = c.messages.find((m) => m.role === "user");
      if (firstUser) s.setTitle(conversationId, firstUser.content.slice(0, 48).replace(/\s+/g, " "));
    }

    // Faqat o'zimiz egasi bo'lsak tozalaymiz: tahrirlash/qayta yaratish yangi oqimni
    // boshlagan bo'lsa, eski run uning Stop tugmasi va abortRef'ini o'chirib yubormasin.
    if (abortRef.current === controller) {
      abortRef.current = null;
      setStreaming(false);
    }

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

  /**
   * Rasm yaratish: LLM'siz to'g'ridan-to'g'ri /api/image. "To'xtatish" (stop) bekor qiladi;
   * kutish paytida o'tgan soniyalar ko'rsatiladi; server HTML/xato qaytarsa — tarjima qilingan xabar.
   */
  const generateImage = useCallback(async (conversationId: string, prompt: string) => {
    const lang = useChat.getState().lang;
    const drawing = translate(lang, "chImageDrawing");
    const placeholder = (sec: number) => `${drawing}\n\n_${fmt(translate(lang, "uxImageElapsed"), { s: sec })}_`;
    const assistant: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: placeholder(0),
      createdAt: new Date().toISOString(),
      status: "streaming",
    };
    useChat.getState().appendMessage(conversationId, assistant);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    const started = Date.now();
    const tick = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      useChat.getState().updateMessage(conversationId, assistant.id, { content: placeholder(sec) });
    }, 1000);

    const fail = (error: string) =>
      useChat.getState().updateMessage(conversationId, assistant.id, { status: "error", content: "", error });

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Maxfiy rejim: PII rasm provayderiga (tashqi xizmat) ochiq ketmasin.
        body: JSON.stringify({ prompt: useChat.getState().blindPrompting ? mask(prompt).masked : prompt }),
        signal: controller.signal,
      });
      let data: { urls?: string[]; error?: string; upgrade?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // HTML xato sahifasi / bo'sh javob — xom "Unexpected token <" ko'rsatmaymiz.
        data = {};
      }
      if (!res.ok || !data.urls?.length) {
        const reason = typeof data.error === "string" && data.error ? data.error : translate(lang, "chImageFailed");
        fail(reason);
        // Kunlik limit: server `upgrade` qaytaradi — tarif oynasini ochamiz (chat yo'li kabi).
        if (data.upgrade) window.dispatchEvent(new CustomEvent("sovereign:upgrade", { detail: { reason } }));
      } else {
        const md = data.urls.map((u) => `![](${u})`).join("\n\n");
        useChat.getState().updateMessage(conversationId, assistant.id, {
          status: "done",
          content: `${translate(lang, "chImageHere")}\n\n${md}`,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") fail(translate(lang, "uxImageStopped"));
      else fail(translate(lang, "chImageFailed"));
    } finally {
      clearInterval(tick);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
      }
      // Faqat rasmdan iborat yangi suhbat ham nom oladi (run() dagi kabi).
      const s = useChat.getState();
      const c = s.conversations[conversationId];
      if (c && c.title === "Yangi suhbat") s.setTitle(conversationId, prompt.slice(0, 48).replace(/\s+/g, " "));
    }
  }, []);

  const send = useCallback(
    async (text: string, attachments?: Attachment[], docIds?: string[], opts?: { image?: boolean }) => {
      const state = useChat.getState();
      let conversationId = state.activeId;
      if (!conversationId || !state.conversations[conversationId]) {
        conversationId = state.createConversation(state.modelId, state.research).id;
      }
      // Rasm: "+" → "Rasm yaratish" (majburiy) yoki matndan aniqlangan so'rov.
      const isImage = !!opts?.image || (detectImageIntent(text) && !attachments?.length);
      const user: ChatMessage = {
        id: uuid(),
        role: "user",
        content: text,
        attachments: attachments?.length ? attachments : undefined,
        createdAt: new Date().toISOString(),
        status: "done",
        ...(isImage ? { kind: "image" as const } : {}),
      };
      state.appendMessage(conversationId, user);

      if (isImage) {
        await generateImage(conversationId, text);
        return;
      }

      const history = useChat.getState().conversations[conversationId]?.messages ?? [user];
      await run(conversationId, history, docIds);
    },
    [run, generateImage],
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
    // Rasm so'rovi bo'lsa — qayta urinish ham rasm yo'lidan boradi.
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    // kind: "image" — "+ → Rasm" rejimidagi so'rov (matnda fe'l bo'lmasa ham rasm).
    if (
      lastUser &&
      typeof lastUser.content === "string" &&
      (lastUser.kind === "image" || (!lastUser.attachments?.length && detectImageIntent(lastUser.content)))
    ) {
      await generateImage(id, lastUser.content);
      return;
    }
    await run(id, history);
  }, [run, generateImage]);

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
      // Rasm so'rovi tahrirlansa — javob ham rasm bo'ladi (matnli LLM'ga ketmaydi).
      const edited = history[history.length - 1];
      if (edited.kind === "image" || (!edited.attachments?.length && detectImageIntent(clean))) {
        await generateImage(id, clean);
        return;
      }
      await run(id, history);
    },
    [run, generateImage],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { send, regenerate, editAndResend, stop, isStreaming };
}
