import React, { useState } from "react";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

/**
 * Tasdiqlash kodi (RFC 8628 user code): katta, nusxalanadigan. Foydalanuvchi uni brauzerda
 * ochilgan sahifaga O'ZI teradi — kod URL'da yo'q, shuning uchun birov yuborgan havola
 * bilan hisobga kirib bo'lmaydi.
 */
function UserCodeWaiting({ auth, onCancel }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(auth.userCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  return (
    <div className="signin waiting usercode" role="status" aria-live="polite">
      <div className="grow">
        <div className="row gap-sm">
          <span className="spinner" aria-hidden="true" />
          <span className="strong">{t("account.userCodeTitle")}</span>
        </div>
        <div className="usercode-box mt-sm">
          <span className="usercode-value mono" aria-label={t("account.userCodeAria")}>
            {auth.userCode}
          </span>
          <button type="button" className="btn btn-sm" onClick={copy} title={t("common.copy")}>
            <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <div className="small mt-sm">{auth.openFailed ? t("account.openFailed") : t("account.userCodeHint")}</div>
        <div className="banner banner-warn mt-sm">
          <Icon name="alert" size={14} />
          <span>{t("account.userCodeWarn")}</span>
        </div>
        <div className="row gap-sm mt-sm">
          <button type="button" className="btn btn-sm" onClick={onCancel}>{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Brauzer orqali kirish holati.
 * auth: { state: idle|starting|waiting|approved|expired|cancelled|error, userCode?, code?, message? }
 * userCode — yangi server (terib kiritiladigan kod); code — eski server (solishtirish uchun).
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
  if (st === "waiting" && auth.userCode) {
    return <UserCodeWaiting auth={auth} onCancel={onCancel} />;
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
