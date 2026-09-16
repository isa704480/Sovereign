"use client";

import { ArrowUp, Brain, FileUp, Globe, Mic, Paperclip, Plus, Square, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { cn } from "@/lib/utils";
import { SkillPicker } from "./SkillPicker";
import { useTheme } from "./theme-context";

/** Imperative handle so suggestion chips can prefill the box. */
export interface InputAreaHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

interface InputAreaProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  research: boolean;
  onToggleResearch: (on: boolean) => void;
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
  ref?: Ref<InputAreaHandle>;
  autoFocus?: boolean;
  className?: string;
}

function Chip({
  active,
  disabled,
  icon,
  label,
  onClick,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        disabled && "cursor-not-allowed opacity-50",
      )}
      style={{
        borderColor: active ? "var(--t-primary)" : "var(--t-border)",
        background: active ? "color-mix(in srgb, var(--t-primary) 18%, transparent)" : "transparent",
        color: active ? "var(--t-accent)" : "var(--t-text-muted)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function InputArea({
  onSend,
  onStop,
  isStreaming,
  research,
  onToggleResearch,
  enabledSkills,
  onToggleSkill,
  ref,
  autoFocus,
  className,
}: InputAreaProps) {
  const { theme, model } = useTheme();
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !isStreaming;

  useImperativeHandle(
    ref,
    () => ({
      setDraft: (text: string) => {
        setValue(text);
        taRef.current?.focus();
      },
      focus: () => taRef.current?.focus(),
    }),
    [],
  );

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setValue("");
  }, [value, isStreaming, onSend]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  const style = theme.layout.input;
  const isPill = style === "pill";
  const isSearch = style === "search";

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      <div
        className={cn(
          "tt relative border shadow-md focus-within:shadow-lg",
          isPill ? "flex items-end gap-2 px-2 py-1.5" : "px-3 pb-2 pt-3",
        )}
        style={{
          background: "var(--t-input)",
          borderColor: "var(--t-border)",
          borderRadius: isPill ? "var(--t-input-radius)" : "var(--t-input-radius)",
          boxShadow: `0 0 0 0 transparent`,
        }}
        onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--t-primary)")}
        onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--t-border)")}
      >
        {isPill && (
          <button
            type="button"
            className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: "var(--t-text-muted)" }}
            title="Fayl biriktirish (tez orada)"
          >
            <Plus className="size-5" />
          </button>
        )}

        {isSearch && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Chip active icon={<Globe className="size-3.5" />} label="Web" />
            <Chip icon={<span className="text-[13px]">🎓</span>} label="Academic" disabled title="Tez orada" />
            <Chip icon={<span className="text-[13px]">📰</span>} label="News" disabled title="Tez orada" />
          </div>
        )}

        <div className={cn("flex items-end gap-2", isPill && "flex-1")}>
          {!isPill && (
            <div className="flex shrink-0 items-center gap-0.5 pb-1">
              <button type="button" className="rounded-lg p-2 transition-colors hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} title="Fayl biriktirish (tez orada)">
                <Paperclip className="size-4" />
              </button>
              <button type="button" className="rounded-lg p-2 transition-colors hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} title="Ovozli kiritish (tez orada)">
                <Mic className="size-4" />
              </button>
            </div>
          )}

          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={theme.placeholder}
            rows={1}
            autoFocus={autoFocus}
            className={cn(
              "chat-textarea min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed outline-none placeholder:opacity-60",
              isSearch && "min-h-[56px] text-base",
            )}
            style={{ color: "var(--t-text)" }}
          />

          {isStreaming ? (
            <motion.button
              type="button"
              onClick={onStop}
              whileTap={{ scale: 0.95 }}
              className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--t-text)", color: "var(--t-bg)" }}
              title="To'xtatish"
            >
              <Square className="size-3.5 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={submit}
              disabled={!canSend}
              whileTap={{ scale: 0.95 }}
              className="tt mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed"
              style={{
                background: canSend ? model.primary : "color-mix(in srgb, var(--t-text) 12%, transparent)",
                color: canSend ? "#fff" : "var(--t-text-muted)",
                boxShadow: canSend ? `0 0 18px color-mix(in srgb, ${model.primary} 45%, transparent)` : undefined,
              }}
              title="Yuborish (Enter)"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </motion.button>
          )}
        </div>

        {!isPill && !isSearch && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SkillPicker enabled={enabledSkills} onToggle={onToggleSkill} />
            <Chip
              active={research}
              icon={<Globe className="size-3.5" />}
              label="Research rejim"
              onClick={() => onToggleResearch(!research)}
              title="Perplexity orqali internet tadqiqoti"
            />
            <Chip icon={<Brain className="size-3.5" />} label="Xotira" disabled title="Phase 3" />
            <Chip icon={<FileUp className="size-3.5" />} label="Fayl" disabled title="Phase 4" />
            <Chip icon={<Zap className="size-3.5" />} label="Tez javob" disabled title="Tez orada" />
          </div>
        )}
      </div>

      {(isPill || isSearch) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <SkillPicker enabled={enabledSkills} onToggle={onToggleSkill} />
        </div>
      )}

      <div className="mt-2 hidden justify-center gap-4 text-[11px] sm:flex" style={{ color: "var(--t-text-muted)" }}>
        <span>
          <kbd className="rounded border px-1 py-0.5" style={{ borderColor: "var(--t-border)" }}>↵</kbd> Yuborish
        </span>
        <span>
          <kbd className="rounded border px-1 py-0.5" style={{ borderColor: "var(--t-border)" }}>⇧ ↵</kbd> Yangi qator
        </span>
        <span>{model.name} · AI xato qilishi mumkin, muhim ma&apos;lumotlarni tekshiring.</span>
      </div>
    </div>
  );
}
