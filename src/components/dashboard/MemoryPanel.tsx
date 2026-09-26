"use client";

import { Brain, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { clearMemories, deleteMemory, listMemories, setMemoryEnabled } from "@/app/actions/memory";
import type { MemoryNode } from "@/lib/ai/memory";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { useLang, useT } from "@/store/chat";
import { fmt, type TKey } from "@/lib/i18n";
import { plural } from "@/lib/plural";
import { useDialogA11y } from "./use-dialog-a11y";

interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
}

const KIND_LABEL: Record<string, TKey> = { fact: "memoryKindFact", preference: "memoryKindPreference", project: "memoryKindProject", person: "memoryKindPerson" };

export function MemoryPanel({ open, onClose, enabled, onEnabledChange }: MemoryPanelProps) {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<MemoryNode[] | null>(null);
  const [, startTransition] = useTransition();
  const { panelRef, titleId, dialogProps } = useDialogA11y(open, onClose);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listMemories()
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open]);

  // "Hammasini o'chirish" ikki bosqichli (Sozlamalardagi kabi); panel yopilsa qurolsizlanadi.
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setConfirmClear(false);
      setMsg(null);
    }
  }

  function remove(id: string) {
    const before = items;
    setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
    startTransition(async () => {
      const res = await deleteMemory(id).catch(() => ({ ok: false }));
      if (!res.ok) {
        setItems(before);
        setMsg(t("stDeleteFailed"));
      }
    });
  }
  function clearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    const before = items;
    setItems([]);
    startTransition(async () => {
      const res = await clearMemories().catch(() => ({ ok: false }));
      if (!res.ok) {
        // Serverda o'chmadi — ro'yxatni qaytaramiz, bo'sh deb aldamaymiz.
        setItems(before);
        setMsg(t("stDeleteFailed"));
      }
    });
  }
  function toggle(v: boolean) {
    onEnabledChange(v);
    startTransition(async () => {
      const res = await setMemoryEnabled(v).catch(() => ({ ok: false }));
      if (!res.ok) {
        onEnabledChange(!v);
        setMsg(t("stSaveFailed"));
      }
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            {...dialogProps}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt flex max-h-[calc(100svh-2rem)] w-full max-w-lg flex-col rounded-3xl border shadow-lg outline-none md:max-h-[86vh]"
            style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <div className="flex items-center gap-2">
                <Brain className="size-5" style={{ color: "var(--t-accent, #7C6FF7)" }} />
                <h2 id={titleId} className="font-display text-lg font-bold">{t("memory")}</h2>
                {items && (
                  <span className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                    {plural(lang, items.length, { one: "p8bNodesOne", few: "p8bNodesFew", many: "p8bNodesMany" })}
                  </span>
                )}
              </div>
              <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10 md:size-9" aria-label={t("close")} style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                <X className="size-5" />
              </button>
            </div>

            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--t-border, rgba(255,255,255,0.1))" }}>
              <div>
                <div className="text-sm font-medium">{t("memoryQuestion")}</div>
                <div className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{t("memoryQuestionDesc")}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t("memoryQuestion")}
                onClick={() => toggle(!enabled)}
                className="relative h-6 w-11 shrink-0 rounded-full p-0 transition-colors"
                style={{ background: enabled ? "var(--t-primary, #5B50F0)" : "color-mix(in srgb, var(--t-text, #fff) 18%, transparent)" }}
              >
                <span
                  className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                  style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {items === null ? (
                <div className="space-y-2 p-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl" style={{ background: "color-mix(in srgb, var(--t-text,#fff) 6%, transparent)" }} />)}
                </div>
              ) : items.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  {t("memoryEmpty")}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((m) => (
                    <li
                      key={m.id}
                      className="group flex items-start gap-2 rounded-xl px-3 py-2.5"
                      style={{ background: "color-mix(in srgb, var(--t-text,#fff) 4%, transparent)" }}
                    >
                      <span className="mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--t-primary,#5B50F0) 18%, transparent)", color: "var(--t-accent,#7C6FF7)" }}>
                        {KIND_LABEL[m.kind] ? t(KIND_LABEL[m.kind]) : m.kind}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">{m.content}</span>
                      <button
                        type="button"
                        onClick={() => remove(m.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/10 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                        aria-label={fmt(t("p8bDeleteNamed"), { name: m.content.slice(0, 40) })}
                        title={t("delete")}
                        style={{ color: "var(--t-text-muted, #9BA3CC)" }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {msg && (
              <p role="status" className="px-5 pb-2 text-xs" style={{ color: "var(--error, #EF4444)" }}>
                {msg}
              </p>
            )}
            {items && items.length > 0 && (
              <div className="flex items-center gap-3 border-t px-5 py-3" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <button
                  type="button"
                  onClick={clearAll}
                  className={confirmClear ? "min-h-8 rounded-lg border px-3 text-xs font-semibold" : "min-h-8 text-xs font-medium"}
                  style={{ color: "var(--error, #EF4444)", borderColor: "var(--error, #EF4444)" }}
                >
                  {confirmClear ? t("confirmDelete") : t("memoryClearAll")}
                </button>
                {confirmClear && (
                  <button type="button" onClick={() => setConfirmClear(false)} className="min-h-8 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                    {t("cancel")}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
