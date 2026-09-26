import React from "react";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

/**
 * Brauzer orqali kirish holati. auth: { state: idle|starting|waiting|approved|expired|cancelled|error, code?, message? }
 */
export default function SignIn({ info, auth, onLogin, onCancel, onLogout }) {
  const t = useT();
  const st = auth?.state ?? "idle";
  if (info.authed) {
    return (
      <div className="signin ok">
        <span className="avatar-lg"><Icon name="check" size={18} stroke={2} /></span>
        <div className="grow">
          <div className="strong">{t("account.connectedAs")}</div>
          <div className="mono small">{info.email || t("account.connected")}</div>
          <div className="faint small">{t("account.sharedWithCli")}</div>
        </div>
        {onLogout && <button type="button" className="btn btn-sm" onClick={onLogout}>{t("account.signOut")}</button>}
      </div>
    );
  }
  if (st === "starting" || st === "waiting") {
    return (
      <div className="signin waiting" role="status" aria-live="polite">
        <span className="spinner lg" aria-hidden="true" />
        <div className="grow">
          <div className="strong">{t("account.waiting")}</div>
          {auth.code && (
            <div className="small">
              {t("account.codeLabel")} <span className="code-chip mono">{auth.code}</span>
            </div>
          )}
          <div className="faint small">{auth.openFailed ? t("account.openFailed") : t("account.waitingHint")}</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    );
  }
  const errText =
    st === "expired" ? t("account.expired")
    : st === "cancelled" ? t("account.cancelled")
    : st === "error" ? (auth.message === "offline" || info.offline ? t("account.offline") : t("account.error"))
    : "";
  return (
    <div className="signin">
      <div className="grow">
        <p className="muted small">{t("account.explain")}</p>
        {errText && <div className="banner banner-warn mt-sm"><Icon name="alert" size={14} /><span>{errText}</span></div>}
        {info.offline && !errText && <div className="banner banner-warn mt-sm"><Icon name="wifiOff" size={14} /><span>{t("account.offline")}</span></div>}
        <div className="row gap-sm mt">
          <button type="button" className="btn btn-primary" onClick={onLogin} disabled={info.offline}>
            <Icon name="globe" size={15} /> {t("account.signInBrowser")}
          </button>
        </div>
        <p className="faint small mt-sm">{t("account.cliAlt")} <code className="inline">sovereign login</code></p>
      </div>
    </div>
  );
}
