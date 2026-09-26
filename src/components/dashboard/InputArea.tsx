"use client";

import { ArrowUp, Brain, ChevronDown, Clapperboard, FileText, FolderOpen, FolderTree, Globe, ImageIcon, Loader2, Mic, Music, Paperclip, Plus, ShieldCheck, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { EASE } from "@/lib/motion";
import { listKnowledge, type KbDoc } from "@/app/actions/knowledge";
import { attachmentGlyph, processFile, type Attachment } from "@/lib/chat/attachments";
import { matchFiles, type CoworkFile } from "@/lib/cowork/folder";
import { useChat, useLang, useT } from "@/store/chat";
import { fmt, type Lang } from "@/lib/i18n";
import { agentModeDescription, agentModeName } from "@/lib/locales/chat-data";
import { AGENT_MODES, AGENT_MODE_BY_ID } from "@/config/agent-modes";
import { useCowork } from "./cowork-context";
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
  onSend: (text: string, attachments?: Attachment[], docIds?: string[], opts?: { image?: boolean }) => void;
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
  /** "+" menyusi: qo'shimcha manbalar. Berilmasa o'sha band o'chiq turadi. */
  onOpenCowork?: () => void;
  onOpenKnowledge?: () => void;
  onOpenMemory?: () => void;
}

const ACCEPT = "image/*,application/pdf,audio/*,video/*,text/*,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css";

/** Ovozli kiritish tili — interfeys tilidan (brauzer SpeechRecognition BCP-47 kodlari). */
const SPEECH_LOCALE: Record<Lang, string> = { uz: "uz-UZ", "uz-cyrl": "uz-UZ", ru: "ru-RU", en: "en-US" };

/** Sensorli (soft) klaviatura: sichqoncha/hover yo'q qurilma. */
function isTouchKeyboard(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true;
}

