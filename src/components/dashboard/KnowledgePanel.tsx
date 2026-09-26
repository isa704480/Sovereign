"use client";

import { FileText, FolderOpen, Loader2, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { deleteKnowledge, listKnowledge, uploadKnowledge, type KbDoc } from "@/app/actions/knowledge";
import { processFile } from "@/lib/chat/attachments";
import { fmt } from "@/lib/i18n";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { useLang, useT } from "@/store/chat";
import { useDialogA11y } from "./use-dialog-a11y";

interface KnowledgePanelProps {
  open: boolean;
  onClose: () => void;
}

const ACCEPT = "application/pdf,text/*,.md,.txt,.json,.csv,.js,.ts,.tsx,.py,.html,.css";

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgePanel({ open, onClose }: KnowledgePanelProps) {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<KbDoc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const { panelRef, titleId, dialogProps } = useDialogA11y(open, onClose);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listKnowledge()
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open]);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    for (const f of files) {
      setBusy(f.name);
      try {
        const att = await processFile(f, lang);
        if (!att.text) {
          setError(fmt(t("pnKbNoText"), { name: f.name }));
          continue;
        }
        const res = await uploadKnowledge({ name: f.name, mime: f.type || att.mime, content: att.text });
        if (!res.ok) setError(`${f.name}: ${res.error}`);
        else {
          const fresh = await listKnowledge();
          setItems(fresh);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setBusy(null);
  }

  function remove(id: string) {
    setItems((prev) => prev?.filter((d) => d.id !== id) ?? null);
    startTransition(() => void deleteKnowledge(id));
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
            className="tt flex max-h-[86vh] w-full max-w-2xl flex-col rounded-3xl border shadow-lg outline-none"
            style={{
              background: "var(--t-surface, #0D1033)",
              borderColor: "var(--t-border, rgba(255,255,255,0.1))",
              color: "var(--t-text, #F0F2FF)",
            }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="size-5" style={{ color: "var(--t-accent, #7C6FF7)" }} />
                <h2 id={titleId} className="font-display text-lg font-bold">{t("knowledgeBase")}</h2>
                {items && (
                  <span className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                    {items.length} {t("kbDocs")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 hover:bg-white/10"
                aria-label={t("close")}
                style={{ color: "var(--t-text-muted, #9BA3CC)" }}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="px-5 pb-2 pt-4">
              <p className="text-sm" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                {t("kbIntro")}
              </p>
              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={onFiles} />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--t-primary, #5B50F0)" }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {busy ? `${t("kbUploading")}: ${busy}` : t("kbUpload")}
              </button>
              {error && (
                <p role="alert" className="mt-2 text-sm" style={{ color: "var(--error, #EF4444)" }}>
                  {error}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {items === null ? (
                <div className="space-y-2 p-2">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-xl"
                      style={{ background: "color-mix(in srgb, var(--t-text,#fff) 6%, transparent)" }}
                    />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  {t("kbEmpty")}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((d) => (
                    <li
                      key={d.id}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: "color-mix(in srgb, var(--t-text,#fff) 4%, transparent)" }}
                    >
                      <FileText className="size-4 shrink-0" style={{ color: "var(--t-accent, #7C6FF7)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        <div className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                          {fmtSize(d.size)}
                          {d.status === "processing" ? ` · ${t("kbIndexing")}` : d.status === "error" ? ` · ${t("kbErrorState")}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(d.id)}
                        className="rounded-md p-1 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={t("delete")}
                        style={{ color: "var(--t-text-muted, #9BA3CC)" }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
