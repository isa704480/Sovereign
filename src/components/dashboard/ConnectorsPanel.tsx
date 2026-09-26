"use client";

import { Check, Loader2, Plug, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  connectGoogle,
  connectToken,
  disconnectConnector,
  listConnectors,
  setConnectorEnabled,
  type ConnectorState,
} from "@/app/actions/connectors";
import { CONNECTORS, CONNECTOR_CATEGORIES, type ConnectorSpec } from "@/config/connectors";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { fmt } from "@/lib/i18n";
import { connectorCategoryLabel, connectorText } from "@/lib/locales/panels-data";
import { useLang, useT } from "@/store/chat";
import { useDialogA11y } from "./use-dialog-a11y";

interface ConnectorsPanelProps {
  open: boolean;
  onClose: () => void;
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: on ? "var(--t-primary, #5B50F0)" : "color-mix(in srgb, var(--t-text, #fff) 18%, transparent)" }}
    >
      <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "translateX(0)" }} />
    </button>
  );
}

export function ConnectorsPanel({ open, onClose }: ConnectorsPanelProps) {
  const t = useT();
  const lang = useLang();
  const [states, setStates] = useState<Record<string, ConnectorState>>({});
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const { panelRef, titleId, dialogProps } = useDialogA11y(open, onClose);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listConnectors()
      .then((rows) => {
        if (!alive) return;
        setStates(Object.fromEntries(rows.map((r) => [r.connectorId, r])));
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [open]);

  const stateOf = (id: string): ConnectorState => states[id] ?? { connectorId: id, enabled: false, connected: false };

  async function connect(spec: ConnectorSpec) {
    const token = (draft[spec.id] ?? "").trim();
    if (!token) return;
    setBusy(spec.id);
    setError((e) => ({ ...e, [spec.id]: "" }));
    let res: Awaited<ReturnType<typeof connectToken>>;
    try {
      res = await connectToken({ connectorId: spec.id, token });
    } catch {
      // Tarmoq uzildi — tugma abadiy "band" holatida qolmasin.
      res = { ok: false, error: t("chConnectionError") };
    } finally {
      setBusy(null);
    }
    if (!res.ok) {
      setError((e) => ({ ...e, [spec.id]: res.error }));
      return;
    }
    setStates((s) => ({ ...s, [spec.id]: { connectorId: spec.id, enabled: true, connected: true, meta: res.meta ?? null } }));
    setDraft((d) => ({ ...d, [spec.id]: "" }));
  }

  /** Optimistik o'zgarish serverda saqlanmasa — oldingi holatga qaytaramiz va xatoni ko'rsatamiz. */
  async function commit(spec: ConnectorSpec, next: ConnectorState, action: () => Promise<{ ok: boolean; error?: string }>) {
    const prev = stateOf(spec.id);
    setStates((s) => ({ ...s, [spec.id]: next }));
    setError((e) => ({ ...e, [spec.id]: "" }));
    const res = await action().catch(() => ({ ok: false, error: t("chConnectionError") }));
    if (!res.ok) {
      setStates((s) => ({ ...s, [spec.id]: prev }));
      setError((e) => ({ ...e, [spec.id]: res.error || t("chUnknownError") }));
    }
  }

  function toggle(spec: ConnectorSpec, on: boolean) {
    const cur = stateOf(spec.id);
    void commit(spec, { ...cur, enabled: on, connected: spec.auth === "builtin" ? on : cur.connected }, () =>
      setConnectorEnabled({ connectorId: spec.id, enabled: on }),
    );
  }

  function disconnect(spec: ConnectorSpec) {
    void commit(spec, { connectorId: spec.id, enabled: false, connected: false }, () => disconnectConnector(spec.id));
  }

  async function linkGoogle(spec: ConnectorSpec) {
    setBusy(spec.id);
    setError((e) => ({ ...e, [spec.id]: "" }));
    try {
      // Muvaffaqiyatda server Google'ga yo'naltiradi; bu yerga faqat xato qaytadi.
      const res = await connectGoogle(spec.id);
      if (res && !res.ok) setError((e) => ({ ...e, [spec.id]: res.error }));
    } catch (err) {
      // redirect() — Next o'zi yo'naltiradi; boshqa xatolar esa tarmoq uzilishi.
      if (!(err instanceof Error && /NEXT_REDIRECT/.test(err.message))) {
        setError((e) => ({ ...e, [spec.id]: t("chConnectionError") }));
      }
    } finally {
      setBusy(null);
    }
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
            className="tt flex max-h-[calc(100svh-2rem)] w-full max-w-xl flex-col rounded-3xl border shadow-lg outline-none md:max-h-[88vh]"
            style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <div className="flex items-center gap-2">
                <Plug className="size-5" style={{ color: "var(--t-accent, #7C6FF7)" }} />
                <h2 id={titleId} className="font-display text-lg font-bold">{t("pnConnectorsTitle")}</h2>
              </div>
              <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10 md:size-9" aria-label={t("close")} style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-4 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                {t("pnConnectorsIntro")}
              </p>

              {!loaded ? (
                <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin" style={{ color: "var(--t-text-muted)" }} /></div>
              ) : (
                CONNECTOR_CATEGORIES.map((cat) => {
                  const items = CONNECTORS.filter((c) => c.category === cat.id);
                  if (!items.length) return null;
                  return (
                    <div key={cat.id} className="mb-5">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{connectorCategoryLabel(lang, cat)}</div>
                      <div className="flex flex-col gap-2">
                        {items.map((spec) => {
                          const st = stateOf(spec.id);
                          const isGoogle = spec.auth === "oauth-google";
                          const isBuiltin = spec.auth === "builtin";
                          const isTokenish = spec.auth === "token" || spec.auth === "mcp";
                          const tx = connectorText(lang, spec);
                          // config'dagi inglizcha tokenLabel o'rniga tarjima qilingan matn.
                          const tokenHint =
                            spec.auth === "mcp"
                              ? t("p7cMcpServerUrl")
                              : spec.tokenLabel
                                ? fmt(t("p8bPersonalToken"), { name: tx.name })
                                : t("pnToken");
                          return (
                            <div key={spec.id} className="rounded-2xl border p-3.5" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))", background: "color-mix(in srgb, var(--t-text, #fff) 3%, transparent)" }}>
                              <div className="flex items-start gap-3">
                                <span className="text-xl leading-none">{spec.glyph}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{tx.name}</span>
                                    {st.connected && (
                                      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "color-mix(in srgb, var(--t-primary) 20%, transparent)", color: "var(--t-accent)" }}>
                                        <Check className="size-3" /> {st.meta || t("pnConnected")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{tx.description}</div>
                                </div>
                                {(st.connected || isBuiltin) && (
                                  <Toggle on={st.enabled} onChange={(v) => toggle(spec, v)} label={tx.name} />
                                )}
                              </div>

                              {/* token / mcp — ulash maydonchasi */}
                              {isTokenish && !st.connected && (
                                <div className="mt-3 flex flex-col gap-1.5">
                                  <div className="flex gap-2">
                                    <input
                                      type={spec.auth === "mcp" ? "text" : "password"}
                                      value={draft[spec.id] ?? ""}
                                      onChange={(e) => setDraft((d) => ({ ...d, [spec.id]: e.target.value }))}
                                      placeholder={tokenHint}
                                      aria-label={`${tx.name}: ${tokenHint}`}
                                      className="min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] sm:text-xs"
                                      style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => connect(spec)}
                                      disabled={busy === spec.id || !(draft[spec.id] ?? "").trim()}
                                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
                                      style={{ background: "var(--t-primary, #5B50F0)" }}
                                    >
                                      {busy === spec.id ? <Loader2 className="size-3.5 animate-spin" /> : t("pnConnect")}
                                    </button>
                                  </div>
                                  {spec.docsUrl && (
                                    <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: "var(--t-text-muted)" }}>
                                      {t("pnTokenWhere")}
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* token connected — uzish */}
                              {isTokenish && st.connected && (
                                <button type="button" onClick={() => disconnect(spec)} className="mt-2 text-[11px] underline" style={{ color: "var(--t-text-muted)" }}>
                                  {t("pnDisconnect")}
                                </button>
                              )}

                              {/* Google — OAuth bilan ulash (Google Cloud sozlangan bo'lishi kerak) */}
                              {isGoogle && !st.connected && (
                                <div className="mt-2 flex flex-col gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void linkGoogle(spec)}
                                    disabled={busy === spec.id}
                                    className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                                    style={{ background: "var(--t-primary, #5B50F0)" }}
                                  >
                                    {busy === spec.id && <Loader2 className="size-3.5 animate-spin" />}
                                    {t("pnConnectGoogle")}
                                  </button>
                                  <span className="text-[11px]" style={{ color: "var(--t-text-muted)" }}>
                                    {fmt(t("pnGoogleOauthNote"), { extra: spec.sensitive ? t("pnGoogleReviewNote") : "" })}
                                  </span>
                                </div>
                              )}
                              {isGoogle && st.connected && (
                                <button type="button" onClick={() => disconnect(spec)} className="mt-2 text-[11px] underline" style={{ color: "var(--t-text-muted)" }}>
                                  {t("pnDisconnect")}
                                </button>
                              )}
                              {/* Ulash / uzish / yoqish xatosi — har qanday turdagi ulanish uchun */}
                              {error[spec.id] && (
                                <p role="alert" className="mt-1.5 text-[11px]" style={{ color: "#EB5A64" }}>
                                  {error[spec.id]}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