/** One row of the "@" menu: a knowledge-base document or a local Cowork file. */
type MentionItem =
  | { kind: "doc"; id: string; label: string; doc: KbDoc }
  | { kind: "file"; id: string; label: string; file: CoworkFile };

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
  onOpenCowork,
  onOpenKnowledge,
  onOpenMemory,
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

  const cowork = useCowork();
  const t = useT();
  const lang = useLang();
  const agentMode = useChat((s) => s.agentMode);
  const setAgentMode = useChat((s) => s.setAgentMode);
  const [modeMenu, setModeMenu] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  // "+" → "Rasm yaratish": keyingi xabar(lar) rasm sifatida yaratiladi (o'chirilguncha).
  const [imageMode, setImageMode] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);
  // Event handler sifatida (useCallback) — render paytida ref o'qilmaydi.
  const attachFromMenu = useCallback(() => fileRef.current?.click(), []);

  // Agent rejimi menyusi tashqariga bosilsa yopiladi.
  useEffect(() => {
    if (!modeMenu) return;
    const onDown = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeMenu(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // global Esc (oqimni to'xtatish) ishlamasin
      setModeMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [modeMenu]);

  // Tashqariga bosilsa yoki Esc bo'lsa "+" menyusi yopiladi.
  useEffect(() => {
    if (!plusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // global Esc (oqimni to'xtatish) ishlamasin
      setPlusOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  // Mention list = knowledge-base documents + files from the opened Cowork folder.
  const docMatches = (docs ?? [])
    .filter((d) => d.status === "ready")
    .filter((d) => !mention || d.name.toLowerCase().includes(mention.toLowerCase()))
    .slice(0, 5);
  const fileMatches = cowork.folder ? matchFiles(cowork.folder.files, mention ?? "", 6) : [];
  const matches: MentionItem[] = [
    ...fileMatches.map((f) => ({ kind: "file" as const, id: `file:${f.path}`, label: f.path, file: f })),
    ...docMatches.map((d) => ({ kind: "doc" as const, id: d.id, label: d.name, doc: d })),
  ];
  const mentionOpen = mention !== null && matches.length > 0;

  const speech = useSpeech((t) => {
    setValue(t);
    taRef.current?.focus();
  }, SPEECH_LOCALE[lang]);
  const enterToSend = useChat((s) => s.enterToSend);

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
    if (imageMode && !text) return;
    onSend(
      text,
      attachments.length ? attachments : undefined,
      docIds.length ? docIds : undefined,
      imageMode ? { image: true } : undefined,
    );
    setValue("");
    setAttachments([]);
    setMentioned([]);
    setMention(null);
  }, [value, attachments, isStreaming, busy, onSend, speech, mentioned, imageMode]);

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

  /** Replaces the half-typed "@query" with the picked document or local file. */
  function pickMention(item: MentionItem) {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@[^\s@]{0,40}$/, "");
    const label = item.label.replace(/\s+/g, "_");
    const after = value.slice(caret);
    // One space after the mention — not two when the caret already sits before one.
    const next = `${before}@${label}${/^\s/.test(after) ? "" : " "}${after}`;
    setValue(next);
    setMention(null);

    if (item.kind === "doc") {
      setMentioned((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, { id: item.id, label }]));
    } else {
      // Cowork file: read it from disk now and attach it like any upload.
      setBusy(true);
      item.file
        .getFile()
        .then((f) => processFile(f, lang))
        .then((att) => setAttachments((prev) => (prev.some((a) => a.name === att.name) ? prev : [...prev, att])))
        .catch((err) => setFileError(err instanceof Error ? err.message : t("chFileReadFailed")))
        .finally(() => setBusy(false));
    }

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
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // Ctrl/Cmd+Enter har doim yuboradi. Oddiy Enter — faqat "Enter bilan yuborish"
    // yoqilgan va sensorli klaviatura bo'lmaganda (telefonda Shift+Enter yo'q: Enter = yangi qator).
    const mod = e.ctrlKey || e.metaKey;
    if (mod || (enterToSend && !e.shiftKey && !isTouchKeyboard())) {
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
        const att = await processFile(f, lang);
        setAttachments((prev) => [...prev, att]);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : t("chFileReadFailed"));
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
      title={t("chAttachTitle")}
      aria-label={t("chAttachTitle")}
      aria-busy={busy || undefined}
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
      title={speech.listening ? t("stop") : t("chVoiceInput")}
      aria-label={speech.listening ? t("stop") : t("chVoiceInput")}
      aria-pressed={speech.listening}
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

  // Reference dizaynlardagi "Chat / Agent" — bizda "Chat / Cowork". Cowork = kompyuterdagi
  // papka bilan ishlash rejimi; papka tanlansa faol bo'ladi.
  const coworkActive = !!cowork.folder;
  const modeToggle = (
    <div
      className="tt inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5 text-xs font-medium"
      style={{ background: "color-mix(in srgb, var(--t-text) 8%, transparent)" }}
    >
      <button
        type="button"
        onClick={() => { if (coworkActive) cowork.clear(); }}
        className="rounded-full px-2.5 py-1 transition-colors"
        style={{ background: coworkActive ? "transparent" : "var(--t-surface)", color: coworkActive ? "var(--t-text-muted)" : "var(--t-text)" }}
        title={t("chModeChatTitle")}
      >
        {t("chModeChat")}
      </button>
      <button
        type="button"
        onClick={() => onOpenCowork?.()}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors"
        style={{ background: coworkActive ? "var(--t-surface)" : "transparent", color: coworkActive ? "var(--t-accent)" : "var(--t-text-muted)" }}
        title={t("chModeCoworkTitle")}
      >
        <FolderTree className="size-3" /> Cowork
      </button>
    </div>
  );

  // Composer ichidagi model tanlagich — nomi + brend belgisi, mavjud ModelSwitcher'ni ochadi.
  const modelChip = (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("sovereign:open-model"))}
      className="tt inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors hover:bg-white/5"
      style={{ color: "var(--t-text-muted)" }}
      title={t("chSelectModelTitle")}
    >
      <span
        className="inline-flex size-4 items-center justify-center rounded-[5px] text-[10px] leading-none"
        style={{ background: `color-mix(in srgb, ${model.primary} 22%, transparent)`, color: model.primary }}
      >
        {model.glyph}
      </span>
      <span className="max-w-[120px] truncate" style={{ color: "var(--t-text)" }}>{model.shortName}</span>
      <ChevronDown className="size-3.5 opacity-70" />
    </button>
  );

  // Agent rejimi tanlagich — "vazifa ber, agent bajaradi" (dasturchi/tadqiqotchi/...).
  const cur = AGENT_MODE_BY_ID[agentMode] ?? AGENT_MODES[0];
  const modeChip = (
    <div className="relative" ref={modeRef}>
      <button
        type="button"
        onClick={() => setModeMenu((o) => !o)}
        aria-expanded={modeMenu}
        className="tt inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors hover:bg-white/5"
        style={{ borderColor: cur.id !== "general" ? "var(--t-primary)" : "var(--t-border)", color: cur.id !== "general" ? "var(--t-accent)" : "var(--t-text-muted)" }}
        title={t("chAgentMode")}
      >
        <span>{cur.glyph}</span>
        <span className="max-w-[90px] truncate">{agentModeName(lang, cur)}</span>
        <ChevronDown className="size-3 opacity-70" />
      </button>
      {modeMenu && (
        <div
          className="tt absolute bottom-full left-0 z-30 mb-2 w-60 overflow-hidden rounded-[18px] border"
          style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 20px 50px rgba(0,0,0,0.45)" }}
        >
          {AGENT_MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setAgentMode(m.id);
                setModeMenu(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5"
              style={{ background: m.id === agentMode ? "color-mix(in srgb, var(--t-primary) 14%, transparent)" : "transparent", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}
            >
              <span className="text-base">{m.glyph}</span>
              <span className="min-w-0">
                <span className="block text-sm" style={{ color: "var(--t-text)" }}>{agentModeName(lang, m)}</span>
                <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>{agentModeDescription(lang, m)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
                aria-label={t("chRemove")}
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
          aria-label={t("chKbDocsAria")}
          className="tt mb-2 overflow-hidden rounded-[18px] border"
          style={{
            background: "var(--t-surface)",
            borderColor: "var(--t-border)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 20px 50px rgba(0,0,0,0.45)",
          }}
        >
          <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
            {cowork.folder ? fmt(t("chMentionHeaderFolder"), { name: cowork.folder.name }) : t("chMentionHeader")}
          </div>
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === mentionIdx}
              onMouseEnter={() => setMentionIdx(i)}
              onClick={() => pickMention(m)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
              style={{
                background: i === mentionIdx ? "color-mix(in srgb, var(--t-primary) 16%, transparent)" : "transparent",
                borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
              }}
            >
              {m.kind === "file" ? (
                <FolderOpen className="size-4 shrink-0" style={{ color: "var(--t-accent)" }} />
              ) : (
                <FileText className="size-4 shrink-0" style={{ color: "var(--t-text-muted)" }} />
              )}
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--t-text)" }}>{m.label}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
                {m.kind === "file" ? "Cowork" : t("kbShort")}
              </span>
            </button>
          ))}
          <div className="px-3 pb-2 pt-1 text-xs" style={{ color: "var(--t-text-muted)" }}>
            {t("chMentionHint")}
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
        {isPill && <div className="flex shrink-0 items-center self-center">{attachBtn}</div>}

        {isSearch && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Chip active icon={<Globe className="size-3.5" />} label={t("chChipWeb")} />
            <Chip icon={<span className="text-[13px]">🎓</span>} label={t("chChipAcademic")} disabled title={t("chSoon")} />
            <Chip icon={<span className="text-[13px]">📰</span>} label={t("chChipNews")} disabled title={t("chSoon")} />
          </div>
        )}

        <div className={cn("flex gap-2", isPill ? "flex-1 items-center" : "items-end")}>
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
            placeholder={speech.listening ? "..." : imageMode ? t("uxImagePlaceholder") : t("typeMessage")}
            aria-label={t("typeMessage")}
            rows={1}
            autoFocus={autoFocus}
            enterKeyHint="enter"
            className={cn(
              // Mobilda 16px — iOS Safari fokusda sahifani kattalashtirmasin.
              "chat-textarea min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-base leading-relaxed outline-none placeholder:opacity-60 md:text-[15px]",
              isSearch && "min-h-[56px] text-base md:text-base",
            )}
            style={{ color: "var(--t-text)" }}
          />

          {isPill && (
            <div className="flex shrink-0 items-center gap-1 self-center">
              {imageMode && (
                <button
                  type="button"
                  onClick={() => setImageMode(false)}
                  aria-label={t("uxImageModeOff")}
                  title={t("uxImageModeOff")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
                  style={{ background: "color-mix(in srgb, var(--t-accent) 18%, transparent)", color: "var(--t-accent)" }}
                >
                  <ImageIcon className="size-3.5" /> {t("uxImageMode")} <X className="size-3" />
                </button>
              )}
              {modeChip}
              {modeToggle}
              {modelChip}
              {micBtn}
            </div>
          )}

          {isStreaming ? (
            <motion.button
              type="button"
              onClick={onStop}
              whileTap={{ scale: 0.95 }}
              className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--t-text)", color: "var(--t-bg)" }}
              title={t("stop")}
              aria-label={t("stop")}
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
              title={t("chSendEnter")}
              aria-label={t("send")}
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </motion.button>
          )}
        </div>

        {!isPill && !isSearch && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* "+" — qo'shimcha manbalar: Cowork papka, fayl, bilim bazasi, xotira. */}
            <div ref={plusRef} className="relative">
              <button
                type="button"
                onClick={() => setPlusOpen((o) => !o)}
                aria-expanded={plusOpen}
                aria-label={t("addSource")}
                className="tt inline-flex size-8 items-center justify-center rounded-full border transition-transform"
                style={{
                  borderColor: plusOpen ? "var(--t-primary)" : "var(--t-border)",
                  color: plusOpen ? "var(--t-accent)" : "var(--t-text-muted)",
                  transform: plusOpen ? "rotate(45deg)" : "none",
                }}
              >
                <Plus className="size-4" />
              </button>
              <AnimatePresence>
                {plusOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: EASE }}
                    className="tt absolute bottom-full left-0 z-30 mb-2 w-60 overflow-hidden rounded-[18px] border"
                    style={{
                      background: "var(--t-surface)",
                      borderColor: "var(--t-border)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 20px 50px rgba(0,0,0,0.45)",
                    }}
                    role="menu"
                  >
                    {(
                      [
                        {
                          id: "cowork",
                          label: cowork.folder ? `Cowork · ${cowork.folder.name}` : t("coworkFolder"),
                          hint: cowork.folder ? fmt(t("chCoworkHint"), { n: cowork.folder.files.length }) : t("chCoworkHintEmpty"),
                          Icon: FolderTree,
                          enabled: !!onOpenCowork,
                        },
                        { id: "file", label: t("attachFile"), hint: t("chFileHint"), Icon: Paperclip, enabled: true },
                        { id: "kb", label: t("knowledgeBase"), hint: t("chKbHint"), Icon: FolderOpen, enabled: !!onOpenKnowledge },
                        { id: "memory", label: t("memory"), hint: t("chMemoryHint"), Icon: Brain, enabled: !!onOpenMemory },
                        { id: "image", label: t("uxCreateImage"), hint: t("uxCreateImageHint"), Icon: ImageIcon, enabled: true },
                        { id: "music", label: t("uxCreateMusic"), hint: t("uxComingSoon"), Icon: Music, enabled: false },
                        { id: "video", label: t("uxCreateVideo"), hint: t("uxComingSoon"), Icon: Clapperboard, enabled: false },
                      ] as const
                    ).map(({ id, label, hint, Icon, enabled }, i) => (
                      <button
                        key={id}
                        type="button"
                        role="menuitem"
                        disabled={!enabled}
                        onClick={() => {
                          setPlusOpen(false);
                          if (id === "cowork") onOpenCowork?.();
                          else if (id === "file") attachFromMenu();
                          else if (id === "kb") onOpenKnowledge?.();
                          else if (id === "memory") onOpenMemory?.();
                          else if (id === "image") {
                            setImageMode(true);
                            taRef.current?.focus();
                          }
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                        style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}
                      >
                        <Icon className="size-4 shrink-0" style={{ color: "var(--t-accent)" }} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm" style={{ color: "var(--t-text)" }}>{label}</span>
                          <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>{hint}</span>
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {imageMode && (
                <button
                  type="button"
                  onClick={() => setImageMode(false)}
                  aria-label={t("uxImageModeOff")}
                  title={t("uxImageModeOff")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
                  style={{ background: "color-mix(in srgb, var(--t-accent) 18%, transparent)", color: "var(--t-accent)" }}
                >
                  <ImageIcon className="size-3.5" /> {t("uxImageMode")} <X className="size-3" />
                </button>
              )}
              {modeChip}
            {modeToggle}
            <SkillPicker enabled={enabledSkills} onToggle={onToggleSkill} />
            <Chip
              active={research}
              icon={<Globe className="size-3.5" />}
              label={t("researchMode")}
              onClick={() => onToggleResearch(!research)}
              title={t("chResearchTitle")}
            />
            <Chip
              active={blindPrompting}
              icon={<ShieldCheck className="size-3.5" />}
              label={t("privateMode")}
              onClick={() => onToggleBlindPrompting(!blindPrompting)}
              title={t("chPrivateTitle")}
            />
            {/* Xotira va Tez javob — hozircha shipp qilinmagan; Apple: disabled affordances chiqarmaymiz */}
            <div className="ml-auto">{modelChip}</div>
          </div>
        )}
      </div>

      {(isPill || isSearch) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <SkillPicker enabled={enabledSkills} onToggle={onToggleSkill} />
        </div>
      )}

      <div className="mt-2 hidden justify-center gap-4 text-xs sm:flex" style={{ color: "var(--t-text-muted)" }}>
        <span>
          <kbd className="rounded border px-1 py-0.5" style={{ borderColor: "var(--t-border)" }}>↵</kbd> {t("send")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-flex size-4 items-center justify-center rounded-[5px] text-[10px] leading-none"
            style={{ background: `color-mix(in srgb, ${model.primary} 22%, transparent)`, color: model.primary }}
            aria-hidden
          >
            {model.glyph}
          </span>
          {model.name} · {t("aiDisclaimer")}
        </span>
      </div>
    </div>
  );
}
