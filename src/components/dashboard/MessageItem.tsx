"use client";

import { AlertTriangle, Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MODEL_BY_ID } from "@/config/models";
import type { ChatMessage } from "@/store/chat";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { ModelAvatar } from "./ModelAvatar";
import { TypingIndicator } from "./TypingIndicator";
import { useTheme } from "./theme-context";

interface MessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate?: () => void;
}

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageItem({ message, isLast, onRegenerate }: MessageItemProps) {
  const { theme, model: activeModel } = useTheme();
  const [copied, setCopied] = useState(false);
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
        <div className="flex max-w-[78%] flex-col items-end gap-1">
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
          <span className="pr-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--t-text-muted)" }}>
            {timeLabel(message.createdAt)}
          </span>
        </div>
      </motion.div>
    );
  }

  /* ---------- assistant ---------- */
  const flat = !theme.layout.aiBubble;
  const showAvatar = theme.layout.avatar !== "none";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: EASE, delay: 0.05 }}
      className="group flex gap-3"
    >
      {showAvatar && (
        <div className="pt-1">
          <ModelAvatar model={model} size={28} glow={streaming} />
        </div>
      )}

      <div className={cn("min-w-0 flex-1", flat ? "max-w-full" : "max-w-[85%]")}>
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
