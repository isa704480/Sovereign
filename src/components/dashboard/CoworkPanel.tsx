"use client";

import { FolderOpen, Info, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchFiles } from "@/lib/cowork/folder";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { useT } from "@/store/chat";
import { useCowork } from "./cowork-context";

interface CoworkPanelProps {
  open: boolean;
  onClose: () => void;
}

export function CoworkPanel({ open, onClose }: CoworkPanelProps) {
  const t = useT();
  const { folder, supported, open: pick, openFromInput, clear, shareOutline, setShareOutline } = useCowork();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const shown = useMemo(() => (folder ? matchFiles(folder.files, q, 40) : []), [folder, q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt flex max-h-[88vh] w-full max-w-xl flex-col rounded-[22px] border"
            style={{
              background: "var(--t-surface, #0D1033)",
              borderColor: "var(--t-border)",
              color: "var(--t-text)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.55)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border)" }}>
              <div className="flex items-center gap-2">
                <FolderOpen className="size-5" style={{ color: "var(--t-accent)" }} />
                <span className="font-display text-lg font-bold">Cowork</span>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t("close")} style={{ color: "var(--t-text-muted)" }}>
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {!folder ? (
                <div className="py-6 text-center">
                  <p className="text-sm" style={{ color: "var(--t-text-muted)" }}>
                    {t("coworkIntro1")}
                    <br />
                    {t("coworkIntro2a")} <span style={{ color: "var(--t-accent)" }}>@rasm.png</span> {t("coworkIntro2b")}
                  </p>
                  <div className="mt-5 flex flex-col items-center gap-2">
                    {supported ? (
                      <button
                        type="button"
                        onClick={pick}
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                        style={{ background: "var(--t-primary)" }}
                      >
                        {t("coworkPickFolder")}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                          style={{ background: "var(--t-primary)" }}
                        >
                          {t("coworkPickFolder")}
                        </button>
                        <span className="text-[11px]" style={{ color: "var(--t-text-muted)" }}>
                          {t("coworkNoLiveFolder")}
                        </span>
                      </>
                    )}
                    <input
                      ref={inputRef}
                      type="file"
                      hidden
                      multiple
                      // @ts-expect-error — non-standard but supported everywhere we fall back to
                      webkitdirectory=""
                      onChange={(e) => e.target.files && openFromInput(e.target.files)}
                    />
                  </div>
                  <p className="mx-auto mt-6 flex max-w-sm items-start gap-2 rounded-xl border p-3 text-left text-[11px]" style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}>
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {t("coworkPrivacyNote")}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{folder.name}</div>
                      <div className="nums text-xs" style={{ color: "var(--t-text-muted)" }}>
                        {folder.files.length} {t("coworkFilesSuffix")}{folder.snapshot ? ` · ${t("coworkCopyLabel")}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clear}
                      className="rounded-lg border px-3 py-1.5 text-xs"
                      style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
                    >
                      {t("close")}
                    </button>
                  </div>

                  <label className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--t-border)" }}>
                    <Search className="size-4 shrink-0" style={{ color: "var(--t-text-muted)" }} />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t("searchFile")}
                      className="w-full bg-transparent text-sm outline-none placeholder:opacity-60"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShareOutline(!shareOutline)}
                    role="switch"
                    aria-checked={shareOutline}
                    className="mb-3 flex w-full items-center gap-3 rounded-xl border p-3 text-left"
                    style={{ borderColor: shareOutline ? "var(--t-primary)" : "var(--t-border)" }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{t("coworkShowOutline")}</span>
                      <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>
                        {t("coworkShowOutlineDesc")}
                      </span>
                    </span>
                    <span
                      className="relative h-6 w-11 shrink-0 rounded-full"
                      style={{ background: shareOutline ? "var(--t-primary)" : "color-mix(in srgb, var(--t-text) 18%, transparent)" }}
                    >
                      <span
                        className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform duration-200"
                        style={{ transform: shareOutline ? "translateX(20px)" : "translateX(0)" }}
                      />
                    </span>
                  </button>

                  {/* One panel with hairline rows — the file list is a single surface. */}
                  <ul
                    className="tt overflow-hidden"
                    style={{
                      border: "1px solid var(--t-border)",
                      borderRadius: 18,
                      background: "color-mix(in srgb, var(--t-text) 3%, transparent)",
                    }}
                  >
                    {shown.map((f, i) => (
                      <li
                        key={f.path}
                        className="truncate px-3 py-2 font-mono text-xs"
                        style={{
                          color: "var(--t-text-muted)",
                          borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
                        }}
                        title={f.path}
                      >
                        {f.path}
                      </li>
                    ))}
                    {!shown.length && (
                      <li className="py-6 text-center text-sm" style={{ color: "var(--t-text-muted)" }}>{t("notFound")}</li>
                    )}
                  </ul>

                  <p className="mt-4 text-center text-[11px]" style={{ color: "var(--t-text-muted)" }}>
                    {t("coworkAtHint_a")} <span style={{ color: "var(--t-accent)" }}>@</span> {t("coworkAtHint_b")}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
