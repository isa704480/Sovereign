"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { syncConversation } from "@/app/actions/chat";
import { rememberExchange } from "@/app/actions/memory";
import { logInquiryOutcome, rememberInquiryFacts } from "@/app/actions/inquiry";
import { createMaskSession, mask } from "@/lib/ai/blind-prompting";
import { detectImageIntent } from "@/lib/chat/image-intent";
import { detectVideoIntent, videoAvailable } from "@/lib/chat/video-intent";
import { streamChat } from "@/lib/chat/sse-client";
import { buildUserContent, type Attachment } from "@/lib/chat/attachments";
import { emptyThinking, finishThinking, pushReasoning } from "@/lib/chat/thinking";
import {
  CUSTOM_SKILL_PREFIX,
  INQUIRY_WIRE,
  buildInquiryRequest,
  isInquiryDomain,
  useChat,
  uuid,
  type ChatMessage,
  type InquiryReplyMeta,
  type InquiryState,
  type Project,
} from "@/store/chat";
import { fmt, translate, type Lang, type TKey } from "@/lib/i18n";
import { splitErrorMarkers } from "@/lib/ai/inquiry/limit-codes";
import { cleanText, isSecretRequest } from "@/lib/ai/inquiry/sanitize";
import { detectHighStakes, isEmergency } from "@/lib/ai/inquiry/playbooks";
import {
  INQUIRY_TUNING,
  SENSITIVE_DOMAINS,
  STAKES,
  type InquiryDomain,
  type InquiryEvent,
  type InquiryOutcome,
  type InquiryQuestion,
  type QuestionKind,
} from "@/lib/ai/inquiry/types";

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
  return text
    .replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g, (_m, alt: string) => `[image${alt ? `: ${alt}` : ""}]`)
    .replace(/!\[[^\]]*\]\(data:video\/[^)]+\)/g, "[video]");
}

/**
 * Server sinxroni uchun: yaratilgan rasm/video (data: URL, yuzlab KB–MB) server action
 * tana limitidan oshib, butun suhbat hech qachon sinxronlanmasdi. Serverga faqat
 * tarjima qilingan belgi ketadi; asl media shu qurilmada qoladi (mergeFromServer uni saqlaydi).
 * https:// havolali media o'zgarishsiz qoladi (kichik).
 */
function forSync(text: string, lang: Lang): string {
  if (!text.includes("](data:")) return text;
  return text
    .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, `*[${translate(lang, "p9wImageLocalOnly")}]*`)
    .replace(/!\[[^\]]*\]\(data:video\/[^)]+\)/g, `*[${translate(lang, "p9wVideoLocalOnly")}]*`);
}

/** Suhbatni Supabase'ga nusxalaydi (sessiya bo'lmasa server no-op). */
function mirrorToServer(conversationId: string) {
  const s = useChat.getState();
  const conv = s.conversations[conversationId];
  if (!conv) return;
  void syncConversation({
    id: conv.id,
    title: conv.title,
    modelId: conv.modelId,
    research: conv.research,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages
      .filter((m) => m.status !== "error" && m.status !== "streaming" && m.content)
      .map(({ id, role, content, modelId, citations: cit, createdAt }) => ({
        id,
        role,
        content: forSync(content, s.lang),
        modelId: modelId ?? null,
        citations: cit ?? null,
        createdAt,
      })),
  }).catch(() => {});
}

/**
 * "+" → "Video yaratish" rejimidagi so'rovlar (matnda "video" so'zi bo'lmasa ham).
 * ChatMessage.kind faqat "image" ni qabul qiladi — sessiya ichida id bo'yicha eslaymiz,
 * shunda "qayta yaratish"/tahrirlash ham video yo'lidan boradi.
 */
const videoRequestIds = new Set<string>();

