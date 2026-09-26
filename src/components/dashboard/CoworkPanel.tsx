"use client";

import { Check, CheckCheck, FileCode2, FileDown, FolderOpen, Info, Loader2, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { extractWriteBlocks, matchFiles } from "@/lib/cowork/folder";
import { fmt } from "@/lib/i18n";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { useT, type ChatMessage } from "@/store/chat";
import { useCowork } from "./cowork-context";
import { useDialogA11y } from "./use-dialog-a11y";

interface CoworkPanelProps {
  open: boolean;
  onClose: () => void;
  messages?: ChatMessage[];
}

type Change = { path: string; content: string };

/** Suhbatdagi barcha AI fayl-yozuvlarini yig'adi (oxirgi holat har fayl uchun). */
function collectChanges(messages: ChatMessage[]): Change[] {
  const byPath = new Map<string, string>();
  for (const m of messages) {
    if (m.role !== "assistant" || m.status === "streaming") continue;
    for (const w of extractWriteBlocks(m.content)) byPath.set(w.path, w.content);
  }
  return [...byPath.entries()].map(([path, content]) => ({ path, content }));
}

/** O'zgarishlar paneli — Reja→Fayllar→Natija oqimining "Fayllar/Natija" qismi. */
function CoworkChanges({ changes }: { changes: Change[] }) {
  const t = useT();
  const { canWrite, applyWrite } = useCowork();
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isApplied = (c: Change) => applied[c.path] === c.content;
  const pending = changes.filter((c) => !isApplied(c));

  const applyOne = async (c: Change) => {
    setBusy(c.path);
    setErr(null);
    try {
      await applyWrite(c.path, c.content);
      setApplied((a) => ({ ...a, [c.path]: c.content }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("pnCwError"));
    } finally {
      setBusy(null);
    }
  };

  const applyAll = async () => {
    for (const c of pending) {
      await applyOne(c);
    }
  };

  const download = (c: Change) => {
    const url = URL.createObjectURL(new Blob([c.content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = c.path.split("/").pop() ?? "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-4" style={{ color: "#10D4A0" }} />
          <span className="text-sm font-semibold">{t("pnCwChanges")}</span>
          <span className="nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--t-text) 8%, transparent)", color: "var(--t-text-muted)" }}>
            {changes.length}
          </span>
        </div>
        {canWrite && pending.length > 0 && (
          <button
            type="button"
            onClick={applyAll}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--t-primary)" }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
            {t("pnCwApplyAll")}
          </button>
        )}
      </div>

      <ul className="tt overflow-hidden" style={{ border: "1px solid var(--t-border)", borderRadius: 16, background: "color-mix(in srgb, var(--t-text) 3%, transparent)" }}>
        {changes.map((c, i) => {
          const done = isApplied(c);
          const lines = c.content.split("\n").length;
          return (
            <li
              key={c.path}
              className="flex items-center gap-3 px-3 py-2"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--t-border))" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs" style={{ color: "var(--t-text)" }} title={c.path}>{c.path}</span>
                <span className="nums text-[10px]" style={{ color: "var(--t-text-muted)" }}>{fmt(t("pnCwLines"), { n: lines })}</span>
              </span>
              {done ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#10D4A0" }}>
                  <Check className="size-3.5" /> {t("pnCwApplied")}
                </span>
              ) : canWrite ? (
                <button
                  type="button"
                  onClick={() => applyOne(c)}
                  disabled={busy === c.path}
                  className="rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
                  style={{ borderColor: "var(--t-border)", color: "var(--t-primary)" }}
                  aria-label={fmt(t("pnCwApplyAria"), { path: c.path })}
                >
                  {busy === c.path ? <Loader2 className="size-3.5 animate-spin" /> : t("pnCwApply")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => download(c)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium"
                  style={{ background: "color-mix(in srgb, var(--t-text) 10%, transparent)", color: "var(--t-text)" }}
                  aria-label={fmt(t("pnCwDownloadAria"), { path: c.path })}
                >
                  <FileDown className="size-3.5" /> {t("pnCwDownload")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {err && <div className="mt-2 text-xs" style={{ color: "#EF4444" }}>{err}</div>}
      {!canWrite && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--t-text-muted)" }}>
          {t("pnCwConnectHint")}
        </div>
      )}
    </div>
  );
}

export function CoworkPanel({ open, onClose, messages = [] }: CoworkPanelProps) {
  const t = useT();
  const { folder, supported, open: pick, openFromInput, clear, shareOutline, setShareOutline } = useCowork();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const changes = useMemo(() => collectChanges(messages), [messages]);

  const { panelRef, titleId, dialogProps } = useDialogA11y(open, onClose);

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
        >
          <motion.div
            ref={panelRef}
            {...dialogProps}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt flex max-h-[88vh] w-full max-w-xl flex-col rounded-[22px] border outline-none"
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
                <h2 id={titleId} className="font-display text-lg font-bold">Cowork</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t("close")} style={{ color: "var(--t-text-muted)" }}>
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {changes.length > 0 && <CoworkChanges changes={changes} />}
              {!folder ? (
                <div className="py-6 text-center">
                  <p className="text-sm" style={{ color: "var(--t-text-muted)" }}>
                    {t("coworkIntro1")}
                    <br />
                    {t("coworkIntro2a")} <span style={{ color: "var(--t-accent)" }}>{t("pnCwExampleFile")}</span> {t("coworkIntro2b")}
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
                      aria-label={t("searchFile")}
                      className="w-full bg-transparent text-base outline-none placeholder:opacity-60 sm:text-sm"
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
