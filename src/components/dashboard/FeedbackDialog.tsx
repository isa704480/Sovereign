"use client";

import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/store/chat";
import { cn } from "@/lib/utils";
import { useDialogA11y } from "./use-dialog-a11y";

type Kind = "idea" | "bug" | "complaint" | "other";
const KINDS: { id: Kind; label: TKey }[] = [
  { id: "idea", label: "fbKindIdea" },
  { id: "bug", label: "fbKindBug" },
  { id: "complaint", label: "fbKindComplaint" },
  { id: "other", label: "fbKindOther" },
];

/** Taklif / xato / shikoyat oynasi — /api/feedback ga yuboradi. */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Yopilganda holat tozalanadi — keyingi ochilishda forma yangidan boshlanadi.
  const close = useCallback(() => {
    setState("idle");
    setError(null);
    onClose();
  }, [onClose]);

  // Esc, fokusni qaytarish va sarlavha bog'lanishi — umumiy hook; bu yerda faqat matn maydoniga fokus.
  const { panelRef, titleId, dialogProps } = useDialogA11y(open, close);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => areaRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  async function send() {
    if (state === "sending") return;
    if (text.trim().length < 3) {
      setError(t("fbTooShort"));
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: text.trim(), page: window.location.pathname }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || t("fbFailed"));
      setState("sent");
      setText("");
      window.setTimeout(close, 1400);
    } catch (e) {
      setState("idle");
      setError(e instanceof Error && e.message ? e.message : t("fbFailed"));
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            ref={panelRef}
            {...dialogProps}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt relative w-full max-w-lg rounded-[22px] border p-6 outline-none"
            style={{
              background: "var(--t-surface, #0D1033)",
              borderColor: "var(--t-border, rgba(255,255,255,0.1))",
              color: "var(--t-text, #F0F2FF)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.55)",
            }}
          >
            <button
              type="button"
              onClick={close}
              className="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-white/10"
              aria-label={t("close")}
              style={{ color: "var(--t-text-muted, #9BA3CC)" }}
            >
              <X className="size-5" />
            </button>

            <h2 id={titleId} className="t-display text-xl font-extrabold tracking-[-0.02em]">
              {t("fbTitle")}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
              {t("fbSub")}
            </p>

            {state === "sent" ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
                <span className="grid size-12 place-items-center rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}>
                  <Check className="size-6" />
                </span>
                <p className="font-medium">{t("fbSent")}</p>
              </div>
            ) : (
              <>
                {/* Segmented — turi */}
                <div
                  role="radiogroup"
                  aria-label={t("fbTitle")}
                  className="mt-5 grid grid-cols-4 gap-1 rounded-xl p-1"
                  style={{ background: "color-mix(in srgb, var(--t-text) 6%, transparent)" }}
                >
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={kind === k.id}
                      onClick={() => setKind(k.id)}
                      className={cn("rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm", kind !== k.id && "hover:bg-white/5")}
                      style={
                        kind === k.id
                          ? { background: "var(--t-surface, #0D1033)", color: "var(--t-text)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }
                          : { color: "var(--t-text-muted)" }
                      }
                    >
                      {t(k.label)}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={areaRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                  }}
                  maxLength={4000}
                  rows={5}
                  placeholder={t("fbPlaceholder")}
                  aria-label={t("fbPlaceholder")}
                  aria-invalid={!!error}
                  className="mt-3 w-full resize-none rounded-xl border bg-transparent px-3.5 py-3 text-base outline-none sm:text-sm focus:border-[var(--t-primary)]"
                  style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="min-h-5 text-xs" role="alert" style={{ color: "#F87171" }}>
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={state === "sending"}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ background: "var(--t-primary, #7C6FF7)" }}
                  >
                    {state === "sending" && <Loader2 className="size-4 animate-spin" />}
                    {t("fbSend")}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