/** Matndan aniqlangan video so'rovi — faqat server video'ni qo'llasa (kalit sozlangan). */
async function isVideoRequest(m: ChatMessage): Promise<boolean> {
  if (m.kind === "video" || videoRequestIds.has(m.id)) return true;
  if (m.kind === "image" || m.attachments?.length || typeof m.content !== "string") return false;
  return detectVideoIntent(m.content) && (await videoAvailable());
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
    // Blind Prompting yoqilganda BARCHA user xabarlari (nafaqat oxirgi) va avvalgi assistant
    // javoblari ham maskalanadi: saqlangan javob mijozda asl qiymatlarga qaytarilgan (applyTokenMap),
    // aks holda 2-navbatda PII assistant matni orqali ochiq ketardi. Bitta sessiya — bir qiymat
    // har doim bir xil token oladi.
    const isMaskable = blind && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
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

// ── Chuqur so'rash (docs/INQUIRY.md §A.7–A.8) ────────────────────────────────

const Q_KINDS: readonly QuestionKind[] = ["single", "multi", "text"];
const PROFESSIONALS = ["lawyer", "doctor", "financial_advisor"] as const;

/**
 * Server `inquiry` hodisasini himoyaviy tekshiradi (server allaqachon tozalagan — bu ikkinchi qatlam):
 * faqat oddiy matn (markdown/HTML/URL/bidi olib tashlanadi), uzunlik chegaralari, sir so'raydigan
 * savollar tashlanadi (AC-9). Blind Prompting bo'lsa mask tokenlari asl qiymatga qaytariladi (EC-6).
 */
export function normalizeInquiryEvent(raw: unknown, tokenMap: Record<string, string> | null): InquiryEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "inquiry" || (r.phase !== "ask" && r.phase !== "followup")) return null;
  const inquiryId = typeof r.inquiryId === "string" ? r.inquiryId.trim().slice(0, 64) : "";
  if (!inquiryId) return null;
  const L = INQUIRY_TUNING.limits;
  const un = (s: string) => (tokenMap && s ? applyTokenMap(s, tokenMap) : s);
  const txt = (v: unknown, max: number) => un(cleanText(v, max));
  const maxQ = r.phase === "ask" ? INQUIRY_TUNING.maxQuestions.always : INQUIRY_TUNING.maxFollowups;

  const questions: InquiryQuestion[] = [];
  for (const item of Array.isArray(r.questions) ? r.questions : []) {
    if (questions.length >= maxQ) break;
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const rawText = cleanText(q.text, L.question);
    if (!rawText || isSecretRequest(rawText)) continue;
    const options = (Array.isArray(q.options) ? q.options : [])
      .map((o) => txt(o, L.option))
      .filter((o, i, a) => o && !isSecretRequest(o) && a.indexOf(o) === i)
      .slice(0, L.maxOptions);
    const kindIn = Q_KINDS.includes(q.kind as QuestionKind) ? (q.kind as QuestionKind) : undefined;
    const kind: QuestionKind = options.length ? (kindIn === "multi" ? "multi" : "single") : "text";
    const slot = cleanText(q.slot, L.slot) || `q${questions.length + 1}`;
    questions.push({
      id: `q${questions.length + 1}`,
      slot,
      text: un(rawText),
      why: txt(q.why, L.why),
      kind,
      options,
      critical: q.critical === true,
    });
  }
  if (!questions.length) return null;

  const round = Math.min(3, Math.max(1, Math.trunc(Number(r.round) || 1)));
  const professional = PROFESSIONALS.find((p) => p === r.professional);
  const stakes = STAKES.find((x) => x === r.stakes) ?? "medium";
  return {
    type: "inquiry",
    inquiryId,
    phase: r.phase,
    round,
    domain: isInquiryDomain(r.domain) ? r.domain : "general",
    stakes,
    goal: txt(r.goal, L.goal),
    questions,
    assumptions: (Array.isArray(r.assumptions) ? r.assumptions : [])
      .map((a) => txt(a, L.assumption))
      .filter(Boolean)
      .slice(0, L.maxAssumptions),
    ...(professional ? { professional } : {}),
  };
}

