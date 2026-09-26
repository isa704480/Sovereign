"use client";

import { AlertTriangle, Check, ChevronDown, Copy, Globe, Lightbulb, Pencil, RefreshCw, ThumbsDown, ThumbsUp, Volume2, VolumeX, Zap } from "lucide-react";
import { motion } from "motion/react";
import { memo, useMemo, useState } from "react";
import { MODEL_BY_ID } from "@/config/models";
import { SKILL_BY_ID } from "@/config/skills";
import { attachmentGlyph } from "@/lib/chat/attachments";
import { useLang, useT, type ChatMessage } from "@/store/chat";
import { fmt, type Lang } from "@/lib/i18n";
import { localeOf } from "@/lib/locales/chat-data";
import { plural } from "@/lib/plural";
import { skillText } from "@/lib/locales/panels-data";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnswerMetaBadge } from "./AnswerMetaBadge";
import { Markdown } from "./Markdown";
import { ModelAvatar } from "./ModelAvatar";
import { TypingIndicator } from "./TypingIndicator";
import { ClaimsWarning, isFactIssue, VerifierPanel } from "./VerifierPanel";
import { useTheme } from "./theme-context";

interface MessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  /** Ovozli o'qish: barqaror callback (memo buzilmasin) va shu xabar o'qilyaptimi. */
  onTts?: (id: string, text: string) => void;
  ttsSpeaking?: boolean;
}

/** 👍/👎 — shu qurilmada saqlanadi (serverga yuborilmaydi). */
type Feedback = "up" | "down";
const FEEDBACK_KEY = "sov-feedback";

function readFeedback(id: string): Feedback | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? "{}") as Record<string, Feedback>;
    return all[id] ?? null;
  } catch {
    return null;
  }
}

function writeFeedback(id: string, v: Feedback | null) {
  try {
    const all = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? "{}") as Record<string, Feedback>;
    if (v) all[id] = v;
    else delete all[id];
    // Cheksiz o'smasin — oxirgi 500 ta baho.
    const entries = Object.entries(all).slice(-500);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* saqlab bo'lmadi — faqat shu sessiyada */
  }
}

/** Xabar ostidagi kichik ikonka-tugma: 32px nishon. */
const ACTION_BTN = "inline-flex size-8 items-center justify-center rounded-md hover:bg-white/10";

/** Iqtibos domeni; noto'g'ri URL render'da xato otib butun ro'yxatni buzmasin. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function timeLabel(iso: string, lang: Lang) {
  try {
    return new Date(iso).toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * memo: oqimda faqat oxirgi xabar o'zgaradi — store o'zgarmagan xabarlarning obyektini
 * saqlaydi, shuning uchun qolganlari har token'da qayta render qilinmaydi.
 */
