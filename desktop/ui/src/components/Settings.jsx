import React, { useState } from "react";
import Modal from "./Modal.jsx";
import Icon, { Logo } from "./Icon.jsx";
import SignIn from "./SignIn.jsx";
import ModelPicker from "./ModelPicker.jsx";
import { useT, LANGS } from "../lib/i18n.js";

const SECTIONS = [
  ["general", "settings"],
  ["model", "sparkle"],
  ["workspace", "folder"],
  ["account", "user"],
  ["privacy", "lock"],
  ["about", "info"],
];

function Toggle({ checked, onChange, label, desc }) {
  return (
    <label className="toggle-row">
      <span className="grow">
        <span className="block strong small">{label}</span>
        {desc && <span className="block faint small">{desc}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg seg-wide" role="radiogroup" aria-label={label}>
      {options.map(([v, l, icon]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`seg-btn ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
          {icon && <Icon name={icon} size={13} />} {l}
        </button>
      ))}
    </div>
  );
}

export default function Settings({ initial = "general", onClose, info, settings, setSetting, lang, setLang, model, onModel, auth, onLogin, onCancelLogin, onLogout, onPick, onOpenRecent, onReveal, recent, onClearHistory, update, onUpdateAction, onLink }) {
  const t = useT();
  const [sec, setSec] = useState(initial);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Modal title={t("settings.title")} onClose={onClose} width={820} className="settings">
      <div className="settings-grid">
        <nav className="settings-nav" role="tablist" aria-orientation="vertical" aria-label={t("settings.title")}>
          {SECTIONS.map(([k, icon]) => (
            <button key={k} type="button" role="tab" aria-selected={sec === k} className={`settings-tab ${sec === k ? "on" : ""}`} onClick={() => setSec(k)}>
              <Icon name={icon} size={15} /> {t(`settings.${k}`)}
            </button>
          ))}
        </nav>
        <div className="settings-pane" role="tabpanel">
          {sec === "general" && (
            <>
              <h3>{t("settings.general")}</h3>
              <div className="field">
                <span className="label-sm">{t("settings.theme")}</span>
                <Seg label={t("settings.theme")} value={settings.theme} onChange={(v) => setSetting({ theme: v })} options={[["system", t("theme.system"), "monitor"], ["dark", t("theme.dark"), "moon"], ["light", t("theme.light"), "sun"]]} />
              </div>
              <div className="field">
                <span className="label-sm">{t("settings.language")}</span>
                <Seg label={t("settings.language")} value={lang} onChange={setLang} options={LANGS.map((l) => [l.id, l.label])} />
              </div>
              <div className="field">
                <span className="label-sm">{t("settings.defaultMode")}</span>
                <Seg label={t("settings.defaultMode")} value={settings.defaultMode} onChange={(v) => setSetting({ defaultMode: v })} options={[["code", t("mode.code"), "code"], ["chat", t("mode.chat"), "chat"]]} />
              </div>
              <Toggle checked={!!settings.fullAuto} onChange={(v) => setSetting({ fullAuto: v })} label={t("settings.fullAuto")} desc={t("settings.fullAutoDesc")} />
              <Toggle checked={settings.notifications} onChange={(v) => setSetting({ notifications: v })} label={t("settings.notifications")} desc={t("settings.notificationsDesc")} />
            </>
          )}

          {sec === "model" && (
            <>
              <h3>{t("settings.model")}</h3>
              <p className="muted small">{t("settings.modelDesc")}</p>
              <div className="row gap-sm mt">
                <ModelPicker label={model} onSelect={onModel} placement="down" />
                {model !== "Auto" && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onModel("", "Auto")}>{t("model.useAuto")}</button>}
              </div>
            </>
          )}

          {sec === "workspace" && (
            <>
              <h3>{t("settings.workspace")}</h3>
              <div className="folder-pick static">
                <Icon name="folder" size={20} className="accent" />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="block strong">{info.cwd ? info.cwd.split(/[\\/]/).filter(Boolean).pop() : t("folder.none")}</span>
                  <span className="block faint small mono trunc">{info.cwd || t("folder.pickHint")}</span>
                </span>
                {info.cwd && <button type="button" className="btn btn-sm btn-ghost" onClick={onReveal}><Icon name="external" size={13} /> {t("files.reveal")}</button>}
                <button type="button" className="btn btn-sm" onClick={onPick}>{info.cwd ? t("folder.change") : t("folder.browse")}</button>
              </div>
              {recent.length > 0 && (
                <div className="mt">
                  <div className="eyebrow">{t("folder.recent")}</div>
                  {recent.map((r) => (
                    <button key={r} type="button" className={`recent-row ${r === info.cwd ? "on" : ""}`} onClick={() => onOpenRecent(r)} disabled={r === info.cwd}>
                      <Icon name={r === info.cwd ? "check" : "history"} size={13} /> <span className="trunc mono small">{r}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="faint small mt">{t("onb.folder.note")}</p>
            </>
          )}

          {sec === "account" && (
            <>
              <h3>{t("settings.account")}</h3>
              <SignIn info={info} auth={auth} onLogin={onLogin} onCancel={onCancelLogin} onLogout={onLogout} />
            </>
          )}

          {sec === "privacy" && (
            <>
              <h3>{t("settings.privacy")}</h3>
              <ul className="plain-list muted small">
                <li>{t("privacy.p1")}</li>
                <li>{t("privacy.p2")}</li>
                <li>{t("privacy.p3")}</li>
              </ul>
              <div className="danger-zone mt">
                <div className="grow">
                  <div className="strong small">{t("privacy.clear")}</div>
                  <div className="faint small">{t("privacy.clearDesc")}</div>
                </div>
                {confirmClear ? (
                  <span className="row gap-sm">
                    <button type="button" className="btn btn-sm" onClick={() => setConfirmClear(false)} data-autofocus>{t("common.cancel")}</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => { onClearHistory(); setConfirmClear(false); }}>{t("privacy.clearConfirm")}</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setConfirmClear(true)}><Icon name="trash" size={13} /> {t("privacy.clear")}</button>
                )}
              </div>
            </>
          )}

          {sec === "about" && (
            <>
              <h3>{t("settings.about")}</h3>
              <div className="about-head">
                <Logo size={40} />
                <div>
                  <div className="strong">SOVEREIGN Cowork</div>
                  <div className="faint small mono">v{info.version} · {info.platform}{info.offline ? ` · ${t("about.offline")}` : ""}</div>
                </div>
              </div>
              <div className="field mt">
                <span className="label-sm">{t("update.title")}</span>
                <div className="row gap-sm">
                  <span className="grow small muted" role="status">{t(`update.state.${update?.state ?? "idle"}`, { v: update?.version ?? "", p: update?.percent ?? 0 })}</span>
                  {update?.state === "available" && <button type="button" className="btn btn-sm btn-primary" onClick={() => onUpdateAction("download")}><Icon name="download" size={13} /> {t("update.download")}</button>}
                  {update?.state === "ready" && <button type="button" className="btn btn-sm btn-primary" onClick={() => onUpdateAction("install")}>{t("update.restart")}</button>}
                  {!["disabled", "checking", "downloading", "ready", "available"].includes(update?.state) && <button type="button" className="btn btn-sm" onClick={() => onUpdateAction("check")}><Icon name="refresh" size={13} /> {t("update.check")}</button>}
                </div>
              </div>
              <Toggle checked={settings.autoUpdate} onChange={(v) => setSetting({ autoUpdate: v })} label={t("settings.autoUpdate")} desc={t("settings.autoUpdateDesc")} />
              <div className="banner banner-info mt"><Icon name="info" size={14} /><span>{t("about.smartscreen")}</span></div>
              <div className="row gap-sm mt wrap">
                {["website", "docs", "status", "releases"].map((k) => (
                  <button key={k} type="button" className="btn btn-sm btn-ghost" onClick={() => onLink(k)}><Icon name="external" size={13} /> {t(`about.${k}`)}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