/**
 * Savol kartasining oddiy matn ko'rinishi — assistant xabari `content` i (§A.7): model tarixi va
 * `syncConversation` shu matnni ko'radi; kartasiz qurilmada ham o'qiladi.
 */
export function inquiryCardText(ev: InquiryEvent, lang: Lang): string {
  const lines = [translate(lang, "p14iCardIntro"), ""];
  ev.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.text}`);
    if (q.why) lines.push(`   ${fmt(translate(lang, "p14iCardWhy"), { why: q.why })}`);
    if (q.options.length) lines.push(`   ${fmt(translate(lang, "p14iCardOptions"), { options: q.options.join(" · ") })}`);
  });
  return lines.join("\n");
}

/** Foydalanuvchi kiritgan javob: bir qator, ≤ 400 belgi (server sxemasi). */
export function cleanAnswerValue(v: unknown): string {
  const parts = Array.isArray(v) ? v : [v];
  return parts
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, INQUIRY_WIRE.value);
}

/**
 * Kartaga javob — oddiy user xabari matni (§A.7): "Aniqlashtirish:\n- <savol> — <javob>".
 * Model javobni shu matndan o'qiydi; server dedup'i ham shu matnni ko'radi.
 */
export function formatInquiryReply(lang: Lang, pairs: { q: InquiryQuestion; value: string }[], partial: boolean): string {
  const lines = [translate(lang, "p14iReplyHeading"), ...pairs.map(({ q, value }) => `- ${questionLabel(q)} — ${value}`)];
  if (partial) lines.push("", translate(lang, "p14iReplyAssumeRest"));
  return lines.join("\n");
}

/**
 * Model yozgan savol matni user xabariga ko'chirilishidan oldin yana tozalanadi (R1): saqlangan eski karta
 * ham URL'siz bo'lsin — server `extractUrls` user xabaridagi havolani o'qiydi (exfiltratsiya yo'li).
 */
export function questionLabel(q: Pick<InquiryQuestion, "text">): string {
  return cleanText(q.text, INQUIRY_TUNING.limits.question);
}

/** Tanlangan variant (model matni) — qayta tozalanadi; foydalanuvchi o'zi yozgan "Boshqa…" matni o'zgarmaydi. */
export function safeOptionValue(q: Pick<InquiryQuestion, "options">, v: unknown): unknown {
  const one = (x: unknown) =>
    typeof x === "string" && q.options.includes(x) ? cleanText(x, INQUIRY_TUNING.limits.option) : x;
  return Array.isArray(v) ? v.map(one) : one(v);
}

/**
 * Sezgir navbat (R1-4): xotiraga avtomatik yozilmaydi. Karta/follow-up sohasi, server `meta.sensitive`
 * (triage sohasi yoki yuqori xavf regex'i) yoki mijozdagi deterministik tekshiruv (mode "off", triage
 * taymauti, eski server holatlari ham) — birortasi bo'lsa yetarli.
 */
export function isSensitiveTurn(opts: {
  domains: (InquiryDomain | undefined)[];
  serverSensitive?: boolean;
  userText?: string;
}): boolean {
  if (opts.serverSensitive) return true;
  if (opts.domains.some((d) => isSensitive(d))) return true;
  const t = opts.userText ?? "";
  return !!t && (!!detectHighStakes(t) || isEmergency(t));
}

function isSensitive(domain: InquiryDomain | undefined): boolean {
  return !!domain && SENSITIVE_DOMAINS.includes(domain);
}

/** Xabarni (avval faol suhbatdan) topadi. */
function findMessage(messageId: string): { conversationId: string; message: ChatMessage } | null {
  const s = useChat.getState();
  const ids = s.activeId ? [s.activeId, ...s.order.filter((id) => id !== s.activeId)] : s.order;
  for (const id of ids) {
    const message = s.conversations[id]?.messages.find((m) => m.id === messageId);
    if (message) return { conversationId: id, message };
  }
  return null;
}

/** Karta taqdiri telemetriyasi (§A.10) — fail-silent, har inquiryId uchun server bir marta yozadi. */
function reportOutcome(inquiryId: string, outcome: InquiryOutcome) {
  void logInquiryOutcome(inquiryId, outcome).catch(() => {});
}

/** Kartani yopadi: holat + telemetriya natijasi. */
function settleInquiry(conversationId: string, message: ChatMessage, state: InquiryState, outcome: InquiryOutcome) {
  useChat.getState().updateMessage(conversationId, message.id, { inquiryState: state });
  if (message.inquiry) reportOutcome(message.inquiry.inquiryId, outcome);
}

/** Suhbatdagi hali ochiq kartalarni yopadi (masalan, foydalanuvchi boshqa savol yozdi — EC-1). */
function closeOpenInquiries(conversationId: string) {
  const s = useChat.getState();
  for (const m of s.conversations[conversationId]?.messages ?? []) {
    if (m.inquiry && (m.inquiryState ?? "open") === "open") settleInquiry(conversationId, m, "ignored", "ignored");
  }
}

/** Sends a message to the active (or a new) conversation and streams the reply. */
export function useSendMessage(opts?: { memoryEnabled?: boolean }) {
  const [isStreaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Xotira o'chiq bo'lsa rememberExchange umuman chaqirilmaydi (server ham tekshiradi — chuqur himoya).
  const memoryEnabledRef = useRef(opts?.memoryEnabled);
  useEffect(() => {
    memoryEnabledRef.current = opts?.memoryEnabled;
  }, [opts?.memoryEnabled]);

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
    // "O'ylab javob": fikr matni + davomiylik (birinchi ↔ oxirgi fikr bo'lagi orasi).
    let think = emptyThinking();
    let citations: string[] | undefined;
    let skills: string[] | undefined;
    let failed: string | null = null;

    const state0 = useChat.getState();
    const { wire, tokenMap } = toWire(history.slice(-HISTORY_LIMIT), state0.blindPrompting, state0.lang);
    const hasMask = Object.keys(tokenMap).length > 0;
    const instant = state0.streamingSpeed === "instant";
    // Chuqur so'rash: sozlama + (bo'lsa) kartaga javob navbati — to'liq tarixdan (askedSlots/recentSkips).
    const inquiryReq = buildInquiryRequest(history, state0.inquiryMode);
    let askCard: InquiryEvent | null = null;
    let followup: InquiryEvent | null = null;
    let serverSensitive = false;

    try {
      await streamChat({
        modelId: conv.modelId,
        research: conv.research,
        thinking: state0.thinking,
        skills: state0.enabledSkills,
        // Only the custom skills the user switched on travel with the request.
        customSkills: state0.customSkills
          .filter((k) => state0.enabledSkills.includes(`${CUSTOM_SKILL_PREFIX}${k.id}`))
          .slice(0, 3)
          .map((k) => ({ name: k.name, instructions: k.instructions })),
        docIds,
        lang: state0.lang,
        agentMode: state0.agentMode,
        inquiry: inquiryReq,
        context: buildContext(state0.coworkOutline, state0.projects.find((p) => p.id === conv.projectId)),
        messages: wire,
        signal: controller.signal,
        onEvent: (ev) => {
          const s = useChat.getState();
          if (ev.type === "text") {
            text += ev.text;
            // "Darhol" (instant) rejimi: javob bo'laklab emas, tugagach butunicha ko'rsatiladi.
            if (!instant) {
              const shown = hasMask ? applyTokenMap(text, tokenMap) : text;
              s.updateMessage(conversationId, assistant.id, { content: shown });
            }
          } else if (ev.type === "reasoning") {
            think = pushReasoning(think, ev.text, Date.now());
            s.updateMessage(conversationId, assistant.id, { reasoning: think.reasoning, thinkingMs: think.durationMs });
          } else if (ev.type === "thinkingNote") {
            // Server: fikrlaydigan model topilmadi — javobni oddiy model berdi.
            s.updateMessage(conversationId, assistant.id, { thinkingNote: ev.text });
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
          } else if (ev.type === "meta") {
            // Haqiqatda javob bergan model (zaxira bo'lsa ham) va server hisoblagan token.
            const { type: _t, sensitive: _sens, ...meta } = ev;
            void _t;
            if (_sens === true) serverSensitive = true;
            s.updateMessage(conversationId, assistant.id, { meta, modelId: meta.served });
          } else if (ev.type === "inquiry") {
            // Savol kartasi (ask — javob modeli chaqirilmaydi) yoki javob ostidagi follow-up chip'lar.
            const inq = normalizeInquiryEvent(ev, hasMask ? tokenMap : null);
            if (!inq) return;
            if (inq.phase === "ask" && !text.trim()) {
              askCard = inq;
              s.updateMessage(conversationId, assistant.id, { inquiry: inq, inquiryState: "open" });
            } else {
              // Javob allaqachon oqayotgan bo'lsa "ask" ham follow-up chip sifatida ko'rsatiladi.
              followup = { ...inq, phase: "followup", questions: inq.questions.slice(0, INQUIRY_TUNING.maxFollowups) };
              s.updateMessage(conversationId, assistant.id, { inquiry: followup, inquiryState: "open" });
            }
          } else if (ev.type === "error") {
            // Boshidagi "[limit]" / "[upgrade]" / "[upgrade:ultra]" belgilari (limit-codes.ts):
            // upgrade — tarif oynasi; limit — foydalanuvchi tarifi tugagan (Cowork/mahalliy model CTA).
            const mk = splitErrorMarkers(ev.message);
            failed = mk.text || ev.message;
            if (mk.upgrade || mk.limit) {
              window.dispatchEvent(
                new CustomEvent("sovereign:upgrade", { detail: { reason: failed, plan: mk.plan, limit: mk.limit } }),
              );
            }
          }
        },
      });
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        // Brauzer tarmoq xatosi ("Failed to fetch" / "Load failed") inglizcha — foydalanuvchiga tarjima.
        // Server/SSE xatolari sse-client'da allaqachon tarjima qilingan holda keladi.
        failed = translate(useChat.getState().lang, "chConnectionError");
      }
    }

    think = finishThinking(think);
    const s = useChat.getState();
    const card = askCard as InquiryEvent | null;
    if (card && !text.trim()) {
      // "ask": javob yo'q — xabar savol kartasi. content = oddiy matn (tarix/sinxron uchun).
      s.updateMessage(conversationId, assistant.id, {
        status: "done",
        content: inquiryCardText(card, s.lang),
        inquiry: card,
        inquiryState: "open",
        error: undefined,
      });
    } else if (failed && !text) {
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
        ...(think.durationMs === undefined ? {} : { thinkingMs: think.durationMs }),
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
    // Chuqur so'rash: sezgir sohadagi (legal/medical/financial) inquiry navbati avtomatik xotiraga
    // yozilmaydi — faqat foydalanuvchi kartadagi "eslab qol" orqali rozilik bersa (§A.7).
    const followupEv = followup as InquiryEvent | null;
    const lastUserMsg = [...history].reverse().find((mm) => mm.role === "user");
    const sensitiveTurn = isSensitiveTurn({
      domains: [inquiryReq.reply?.domain, followupEv?.domain, card?.domain],
      serverSensitive,
      userText: typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "",
    });
    if (!failed && text && !sensitiveTurn && memoryEnabledRef.current !== false) {
      const firstUser = lastUserMsg;
      if (firstUser && typeof firstUser.content === "string") {
        const userForMemory = state0.blindPrompting
          ? mask(firstUser.content).masked
          : firstUser.content;
        const answerForMemory = hasMask ? text : text; // model allaqachon masked tokenlarda javob berdi
        void rememberExchange(userForMemory, answerForMemory).catch(() => {});
      }
    }

    // Mirror to Supabase when a session exists (no-op otherwise).
    mirrorToServer(conversationId);
  }, []);

  /**
   * Rasm/video yaratish: LLM'siz to'g'ridan-to'g'ri /api/image yoki /api/video. "To'xtatish"
   * (stop) bekor qiladi; kutish paytida o'tgan soniyalar ko'rsatiladi; server HTML/xato
   * qaytarsa — tarjima qilingan xabar.
   */
  const generateMedia = useCallback(async (conversationId: string, prompt: string, kind: "image" | "video") => {
    const lang = useChat.getState().lang;
    const isVideo = kind === "video";
    const keys: Record<"busy" | "elapsed" | "failed" | "stopped" | "here", TKey> = isVideo
      ? { busy: "p4eVideoRendering", elapsed: "p4eVideoElapsed", failed: "p4eVideoFailed", stopped: "p4eVideoStopped", here: "p4eVideoHere" }
      : { busy: "chImageDrawing", elapsed: "uxImageElapsed", failed: "chImageFailed", stopped: "uxImageStopped", here: "chImageHere" };
    const drawing = translate(lang, keys.busy);
    const placeholder = (sec: number) => `${drawing}\n\n_${fmt(translate(lang, keys.elapsed), { s: sec })}_`;
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
      const res = await fetch(isVideo ? "/api/video" : "/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Maxfiy rejim: PII rasm/video provayderiga (tashqi xizmat) ochiq ketmasin.
        body: JSON.stringify({ prompt: useChat.getState().blindPrompting ? mask(prompt).masked : prompt }),
        signal: controller.signal,
      });
      let data: { urls?: string[]; url?: string; error?: string; upgrade?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // HTML xato sahifasi / bo'sh javob — xom "Unexpected token <" ko'rsatmaymiz.
        data = {};
      }
      const urls = isVideo ? (typeof data.url === "string" && data.url ? [data.url] : []) : (data.urls ?? []);
      if (!res.ok || !urls.length) {
        const reason = typeof data.error === "string" && data.error ? data.error : translate(lang, keys.failed);
        fail(reason);
        // Kunlik limit: server `upgrade` qaytaradi — tarif oynasini ochamiz (chat yo'li kabi).
        if (data.upgrade) window.dispatchEvent(new CustomEvent("sovereign:upgrade", { detail: { reason } }));
      } else {
        // Video ham rasm sintaksisida: Markdown faqat provayder URL / data:video/mp4 ni <video> qiladi.
        const md = urls.map((u) => `![${isVideo ? "video" : ""}](${u})`).join("\n\n");
        useChat.getState().updateMessage(conversationId, assistant.id, {
          status: "done",
          content: `${translate(lang, keys.here)}\n\n${md}`,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") fail(translate(lang, keys.stopped));
      else fail(translate(lang, keys.failed));
    } finally {
      clearInterval(tick);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
      }
      // Faqat rasm/videodan iborat yangi suhbat ham nom oladi (run() dagi kabi).
      const s = useChat.getState();
      const c = s.conversations[conversationId];
      if (c && c.title === "Yangi suhbat") s.setTitle(conversationId, prompt.slice(0, 48).replace(/\s+/g, " "));
      // Faqat rasm/videodan iborat suhbat ham boshqa qurilmalarda ko'rinsin (media o'rnida belgi).
      mirrorToServer(conversationId);
    }
  }, []);

  const send = useCallback(
    async (text: string, attachments?: Attachment[], docIds?: string[], opts?: { image?: boolean; video?: boolean }) => {
      const state = useChat.getState();
      let conversationId = state.activeId;
      if (!conversationId || !state.conversations[conversationId]) {
        conversationId = state.createConversation(state.modelId, state.research).id;
      }
      // Video: "+" → "Video yaratish" (majburiy) yoki matndan aniqlangan so'rov (server qo'llasa).
      // Rasmdan oldin tekshiriladi: "make a video of a cat drawing" rasm emas.
      const isVideo =
        !opts?.image &&
        (!!opts?.video || (!attachments?.length && detectVideoIntent(text) && (await videoAvailable())));
      // Rasm: "+" → "Rasm yaratish" (majburiy) yoki matndan aniqlangan so'rov.
      const isImage = !isVideo && (!!opts?.image || (detectImageIntent(text) && !attachments?.length));
      const user: ChatMessage = {
        id: uuid(),
        role: "user",
        content: text,
        attachments: attachments?.length ? attachments : undefined,
        createdAt: new Date().toISOString(),
        status: "done",
        // Reload'dan keyin ham qayta urinish/tahrir shu yo'ldan borsin (store'da saqlanadi).
        ...(isImage ? { kind: "image" as const } : isVideo ? { kind: "video" as const } : {}),
      };
      if (isVideo) videoRequestIds.add(user.id);
      // Kartaga javob bermay yangi narsa yozildi — ochiq karta/chip'lar "ignored" (EC-1).
      closeOpenInquiries(conversationId);
      state.appendMessage(conversationId, user);

      if (isVideo || isImage) {
        await generateMedia(conversationId, text, isVideo ? "video" : "image");
        return;
      }

      const history = useChat.getState().conversations[conversationId]?.messages ?? [user];
      await run(conversationId, history, docIds);
    },
    [run, generateMedia],
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
    // Rasm/video so'rovi bo'lsa — qayta urinish ham shu yo'ldan boradi.
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (lastUser && typeof lastUser.content === "string" && (await isVideoRequest(lastUser))) {
      await generateMedia(id, lastUser.content, "video");
      return;
    }
    // kind: "image" — "+ → Rasm" rejimidagi so'rov (matnda fe'l bo'lmasa ham rasm).
    if (
      lastUser &&
      typeof lastUser.content === "string" &&
      (lastUser.kind === "image" || (!lastUser.attachments?.length && detectImageIntent(lastUser.content)))
    ) {
      await generateMedia(id, lastUser.content, "image");
      return;
    }
    await run(id, history);
  }, [run, generateMedia]);

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
      // Rasm/video so'rovi tahrirlansa — javob ham rasm/video bo'ladi (matnli LLM'ga ketmaydi).
      const edited = history[history.length - 1];
      if (await isVideoRequest(edited)) {
        await generateMedia(id, clean, "video");
        return;
      }
      if (edited.kind === "image" || (!edited.attachments?.length && detectImageIntent(clean))) {
        await generateMedia(id, clean, "image");
        return;
      }
      await run(id, history);
    },
    [run, generateMedia],
  );

  /** Kartaga javob / o'tkazish / chip: user xabarini qo'shib, oddiy matnli yo'l bilan javob oladi. */
  const replyTo = useCallback(
    async (conversationId: string, text: string, inquiryReply?: InquiryReplyMeta) => {
      const s = useChat.getState();
      const user: ChatMessage = {
        id: uuid(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        status: "done",
        ...(inquiryReply ? { inquiryReply } : {}),
      };
      s.appendMessage(conversationId, user);
      const history = useChat.getState().conversations[conversationId]?.messages ?? [user];
      await run(conversationId, history);
    },
    [run],
  );

  /**
   * "Taxmin bilan javob ber" (§A.7): karta "skipped", so'rov `inquiry.skip = true` bilan ketadi va
   * shu suhbatda keyingi navbatlarda karta chiqmaydi (`recentSkips`, AC-3).
   */
  const skipInquiry = useCallback(
    async (messageId: string) => {
      const found = findMessage(messageId);
      const inq = found?.message.inquiry;
      if (!found || !inq || inq.phase !== "ask" || (found.message.inquiryState ?? "open") !== "open") return;
      settleInquiry(found.conversationId, found.message, "skipped", "skipped");
      const lang = useChat.getState().lang;
      await replyTo(found.conversationId, translate(lang, "p14iSkipMessage"), {
        inquiryId: inq.inquiryId,
        round: inq.round,
        domain: inq.domain,
        skip: true,
        answers: [],
      });
    },
    [replyTo],
  );

  /**
   * Savol kartasiga javob (§A.7): `answers` — savol id ("q1".."q5") → tanlov / matn (multi — massiv).
   * Javob oddiy user xabari sifatida ("Aniqlashtirish: …") ketadi, `inquiry.reply` bilan.
   * Hech bir savolga javob berilmasa — "Taxmin bilan javob ber" bilan bir xil.
   * `remember` — kartadagi "Bu faktlarni eslab qol" (rozilik, default o'chiq): javoblar alohida
   * `rememberInquiryFacts` orqali (server PII filtri bilan) xotiraga yoziladi.
   */
  const answerInquiry = useCallback(
    async (messageId: string, answers: Record<string, string | string[]>, opts?: { remember?: boolean }) => {
      const found = findMessage(messageId);
      const inq = found?.message.inquiry;
      if (!found || !inq || inq.phase !== "ask" || (found.message.inquiryState ?? "open") !== "open") return;
      const pairs = inq.questions
        .map((q) => ({ q, value: cleanAnswerValue(safeOptionValue(q, answers?.[q.id])) }))
        .filter((p) => p.value);
      if (!pairs.length) {
        await skipInquiry(messageId);
        return;
      }
      settleInquiry(found.conversationId, found.message, "answered", "answered");
      const { lang, blindPrompting } = useChat.getState();
      if (opts?.remember) {
        // Blind Prompting: xotiraga ham maskalangan qiymat ketadi (rememberExchange bilan bir xil va'da).
        const facts = pairs.slice(0, INQUIRY_WIRE.maxAnswers).map(({ q, value }) => ({
          slot: q.slot,
          value: blindPrompting ? mask(value).masked.slice(0, INQUIRY_WIRE.value) : value,
          label: (blindPrompting ? mask(questionLabel(q)).masked : questionLabel(q)).slice(0, 120),
        }));
        // R2-8: natija kartada ko'rsatiladi (jim xato emas). PII filtri hammasini tashlasa ham ok — "failed" emas.
        const convId = found.conversationId;
        const msgId = found.message.id;
        void rememberInquiryFacts(facts, inq.domain)
          .then((r) => (r.ok ? (r.added > 0 ? "saved" : null) : "failed"))
          .catch(() => "failed" as const)
          .then((m) => {
            if (m) useChat.getState().updateMessage(convId, msgId, { inquiryMemory: m });
          });
      }
      await replyTo(found.conversationId, formatInquiryReply(lang, pairs, pairs.length < inq.questions.length), {
        inquiryId: inq.inquiryId,
        round: inq.round,
        domain: inq.domain,
        skip: false,
        answers: pairs.slice(0, INQUIRY_WIRE.maxAnswers).map(({ q, value }) => ({ slot: q.slot, value })),
      });
    },
    [replyTo, skipInquiry],
  );

  /**
   * Javob ostidagi follow-up chip (§A.7): oddiy yangi user xabari ("savol — tanlov"), yangi navbat
   * (round 0). Rasm/video aniqlashsiz — chip matni media so'rovi bo'lib ketmasin.
   */
  const answerFollowup = useCallback(
    async (messageId: string, questionId: string, value: string) => {
      const found = findMessage(messageId);
      const inq = found?.message.inquiry;
      if (!found || !inq || inq.phase !== "followup" || (found.message.inquiryState ?? "open") !== "open") return;
      const q = inq.questions.find((x) => x.id === questionId);
      if (!q) return;
      const v = cleanAnswerValue(safeOptionValue(q, value));
      const label = questionLabel(q);
      if (!v || !label) return;
      settleInquiry(found.conversationId, found.message, "answered", "followup_clicked");
      closeOpenInquiries(found.conversationId);
      await replyTo(found.conversationId, `${label} — ${v}`);
    },
    [replyTo],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { send, regenerate, editAndResend, stop, isStreaming, answerInquiry, skipInquiry, answerFollowup };
}