export const MessageItem = memo(function MessageItem({ message, isLast, onRegenerate, onEdit, onTts, ttsSpeaking = false }: MessageItemProps) {
  const { theme, model: activeModel } = useTheme();
  const t = useT();
  const lang = useLang();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function submitEdit() {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== message.content) onEdit?.(message.id, text);
  }
  const [showReasoning, setShowReasoning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(() => readFeedback(message.id));
  function rate(v: Feedback) {
    const next = feedback === v ? null : v;
    setFeedback(next);
    writeFeedback(message.id, next);
  }
  const isUser = message.role === "user";
  const model = (message.modelId && MODEL_BY_ID[message.modelId]) || activeModel;
  const streaming = message.status === "streaming";
  const failed = message.status === "error";
  // Oqim yarmida uzildi: qisman matn saqlangan, xato ham bor.
  const interrupted = !streaming && !failed && !!message.error && !!message.content;
  const canRetry = isLast && !!onRegenerate;
  // Javobdan keyingi tekshiruvlar: fakt baholari (VerifierPanel) va ogohlantirishlar
  // (tasdiqlanmagan amal / manbasiz [n] — ClaimsWarning + matndagi belgi).
  const hasFacts = !!message.verifier?.some(isFactIssue);
  const unsourced = useMemo(
    () => message.verifier?.flatMap((i) => (i.kind === "citation" ? (i.markers ?? []) : [])),
    [message.verifier],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  /* ---------- user ---------- */
  if (isUser) {
    if (!theme.layout.userBubble) {
      // Perplexity: the query becomes the section heading.
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="group pt-2"
        >
          <h2 className="t-display text-2xl font-semibold leading-snug md:text-[28px]" style={{ color: "var(--t-text)" }}>
            {message.content}
          </h2>
        </motion.div>
      );
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="group flex justify-end"
      >
        <div className="flex max-w-[78%] flex-col items-end gap-1.5">
          {message.attachments?.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              {message.attachments.map((a) =>
                a.kind === "image" && a.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a.id}
                    src={a.dataUrl}
                    alt={a.name}
                    className="tt max-h-48 rounded-xl object-cover"
                    style={{ border: "1px solid var(--t-border)" }}
                  />
                ) : a.kind === "video" && a.previewUrl ? (
                  <video key={a.id} src={a.previewUrl} controls className="max-h-48 rounded-xl" />
                ) : a.kind === "audio" && a.previewUrl ? (
                  <audio key={a.id} src={a.previewUrl} controls />
                ) : (
                  <span
                    key={a.id}
                    className="tt inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                    style={{ background: "var(--t-user-bubble)", color: "var(--t-text)" }}
                  >
                    {attachmentGlyph(a.kind)} <span className="max-w-[160px] truncate">{a.name}</span>
                  </span>
                ),
              )}
            </div>
          ) : null}
          {editing ? (
            <div className="w-full min-w-[min(280px,calc(100vw-5rem))]">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Telefon klaviaturasida Shift+Enter yo'q — u yerda Enter yangi qator, yuborish tugma bilan.
                  const touch = window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true;
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (!touch || e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditing(false);
                  }
                }}
                rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                aria-label={t("edit")}
                className="tt w-full resize-none rounded-2xl border px-4 py-2.5 text-base leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] md:text-[15px]"
                style={{ background: "var(--t-user-bubble)", color: "var(--t-text)", borderColor: "var(--t-primary)" }}
              />
              <div className="mt-1.5 flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2.5 py-1" style={{ color: "var(--t-text-muted)" }}>
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  className="rounded-lg px-2.5 py-1 font-semibold text-white"
                  style={{ background: "var(--t-primary)" }}
                >
                  {t("send")} ↵
                </button>
              </div>
            </div>
          ) : (
            message.content && (
              <div
                className="tt whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-relaxed"
                style={{
                  // Sozlamalar → matn o'lchami (MessageList --chat-fs beradi).
                  fontSize: "var(--chat-fs, 15px)",
                  background: "var(--t-user-bubble)",
                  color: "var(--t-text)",
                  borderRadius:
                    theme.id === "chatgpt" || theme.id === "gemini"
                      ? "var(--t-input-radius)"
                      : "18px 18px 4px 18px",
                }}
              >
                {message.content}
              </div>
            )
          )}
          {!editing && (
            <div
              className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              style={{ color: "var(--t-text-muted)" }}
            >
              <span className="mr-1 text-[11px]">{timeLabel(message.createdAt, lang)}</span>
              <button type="button" onClick={copy} className={ACTION_BTN} title={t("copy")} aria-label={copied ? t("copied") : t("copy")}>
                {copied ? <Check className="size-3.5" style={{ color: "var(--t-accent)" }} /> : <Copy className="size-3.5" />}
              </button>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                  className={ACTION_BTN}
                  title={t("edit")}
                  aria-label={t("edit")}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  /* ---------- assistant ---------- */
  const flat = !theme.layout.aiBubble;
  const showAvatar = theme.layout.avatar !== "none";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.7 }}
      className="group flex gap-3"
    >
      {showAvatar && (
        <div className="pt-1">
          <ModelAvatar model={model} size={28} glow={streaming} />
        </div>
      )}

      <div className={cn("min-w-0 flex-1", flat ? "max-w-full" : "max-w-[85%]")}>
        {message.route && (
          <div className="mb-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-primary) 6%, transparent)" }}>
            <div className="flex items-center gap-1.5 font-medium" style={{ color: "var(--t-accent)" }}>
              ✦ SOVEREIGN Auto
            </div>
            <p className="mt-1" style={{ color: "var(--t-text-muted)" }}>{message.route.reason}</p>
            {message.route.steps.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {message.route.steps.map((st, i) => {
                  const sm = MODEL_BY_ID[st.modelId];
                  return (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <span style={{ color: "var(--t-text-muted)" }}>→</span>}
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                        style={{ borderColor: `${sm?.primary ?? "#5B50F0"}55`, color: sm?.primary ?? "var(--t-text)" }}
                      >
                        {st.kind === "research" ? "🌐" : sm?.glyph} {sm?.shortName ?? shortModelId(st.modelId)}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {message.reasoning ? (
          <div className="mb-3 overflow-hidden rounded-xl border" style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-text) 3%, transparent)" }}>
            <button type="button" onClick={() => setShowReasoning((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>
              <Lightbulb className="size-3.5" style={{ color: "var(--t-accent)" }} />
              <span className="flex-1 text-left font-medium">{t("chThinking")}{streaming && !message.content ? "..." : ""}</span>
              <ChevronDown className="size-3.5 transition-transform" style={{ transform: showReasoning ? "rotate(180deg)" : "none" }} />
            </button>
            {showReasoning && (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-[12px] leading-relaxed" style={{ color: "var(--t-text-muted)" }}>
                {message.reasoning}
              </div>
            )}
          </div>
        ) : null}

        {message.reading?.length ? (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
            title={message.reading.join("\n")}
          >
            <Globe className="size-3" style={{ color: "var(--t-accent)" }} />
            {message.reading.length === 1
              ? t("pageRead")
              : plural(lang, message.reading.length, { one: "p8bPagesOne", few: "p8bPagesFew", many: "p8bPagesMany" })}
          </div>
        ) : null}

        {message.switched?.length ? (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--warning, #F59E0B)55", color: "var(--t-text-muted)" }}
            title={message.switched.map((s) => `${s.from} → ${s.to}: ${s.reason}`).join("\n")}
          >
            <RefreshCw className="size-3" style={{ color: "var(--warning, #F59E0B)" }} />
            {t("modelSwitched")} ·{" "}
            {MODEL_BY_ID[message.switched[message.switched.length - 1].to]?.shortName ??
              shortModelId(message.switched[message.switched.length - 1].to)}
          </div>
        ) : null}

        {message.cache && (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
            title={fmt(t("chCacheTitle"), { n: Math.round(message.cache.similarity * 100) })}
          >
            <Zap className="size-3" style={{ color: "var(--t-accent)" }} />
            {t("fromCache")} · {Math.round(message.cache.similarity * 100)}% {t("cacheMatch")}
          </div>
        )}

        {theme.layout.showCitations && (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium" style={{ color: "var(--t-text-muted)" }}>
            <span style={{ color: model.primary }}>{model.glyph}</span> {t("answer")}
            {message.citations?.length ? <span>· {message.citations.length} {t("sourceWord")}</span> : null}
          </div>
        )}

        <div
          className={cn("tt", !flat && "px-4 py-3")}
          style={
            flat
              ? undefined
              : {
                  background: "var(--t-ai-bubble)",
                  borderRadius: "4px 18px 18px 18px",
                  borderLeft: `3px solid ${model.primary}`,
                }
          }
        >
          {failed ? (
            <div className="flex flex-wrap items-start gap-2 text-sm" style={{ color: "var(--error)" }} role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">{message.error ?? t("answerError")}</span>
              {canRetry && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors hover:bg-white/10"
                  style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                >
                  <RefreshCw className="size-3.5" /> {t("uxRetry")}
                </button>
              )}
            </div>
          ) : message.content ? (
            <>
              <Markdown content={message.content} citations={message.citations} unsourced={unsourced} />
              {streaming && (
                <span
                  className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse"
                  style={{ background: model.primary }}
                />
              )}
              {interrupted && (
                <div
                  className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2.5 text-xs"
                  style={{ borderColor: "var(--t-border)", color: "var(--warning, #F59E0B)" }}
                  role="status"
                >
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span title={message.error}>{t("uxInterrupted")}</span>
                  {canRetry && (
                    <>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={onRegenerate}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 font-semibold underline-offset-2 hover:underline"
                        style={{ color: "var(--t-accent)" }}
                      >
                        <RefreshCw className="size-3" /> {t("uxRetry")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="py-1">
              <TypingIndicator />
            </div>
          )}
        </div>

        {message.verifier && message.verifier.length > 0 && <ClaimsWarning issues={message.verifier} />}
        {message.verifier && hasFacts && <VerifierPanel issues={message.verifier} />}

        {message.skills?.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.skills.map((id) => {
              const sk = SKILL_BY_ID[id];
              if (!sk) return null;
              const skt = skillText(lang, sk);
              return (
                <span
                  key={id}
                  className="tt inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: `${sk.color}55`, color: sk.color, background: `color-mix(in srgb, ${sk.color} 10%, transparent)` }}
                  title={skt.description}
                >
                  {sk.glyph || "✦"} {skt.name}
                </span>
              );
            })}
          </div>
        ) : null}

        {message.citations?.length && !theme.layout.showCitations ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="tt inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px]"
                style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
              >
                <span className="font-semibold" style={{ color: model.primary }}>
                  {i + 1}
                </span>
                <span className="truncate">{hostOf(url)}</span>
              </a>
            ))}
          </div>
        ) : null}

        {!streaming && !failed && message.content && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs transition-opacity",
              isLast
                ? "opacity-70 focus-within:opacity-100"
                : "opacity-0 group-hover:opacity-70 group-focus-within:opacity-100 [@media(hover:none)]:opacity-70",
            )}
            style={{ color: "var(--t-text-muted)" }}
          >
            <button type="button" onClick={copy} className={ACTION_BTN} title={t("copy")} aria-label={copied ? t("copied") : t("copy")}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
            {onTts && (
              <button
                type="button"
                onClick={() => onTts(message.id, message.content)}
                className={ACTION_BTN}
                title={ttsSpeaking ? t("stop") : t("readAloud")}
                aria-label={ttsSpeaking ? t("stop") : t("readAloud")}
                aria-pressed={ttsSpeaking}
                style={ttsSpeaking ? { color: model.primary } : undefined}
              >
                {ttsSpeaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </button>
            )}
            {isLast && onRegenerate && (
              <button type="button" onClick={onRegenerate} className={ACTION_BTN} title={t("regenerate")} aria-label={t("regenerate")}>
                <RefreshCw className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => rate("up")}
              className={ACTION_BTN}
              title={t("helpful")}
              aria-label={t("helpful")}
              aria-pressed={feedback === "up"}
              style={feedback === "up" ? { color: "var(--t-accent)" } : undefined}
            >
              <ThumbsUp className={cn("size-3.5", feedback === "up" && "fill-current")} />
            </button>
            <button
              type="button"
              onClick={() => rate("down")}
              className={ACTION_BTN}
              title={t("notHelpful")}
              aria-label={t("notHelpful")}
              aria-pressed={feedback === "down"}
              style={feedback === "down" ? { color: "var(--t-accent)" } : undefined}
            >
              <ThumbsDown className={cn("size-3.5", feedback === "down" && "fill-current")} />
            </button>
            {!message.meta && <span className="ml-2 hidden sm:inline">{model.name}</span>}
          </div>
        )}
        {!streaming && !failed && message.content && message.meta && <AnswerMetaBadge meta={message.meta} />}
      </div>
    </motion.div>
  );
});

/** OmniRoute id → o'qiladigan nom: "cfp/deepseek-ai/deepseek-v4-flash-0731" → "deepseek-v4-flash-0731". */
function shortModelId(id: string): string {
  return id.split("/").pop() || id;
}
