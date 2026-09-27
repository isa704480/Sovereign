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
import { ConnectorIcon } from "./glyph-icons";
import { LoadError, SkeletonRows } from "./LoadState";
import { Switch } from "./Switch";

interface ConnectorsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ConnectorsPanel({ open, onClose }: ConnectorsPanelProps) {
  const t = useT();
  const lang = useLang();
  const [states, setStates] = useState<Record<string, ConnectorState>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
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
        setLoadError(false);
        setStates(Object.fromEntries(rows.map((r) => [r.connectorId, r])));
        setLoaded(true);
      })
      .catch(() => {
        // Holatlarni o'qib bo'lmadi — "hammasi uzilgan" deb ko'rsatmaymiz.
        if (!alive) return;
        setLoaded(false);
        setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [open, reload]);

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
            className="tt flex max-h-[calc(100svh-2rem)] w-full max-w-xl flex-col rounded-xl border outline-none md:max-h-[88vh]"
            style={{
              background: "var(--t-surface, #0D1033)",
              borderColor: "var(--t-border, rgba(255,255,255,0.1))",
              color: "var(--t-text, #F0F2FF)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.55)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <div className="flex items-center gap-2">
                <Plug className="size-5" style={{ color: "var(--t-text-muted, #9BA3CC)" }} aria-hidden />
                <h2 id={titleId} className="font-display text-lg font-bold">{t("pnConnectorsTitle")}</h2>
              </div>
              <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] md:size-9 [@media(pointer:coarse)]:md:size-11" aria-label={t("close")} style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-4 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                {t("pnConnectorsIntro")}
              </p>

              {loadError ? (
                <LoadError
                  onRetry={() => {
                    setLoadError(false);
                    setReload((n) => n + 1);
                  }}
                />
              ) : !loaded ? (
                <SkeletonRows rows={4} rowClassName="h-14" />
              ) : (
                CONNECTOR_CATEGORIES.map((cat) => {
                  const items = CONNECTORS.filter((c) => c.category === cat.id);
                  if (!items.length) return null;
                  return (
                    <div key={cat.id} className="mb-5">
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{connectorCategoryLabel(lang, cat)}</h3>
                      {/* Kategoriya — bitta panel, connectorlar hairline qatorlar (alohida kartalar emas). */}
                      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                        {items.map((spec, idx) => {
                          const st = stateOf(spec.id);
                          const isGoogle = spec.auth === "oauth-google";
                          const isBuiltin = spec.auth === "builtin";
                          const isTokenish = spec.auth === "token" || spec.auth === "mcp";
                          // Vositasi hali yo'q (Drive/Docs): "Tez orada", ulash tugmasi yo'q (faqat eski ulanishni uzish).
                          const soon = !!spec.comingSoon;
                          const tx = connectorText(lang, spec);
                          // config'dagi inglizcha tokenLabel o'rniga tarjima qilingan matn.
                          const tokenHint =
                            spec.auth === "mcp"
                              ? t("p7cMcpServerUrl")
                              : spec.tokenLabel
                                ? fmt(t("p8bPersonalToken"), { name: tx.name })
                                : t("pnToken");
                          return (
                            <div key={spec.id} className="p-3.5" style={{ borderTop: idx === 0 ? "none" : "1px solid var(--t-border, rgba(255,255,255,0.1))" }}>
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--t-text, #fff) 6%, transparent)" }}>
                                  <ConnectorIcon name={spec.icon} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{tx.name}</span>
                                    {soon && (
                                      <span className="rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: "color-mix(in srgb, var(--t-text, #fff) 8%, transparent)", color: "var(--t-text-muted, #9BA3CC)" }}>
                                        {t("p19ConnSoonBadge")}
                                      </span>
                                    )}
                                    {st.connected && !soon && (
                                      <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: "color-mix(in srgb, var(--t-success) 14%, transparent)", color: "var(--t-success)" }}>
                                        <Check className="size-3 shrink-0" aria-hidden /> {st.meta || t("pnConnected")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{tx.description}</div>
                                </div>
                                {(st.connected || isBuiltin) && !soon && (
                                  <Switch size="sm" on={st.enabled} onChange={(v) => toggle(spec, v)} label={tx.name} />
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
                                      className="min-h-9 min-w-0 flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] sm:text-xs [@media(pointer:coarse)]:min-h-11"
                                      style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => connect(spec)}
                                      disabled={busy === spec.id || !(draft[spec.id] ?? "").trim()}
                                      className="min-h-9 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40 [@media(pointer:coarse)]:min-h-11"
                                      style={{ background: "var(--t-primary-fill, #5B50F0)", color: "var(--t-on-primary, #fff)" }}
                                    >
                                      {busy === spec.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : t("pnConnect")}
                                    </button>
                                  </div>
                                  {spec.docsUrl && (
                                    <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="self-start text-xs underline" style={{ color: "var(--t-text-muted)" }}>
                                      {t("pnTokenWhere")}
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* token connected — uzish */}
                              {isTokenish && st.connected && (
                                <button type="button" onClick={() => disconnect(spec)} className="mt-2 min-h-8 text-xs underline [@media(pointer:coarse)]:min-h-11" style={{ color: "var(--t-text-muted)" }}>
                                  {t("pnDisconnect")}
                                </button>
                              )}

                              {/* Google — OAuth bilan ulash (Google Cloud sozlangan bo'lishi kerak) */}
                              {isGoogle && !st.connected && !soon && (
                                <div className="mt-2 flex flex-col gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void linkGoogle(spec)}
                                    disabled={busy === spec.id}
                                    className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60 [@media(pointer:coarse)]:min-h-11"
                                    style={{ background: "var(--t-primary-fill, #5B50F0)", color: "var(--t-on-primary, #fff)" }}
                                  >
                                    {busy === spec.id && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                                    {t("pnConnectGoogle")}
                                  </button>
                                  <span className="text-xs" style={{ color: "var(--t-text-muted)" }}>
                                    {fmt(t("pnGoogleOauthNote"), { extra: spec.sensitive ? t("pnGoogleReviewNote") : "" })}
                                  </span>
                                </div>
                              )}
                              {isGoogle && st.connected && (
                                <button type="button" onClick={() => disconnect(spec)} className="mt-2 min-h-8 text-xs underline [@media(pointer:coarse)]:min-h-11" style={{ color: "var(--t-text-muted)" }}>
                                  {t("pnDisconnect")}
                                </button>
                              )}
                              {/* Ulash / uzish / yoqish xatosi — har qanday turdagi ulanish uchun */}
                              {error[spec.id] && (
                                <p role="alert" className="mt-1.5 text-xs" style={{ color: "var(--t-danger, #EF4444)" }}>
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
