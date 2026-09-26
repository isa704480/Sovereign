import React, { useEffect, useRef, useState } from "react";
import Icon, { Logo } from "./Icon.jsx";
import SignIn from "./SignIn.jsx";
import { useT, LANGS } from "../lib/i18n.js";

const STEPS = ["welcome", "account", "folder", "safety"];

/** Birinchi ishga tushirish: til → akkaunt → ish papkasi → xavfsizlik modeli. */
export default function Onboarding({ info, lang, setLang, auth, onLogin, onCancelLogin, onPick, onOpenRecent, recent, onFinish }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const headRef = useRef(null);
  const name = STEPS[step];
  useEffect(() => { headRef.current?.focus(); }, [step]);
  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : onFinish());
  const back = () => setStep(Math.max(0, step - 1));

  return (
    <div className="onb">
      <div className="onb-card" role="region" aria-labelledby="onb-h">
        <ol className="onb-steps" aria-label={t("onb.progress", { n: step + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="onb-dot">{i < step ? <Icon name="check" size={11} stroke={2.4} /> : i + 1}</span>
              <span className="hide-narrow">{t(`onb.step.${s}`)}</span>
            </li>
          ))}
        </ol>

        {name === "welcome" && (
          <div className="onb-body">
            <Logo size={56} className="hero-logo" />
            <h1 id="onb-h" tabIndex={-1} ref={headRef}>{t("onb.welcome.title")}</h1>
            <p className="muted">{t("onb.welcome.sub")}</p>
            <div className="field mt">
              <span className="label-sm"><Icon name="globe" size={13} /> {t("settings.language")}</span>
              <div className="seg seg-wide" role="radiogroup" aria-label={t("settings.language")}>
                {LANGS.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className={`seg-btn ${lang === l.id ? "on" : ""}`} onClick={() => setLang(l.id)}>{l.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {name === "account" && (
          <div className="onb-body left">
            <h1 id="onb-h" tabIndex={-1} ref={headRef}>{t("onb.account.title")}</h1>
            <p className="muted">{t("onb.account.sub")}</p>
            <SignIn info={info} auth={auth} onLogin={onLogin} onCancel={onCancelLogin} />
          </div>
        )}

        {name === "folder" && (
          <div className="onb-body left">
            <h1 id="onb-h" tabIndex={-1} ref={headRef}>{t("onb.folder.title")}</h1>
            <p className="muted">{t("onb.folder.sub")}</p>
            <button type="button" className="folder-pick" onClick={onPick}>
              <Icon name={info.cwd ? "folderOpen" : "folder"} size={22} className="accent" />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="block strong">{info.cwd ? info.cwd.split(/[\\/]/).filter(Boolean).pop() : t("folder.choose")}</span>
                <span className="block faint small mono trunc">{info.cwd || t("folder.pickHint")}</span>
              </span>
              <span className="btn btn-sm">{info.cwd ? t("folder.change") : t("folder.browse")}</span>
            </button>
            {recent.filter((r) => r !== info.cwd).length > 0 && (
              <div className="mt">
                <div className="eyebrow">{t("folder.recent")}</div>
                {recent.filter((r) => r !== info.cwd).slice(0, 4).map((r) => (
                  <button key={r} type="button" className="recent-row" onClick={() => onOpenRecent(r)}>
                    <Icon name="history" size={13} /> <span className="trunc mono small">{r}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="faint small mt">{t("onb.folder.note")}</p>
          </div>
        )}

        {name === "safety" && (
          <div className="onb-body left">
            <h1 id="onb-h" tabIndex={-1} ref={headRef}>{t("onb.safety.title")}</h1>
            <p className="muted">{t("onb.safety.sub")}</p>
            <ul className="safety-grid">
              {[["diff", "s1"], ["alert", "s2"], ["undo", "s3"], ["shield", "s4"]].map(([icon, k]) => (
                <li key={k} className="safety-card">
                  <span className="safety-icon"><Icon name={icon} size={17} /></span>
                  <div>
                    <div className="strong">{t(`onb.safety.${k}.t`)}</div>
                    <div className="muted small">{t(`onb.safety.${k}.d`)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="onb-foot">
          {step > 0 ? <button type="button" className="btn btn-ghost" onClick={back}>{t("common.back")}</button> : <span />}
          <span className="grow" />
          {(name === "account" && !info.authed) || (name === "folder" && !info.cwd) ? (
            <button type="button" className="btn btn-ghost" onClick={next}>{t("common.skip")}</button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={next}>
            {step === STEPS.length - 1 ? t("onb.start") : t("common.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
