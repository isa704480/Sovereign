"use client";

import type { StreamEvent } from "@/lib/ai/providers";
import type { InquiryDomain, InquiryEvent, InquiryMode, InquiryReplyAnswer } from "@/lib/ai/inquiry/types";
import { DEFAULT_LANG, fmt, isLang, translate, type Lang } from "@/lib/i18n";

/**
 * Chuqur so'rash — so'rov tanasidagi `inquiry` obyekti (docs/INQUIRY.md §A.8, route `bodySchema.inquiry`).
 * Server `inquiry` hodisasini faqat so'rovda shu obyekt bo'lsa yuboradi (eski mijozlar buzilmaydi).
 */
export interface InquiryRequest {
  mode: InquiryMode;
  /** "Taxmin bilan javob ber" — triage o'tkaziladi, javob taxminlar bilan. */
  skip: boolean;
  /** Oxirgi navbatlarda o'tkazib yuborilgan kartalar soni (0..10). */
  recentSkips: number;
  /** Shu suhbatda allaqachon so'ralgan slotlar (≤ 20, har biri ≤ 40 belgi). */
  askedSlots: string[];
  /** Kartaga javob navbati (javoblar ≤ 6, har biri ≤ 400 belgi). */
  reply?: {
    inquiryId: string;
    round: number;
    answers: InquiryReplyAnswer[];
    domain?: InquiryDomain;
  };
}

/**
 * Mijoz qabul qiladigan hodisalar. T3 `InquiryEvent` ni `StreamEvent` union'iga qo'shgach bu
 * ortiqcha bo'ladi (union takrorni birlashtiradi), lekin shungacha ham tiplar to'g'ri.
 */
export type ClientStreamEvent = StreamEvent | InquiryEvent;

export interface StreamChatOptions {
  modelId: string;
  research: boolean;
  skills?: string[];
  /** Knowledge-base documents referenced with "@name" in the prompt. */
  docIds?: string[];
  /** Enabled skills the user wrote themselves — they live only on the device. */
  customSkills?: { name: string; instructions: string }[];
  /** Extra context, e.g. the Cowork folder's file list (names only). */
  context?: string;
  /** Interfeys tili — AI shu tilda javob beradi (foydalanuvchi boshqa tilda yozmasa). */
  lang?: string;
  /** Agent rejimi (dasturchi/tadqiqotchi/...) — maxsus ko'rsatma beradi. */
  agentMode?: string;
  /** Chuqur so'rash sozlamasi va javob navbati (yo'q bo'lsa server inquiry'ni ishlatmaydi). */
  inquiry?: InquiryRequest;
  /** content is a string, or a multimodal array (text + image parts). */
  messages: { role: "user" | "assistant" | "system"; content: unknown }[];
  signal?: AbortSignal;
  onEvent: (ev: ClientStreamEvent) => void;
}

/** Calls POST /api/chat and forwards SSE events to `onEvent`. */
export async function streamChat({
  modelId,
  research,
  skills,
  docIds,
  customSkills,
  context,
  lang,
  agentMode,
  inquiry,
  messages,
  signal,
  onEvent,
}: StreamChatOptions) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId,
      research,
      skills: skills ?? [],
      docIds: docIds ?? [],
      customSkills: customSkills ?? [],
      context: context ?? "",
      lang: lang ?? DEFAULT_LANG,
      agentMode: agentMode ?? "general",
      ...(inquiry ? { inquiry } : {}),
      messages,
    }),
    signal,
  });

  const uiLang: Lang = isLang(lang) ? lang : DEFAULT_LANG;

  if (!res.ok || !res.body) {
    // 413: Vercel so'rov tanasi limiti (~4.5MB) — katta fayl. Javob HTML/matn bo'ladi,
    // shuning uchun xom "Server xatosi (413)" o'rniga tushunarli, tarjima qilingan xabar.
    let message =
      res.status === 413
        ? translate(uiLang, "p3bTooLarge")
        : fmt(translate(uiLang, "p3bServerError"), { status: res.status });
    if (res.status !== 413) {
      try {
        const j = (await res.json()) as { error?: unknown };
        if (typeof j.error === "string" && j.error) message = j.error;
      } catch {
        /* ignore */
      }
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        onEvent({ type: "done" });
        return;
      }
      try {
        onEvent(JSON.parse(data) as ClientStreamEvent);
      } catch {
        /* ignore malformed */
      }
    }
  }
  // Server har doim [DONE] bilan yakunlaydi; usiz EOF — ulanish uzilgan (mas. funksiya
  // vaqt limiti). Kesilgan javob "muvaffaqiyatli" ko'rinmasin — "uzildi" belgisi chiqadi.
  onEvent({ type: "error", message: translate(uiLang, "uxInterrupted") });
}
