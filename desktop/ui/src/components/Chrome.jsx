import React from "react";
import Icon, { Logo } from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

/** Sarlavha paneli: oyna sudraladi; OS tugmalari (min/max/close) titleBarOverlay orqali. */
export function TitleBar({ info, onToggleSidebar, onTogglePanel, onPalette, sidebar, panel, minimal = false }) {
  const t = useT();
  const crumbs = (info?.cwd || "").split(/[\\/]/).filter(Boolean).slice(-2);
  return (
    <header className={`titlebar ${info?.platform === "darwin" ? "mac" : ""}`}>
      <div className="tb-left">
        <Logo size={18} />
        <span className="brand">SOVEREIGN <span className="brand-sub">Cowork</span></span>
        {!minimal && (
          <>
            <button type="button" className={`icon-btn nodrag ${sidebar ? "on" : ""}`} aria-label={t("tb.sidebar")} aria-pressed={sidebar} title={`${t("tb.sidebar")} (Ctrl+B)`} onClick={onToggleSidebar}>
              <Icon name="sidebar" size={15} />
            </button>
            {crumbs.length > 0 && (
              <span className="crumbs trunc" title={info.cwd}>
                <Icon name="folder" size={13} />
                {crumbs.map((c, i) => <React.Fragment key={i}>{i > 0 && <span className="faint">/</span>}<span className={i === crumbs.length - 1 ? "strong" : "faint"}>{c}</span></React.Fragment>)}
              </span>
            )}
          </>
        )}
      </div>
      {!minimal && (
        <button type="button" className="tb-search nodrag" onClick={onPalette} aria-label={t("palette.open")}>
          <Icon name="search" size={13} />
          <span className="grow">{t("palette.placeholderShort")}</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}
      <div className="tb-right">
        {!minimal && (
          <button type="button" className={`icon-btn nodrag ${panel ? "on" : ""}`} aria-label={t("tb.panel")} aria-pressed={panel} title={`${t("tb.panel")} (Ctrl+J)`} onClick={onTogglePanel}>
            <Icon name="panel" size={15} />
          </button>
        )}
      </div>
    </header>
  );
}

/** Pastki holat paneli: ulanish, papka, model, versiya. */
export function StatusBar({ info, mode, model, busy, onShortcuts, update, onUpdate }) {
  const t = useT();
  const conn = info.offline ? ["wifiOff", t("status.offlineMode"), "warn"] : info.authed ? ["check", t("status.connected"), "ok"] : ["user", t("account.notSignedIn"), "muted"];
  return (
    <footer className="statusbar">
      <span className={`sb-item sb-${conn[2]}`}><Icon name={conn[0]} size={12} /> {conn[1]}</span>
      {busy && <span className="sb-item"><span className="spinner sm" aria-hidden="true" /> {t("status.working")}</span>}
      <span className="grow" />
      {update?.state === "available" && <button type="button" className="sb-item sb-link" onClick={onUpdate}><Icon name="download" size={12} /> {t("update.available", { v: update.version })}</button>}
      {update?.state === "ready" && <button type="button" className="sb-item sb-link" onClick={onUpdate}><Icon name="refresh" size={12} /> {t("update.ready")}</button>}
      <span className="sb-item">{mode === "chat" ? t("mode.chat") : t("mode.code")}</span>
      <span className="sb-item"><Icon name="sparkle" size={12} /> {model}</span>
      <button type="button" className="sb-item sb-link" onClick={onShortcuts}><Icon name="keyboard" size={12} /> Ctrl /</button>
      <span className="sb-item faint">v{info.version}</span>
    </footer>
  );
}

/** Ekran o'quvchilari uchun e'lonlar + vizual toast'lar. */
export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.tone || "info"}`}>
          <Icon name={x.tone === "err" ? "alert" : x.tone === "ok" ? "check" : "info"} size={15} />
          <span className="grow">{x.text}</span>
          {x.action && <button type="button" className="link-btn" onClick={() => { x.action.run(); onDismiss(x.id); }}>{x.action.label}</button>}
          <button type="button" className="icon-btn" aria-label="×" onClick={() => onDismiss(x.id)}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  );
}
