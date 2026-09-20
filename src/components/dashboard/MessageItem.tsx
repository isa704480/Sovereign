"use client";

import { AlertTriangle, Check, Copy, Globe, Pencil, RefreshCw, ThumbsDown, ThumbsUp, Volume2, VolumeX, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MODEL_BY_ID } from "@/config/models";
import { SKILL_BY_ID } from "@/config/skills";
import { attachmentGlyph } from "@/lib/chat/attachments";
import type { ChatMessage } from "@/store/chat";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { ModelAvatar } from "./ModelAvatar";
import { TypingIndicator } from "./TypingIndicator";
import { VerifierPanel } from "./VerifierPanel";
import { useTheme } from "./theme-context";

interface MessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  tts?: { speaking: boolean; onToggle: () => void };
}

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageItem({ message, isLast, onRegenerate, onEdit, tts }: MessageItemProps) {
  const { theme, model: activeModel } = useTheme();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function submitEdit() {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== message.content) onEdit?.(message.id, text);
  }
  const isUser = message.role === "user";
  const model = (message.modelId && MODEL_BY_ID[message.modelId]) || activeModel;
  const streaming = message.status === "streaming";
  const failed = message.status === "error";

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
            <div className="w-full min-w-[280px]">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                className="tt w-full resize-none rounded-2xl border px-4 py-2.5 text-[15px] leading-relaxed outline-none"
                style={{ background: "var(--t-user-bubble)", color: "var(--t-text)", borderColor: "var(--t-primary)" }}
              />
              <div className="mt-1.5 flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2.5 py-1" style={{ color: "var(--t-text-muted)" }}>
                  Bekor
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  className="rounded-lg px-2.5 py-1 font-semibold text-white"
                  style={{ background: "var(--t-primary)" }}
                >
                  Yuborish ↵
                </button>
              </div>
            </div>
          ) : (
            message.content && (
              <div
                className="tt whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-relaxed"
                style={{
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
              className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
              style={{ color: "var(--t-text-muted)" }}
            >
              <span className="mr-1 text-[11px]">{timeLabel(message.createdAt)}</span>
              <button type="button" onClick={copy} className="rounded-md p-1 hover:bg-white/10" title="Nusxa olish" aria-label="Nusxa olish">
                {copied ? <Check className="size-3.5" style={{ color: "var(--t-accent)" }} /> : <Copy className="size-3.5" />}
              </button>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                  className="rounded-md p-1 hover:bg-white/10"
                  title="Tahrirlab qayta yuborish"
                  aria-label="Tahrirlash"
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
                        {st.kind === "research" ? "🌐" : sm?.glyph} {sm?.shortName ?? st.modelId}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {message.reading?.length ? (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
            title={message.reading.join("\n")}
          >
            <Globe className="size-3" style={{ color: "var(--t-accent)" }} />
            {message.reading.length === 1 ? "Sahifa o'qildi" : `${message.reading.length} sahifa o'qildi`}
          </div>
        ) : null}

        {message.switched?.length ? (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--warning, #F59E0B)55", color: "var(--t-text-muted)" }}
            title={message.switched.map((s) => `${s.from} → ${s.to}: ${s.reason}`).join("\n")}
          >
            <RefreshCw className="size-3" style={{ color: "var(--warning, #F59E0B)" }} />
            Model almashtirildi ·{" "}
            {MODEL_BY_ID[message.switched[message.switched.length - 1].to]?.shortName ??
              message.switched[message.switched.length - 1].to}
          </div>
        ) : null}

        {message.cache && (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
            title={`Semantik keshdan (${Math.round(message.cache.similarity * 100)}% o'xshash) — arzon va tez`}
          >
            <Zap className="size-3" style={{ color: "var(--t-accent)" }} />
            Keshdan · {Math.round(message.cache.similarity * 100)}% mos
          </div>
        )}

        {theme.layout.showCitations && (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium" style={{ color: "var(--t-text-muted)" }}>
            <span style={{ color: model.primary }}>{model.glyph}</span> Javob
            {message.citations?.length ? <span>· {message.citations.length} manba</span> : null}
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
            <div className="flex items-start gap-2 text-sm" style={{ color: "var(--error)" }}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{message.error ?? "Javob olishda xato yuz berdi."}</span>
            </div>
          ) : message.content ? (
            <>
              <Markdown content={message.content} citations={message.citations} />
              {streaming && (
                <span
                  className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse"
                  style={{ background: model.primary }}
                />
              )}
            </>
          ) : (
            <div className="py-1">
              <TypingIndicator />
            </div>
          )}
        </div>

        {message.verifier && message.verifier.length > 0 && (
          <VerifierPanel issues={message.verifier} />
        )}

        {message.skills?.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.skills.map((id) => {
              const sk = SKILL_BY_ID[id];
              if (!sk) return null;
              return (
                <span
                  key={id}
                  className="tt inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: `${sk.color}55`, color: sk.color, background: `color-mix(in srgb, ${sk.color} 10%, transparent)` }}
                  title={sk.description}
                >
                  {sk.glyph || "✦"} {sk.name}
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
                <span className="truncate">{new URL(url).hostname.replace(/^www\./, "")}</span>
              </a>
            ))}
          </div>
        ) : null}

        {!streaming && !failed && message.content && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs transition-opacity",
              isLast ? "opacity-70" : "opacity-0 group-hover:opacity-70",
            )}
            style={{ color: "var(--t-text-muted)" }}
          >
            <button type="button" onClick={copy} className="rounded-md p-1.5 hover:bg-white/10" title="Nusxa olish">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
            {tts && (
              <button
                type="button"
                onClick={tts.onToggle}
                className="rounded-md p-1.5 hover:bg-white/10"
                title={tts.speaking ? "To'xtatish" : "Ovozda o'qish"}
                style={tts.speaking ? { color: model.primary } : undefined}
              >
                {tts.speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </button>
            )}
            {isLast && onRegenerate && (
              <button type="button" onClick={onRegenerate} className="rounded-md p-1.5 hover:bg-white/10" title="Qayta yaratish">
                <RefreshCw className="size-3.5" />
              </button>
            )}
            <button type="button" className="rounded-md p-1.5 hover:bg-white/10" title="Foydali">
              <ThumbsUp className="size-3.5" />
            </button>
            <button type="button" className="rounded-md p-1.5 hover:bg-white/10" title="Foydasiz">
              <ThumbsDown className="size-3.5" />
            </button>
            <span className="ml-2 hidden sm:inline">{model.name}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
