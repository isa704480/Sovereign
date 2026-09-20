"use client";

import { ArrowUp, FileText, Globe, Loader2, Mic, Paperclip, ShieldCheck, Square, X } from "lucide-react";
import { motion } from "motion/react";
import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { listKnowledge, type KbDoc } from "@/app/actions/knowledge";
import { attachmentGlyph, processFile, type Attachment } from "@/lib/chat/attachments";
import { useSpeech } from "@/hooks/use-speech";
import { cn } from "@/lib/utils";
import { SkillPicker } from "./SkillPicker";
import { useTheme } from "./theme-context";

/** Imperative handle so suggestion chips can prefill the box. */
export interface InputAreaHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

interface InputAreaProps {
  onSend: (text: string, attachments?: Attachment[], docIds?: string[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  research: boolean;
  onToggleResearch: (on: boolean) => void;
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
  blindPrompting: boolean;
  onToggleBlindPrompting: (on: boolean) => void;
  ref?: Ref<InputAreaHandle>;
  autoFocus?: boolean;
  className?: string;
}

const ACCEPT = "image/*,application/pdf,audio/*,video/*,text/*,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css";

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
  blindPrompting,
  onToggleBlindPrompting,
  ref,
  autoFocus,
  className,
}: InputAreaProps) {
  const { theme, model } = useTheme();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // "@hujjat" mentions — reference a knowledge-base document in the prompt.
  const [docs, setDocs] = useState<KbDoc[] | null>(null);
  const [mention, setMention] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentioned, setMentioned] = useState<{ id: string; label: string }[]>([]);

  const matches = (docs ?? [])
    .filter((d) => d.status === "ready")
    .filter((d) => !mention || d.name.toLowerCase().includes(mention.toLowerCase()))
    .slice(0, 6);
  const mentionOpen = mention !== null && matches.length > 0;

  const speech = useSpeech((t) => {
    setValue(t);
    taRef.current?.focus();
  });

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isStreaming && !busy;

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
    if ((!text && attachments.length === 0) || isStreaming || busy) return;
    if (speech.listening) speech.stop();
    // Only send mentions the user did not delete again.
    const docIds = mentioned.filter((m) => text.includes(`@${m.label}`)).map((m) => m.id);
    onSend(text, attachments.length ? attachments : undefined, docIds.length ? docIds : undefined);
    setValue("");
    setAttachments([]);
    setMentioned([]);
    setMention(null);
  }, [value, attachments, isStreaming, busy, onSend, speech, mentioned]);

  /** Loads the document list once, the first time "@" is typed. */
  function onChangeText(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    const upToCaret = next.slice(0, e.target.selectionStart ?? next.length);
    const m = /(?:^|\s)@([^\s@]{0,40})$/.exec(upToCaret);
    setMention(m ? m[1] : null);
    setMentionIdx(0);
    if (m && docs === null) {
      setDocs([]);
      listKnowledge()
        .then(setDocs)
        .catch(() => setDocs([]));
    }
  }

  /** Replaces the half-typed "@query" with the picked document's name. */
  function pickMention(doc: KbDoc) {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@[^\s@]{0,40}$/, "");
    const label = doc.name.replace(/\s+/g, "_");
    const after = value.slice(caret);
    // One space after the mention — not two when the caret already sits before one.
    const next = `${before}@${label}${/^\s/.test(after) ? "" : " "}${after}`;
    setValue(next);
    setMention(null);
    setMentioned((prev) => (prev.some((p) => p.id === doc.id) ? prev : [...prev, { id: doc.id, label }]));
    requestAnimationFrame(() => {
      const pos = before.length + label.length + 1 + (/^\s/.test(after) ? 0 : 1);
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(matches[mentionIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  const openPicker = () => fileRef.current?.click();

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setFileError(null);
    for (const f of files) {
      try {
        const att = await processFile(f);
        setAttachments((prev) => [...prev, att]);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Fayl o'qilmadi");
      }
    }
    setBusy(false);
    taRef.current?.focus();
  }

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const style = theme.layout.input;
  const isPill = style === "pill";
  const isSearch = style === "search";

  const attachBtn = (
    <button
      type="button"
      onClick={openPicker}
      className="rounded-lg p-2 transition-colors hover:bg-white/10"
      style={{ color: "var(--t-text-muted)" }}
      title="Fayl biriktirish (rasm, PDF, matn)"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
    </button>
  );

  const micBtn = speech.supported && (
    <button
      type="button"
      onClick={speech.toggle}
      className="rounded-lg p-2 transition-colors hover:bg-white/10"
      style={{ color: speech.listening ? model.primary : "var(--t-text-muted)" }}
      title={speech.listening ? "To'xtatish" : "Ovozli kiritish"}
    >
      {speech.listening ? (
        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}>
          <Mic className="size-4" />
        </motion.span>
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  );

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={onFiles} />

      {/* attachment previews */}
      {(attachments.length > 0 || fileError) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="tt group relative inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs"
              style={{ borderColor: "var(--t-border)", background: "var(--t-surface)", color: "var(--t-text)" }}
            >
              {a.kind === "image" && a.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.dataUrl} alt="" className="size-8 rounded-md object-cover" />
              ) : (
                <span className="text-base">{attachmentGlyph(a.kind)}</span>
              )}
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="rounded-full p-0.5 hover:bg-white/10"
                style={{ color: "var(--t-text-muted)" }}
                aria-label="O'chirish"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {fileError && <span className="text-xs" style={{ color: "var(--error)" }}>{fileError}</span>}
        </div>
      )}

      {mentionOpen && (
        <div
          role="listbox"
          aria-label="Bilim bazasi hujjatlari"
          className="tt mb-2 overflow-hidden rounded-2xl border shadow-lg"
          style={{ background: "var(--t-surface)", borderColor: "var(--t-border)" }}
        >
          <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
            Bilim bazasi
          </div>
          {matches.map((d, i) => (
            <button
              key={d.id}
              type="button"
              role="option"
              aria-selected={i === mentionIdx}
              onMouseEnter={() => setMentionIdx(i)}
              onClick={() => pickMention(d)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
              style={{ background: i === mentionIdx ? "color-mix(in srgb, var(--t-primary) 16%, transparent)" : "transparent" }}
            >
              <FileText className="size-4 shrink-0" style={{ color: "var(--t-text-muted)" }} />
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--t-text)" }}>{d.name}</span>
            </button>
          ))}
          <div className="px-3 pb-2 pt-1 text-[11px]" style={{ color: "var(--t-text-muted)" }}>
            ↑↓ tanlash · ↵ qo&apos;shish · Esc yopish
          </div>
        </div>
      )}

      <div
        className={cn(
          "tt relative border shadow-md focus-within:shadow-lg",
          isPill ? "flex items-end gap-2 px-2 py-1.5" : "px-3 pb-2 pt-3",
        )}
        style={{ background: "var(--t-input)", borderColor: "var(--t-border)", borderRadius: "var(--t-input-radius)" }}
        onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--t-primary)")}
        onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--t-border)")}
      >
        {isPill && (
          <div className="mb-0.5 flex shrink-0 items-center">
            {attachBtn}
            {micBtn}
          </div>
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
              {attachBtn}
              {micBtn}
            </div>
          )}

          <textarea
            ref={taRef}
            value={value}
            onChange={onChangeText}
            onKeyDown={onKeyDown}
            placeholder={speech.listening ? "Tinglayapman..." : theme.placeholder}
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
            <Chip
              active={blindPrompting}
              icon={<ShieldCheck className="size-3.5" />}
              label="Maxfiy rejim"
              onClick={() => onToggleBlindPrompting(!blindPrompting)}
              title="Blind Prompting — ism, telefon, email va boshqa shaxsiy ma'lumotlarni AI ko'rmasligi uchun maskalash"
            />
            {/* Xotira va Tez javob — hozircha shipp qilinmagan; Apple: disabled affordances chiqarmaymiz */}
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
        <span>{model.name} · AI xato qilishi mumkin, muhim ma&apos;lumotlarni tekshiring.</span>
      </div>
    </div>
  );
}
