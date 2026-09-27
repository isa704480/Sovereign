import React, { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Icon, { Logo } from "./Icon.jsx";
import SignIn from "./SignIn.jsx";
import ModelPicker, { LocalRecommend, LocalCaps, loadLocal } from "./ModelPicker.jsx";
import { useT, LANGS } from "../lib/i18n.js";
import { tabKeyDown } from "../lib/tabs.js";
import { formatTokens } from "../lib/agent.js";
import { useLocalMode, setLocalMode, refreshLocal } from "../lib/localMode.js";
import { SKILLS, MAX_ACTIVE_SKILLS, skillName } from "../lib/skills.js";

/** Vazifa uchun token byudjeti tanlovlari (0 — cheklovsiz). */
const BUDGETS = [0, 50_000, 100_000, 250_000, 500_000, 1_000_000];

const SECTIONS = [
  ["general", "settings"],
  ["model", "sparkle"],
  ["skills", "layers"],
  ["local", "monitor"],
  ["workspace", "folder"],
  ["account", "user"],
  ["privacy", "lock"],
  ["about", "info"],
];

function Toggle({ checked, onChange, label, desc, disabled = false }) {
  return (
    <label className={`toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span className="grow">
        <span className="block strong small">{label}</span>
        {desc && <span className="block faint small">{desc}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
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

/** Sandbox usuli nomi (brend nomlari — tarjima qilinmaydi). */
const SANDBOX_METHOD = { bwrap: "bubblewrap", "sandbox-exec": "sandbox-exec", docker: "Docker", podman: "Podman", env: "env" };
const SANDBOX_HINTS = new Set(["no-engine", "engine-down", "no-image", "no-bwrap", "bwrap-failed", "no-sandbox-exec", "sandbox-exec-failed", "workspace-home", "off"]);

/**
 * "Buyruqlar sandbox'i" qatori: Full auto buyruqlari HAQIQATDA qaysi darajada bajariladi
 * (full / container / limited — main: sandbox:status, cli/src/sandbox.mjs) va rejim (auto / required / off).
 */
function SandboxSection({ settings, setSetting }) {
  const t = useT();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false); // tekshiruv xatosi — abadiy "tekshirilmoqda" emas
  const mode = settings.sandbox ?? "auto";
  const load = (force = false) => {
    if (!window.sovereign?.sandboxStatus) { setFailed(true); return; }
    setBusy(true);
    setFailed(false);
    Promise.resolve(window.sovereign.sandboxStatus(force))
      .then((s) => { if (s?.level) setSt(s); else { setSt(null); setFailed(true); } })
      .catch(() => { setSt(null); setFailed(true); })
      .finally(() => setBusy(false));
  };
  useEffect(() => { load(false); }, [mode]);
  const level = st?.level;
  const real = level === "full" || level === "container";
  const hintKey = st ? (SANDBOX_HINTS.has(st.reason) ? st.reason : SANDBOX_HINTS.has(st.containerReason) ? st.containerReason : "") : "";
  return (
    <div className="field">
      <span className="label-sm">{t("settings.sandbox")}</span>
      <div className="row gap-sm" role="status" aria-live="polite">
        {!busy && failed ? (
          <span className="grow small err"><Icon name="alert" size={12} /> {t("settings.sandboxError")}</span>
        ) : busy || !st ? (
          <span className="grow small muted"><span className="spinner sm" aria-hidden="true" /> {t("settings.sandboxChecking")}</span>
        ) : (
          <>
            <span className={`pill ${real ? "pill-ok" : "pill-failed"}`}><Icon name={real ? "lock" : "info"} size={12} /> {t(`sandbox.level.${level}`)}</span>
            <span className="grow small muted">{t(`sandbox.desc.${level}`, { method: SANDBOX_METHOD[st.method] ?? st.method, image: st.image || "" })}</span>
          </>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => load(true)} disabled={busy}><Icon name="refresh" size={13} /> {t("settings.sandboxRecheck")}</button>
      </div>
      {!busy && st && !real && hintKey && <span className="block faint small mt-sm">{t(`sandbox.hint.${hintKey}`, { image: st.image || "" })}</span>}
      <div className="mt-sm">
        <Seg label={t("settings.sandbox")} value={mode} onChange={(v) => setSetting({ sandbox: v })} options={[["auto", t("settings.sandboxMode.auto")], ["required", t("settings.sandboxMode.required")], ["off", t("settings.sandboxMode.off")]]} />
      </div>
      <span className="block faint small mt-sm">{t(`settings.sandboxModeDesc.${mode}`)}</span>
    </div>
  );
}

/**
 * "Skillar" bo'limi: akkauntda yoqilgan SOVEREIGN Skills (web va CLI bilan umumiy — /api/cli/me,
 * so'rov main jarayondan, token renderer'ga chiqmaydi). Qo'llanmalarni server qo'shadi.
 */
function SkillsSection({ authed }) {
  const t = useT();
  const local = useLocalMode();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [enabled, setEnabled] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!authed) return undefined;
    let alive = true;
    setStatus("loading");
    setErr("");
    Promise.resolve(window.sovereign?.skills?.get() ?? null).catch(() => null).then((r) => {
      if (!alive) return;
      if (r?.ok) {
        setEnabled(r.enabled ?? []);
        setStatus("ready");
      } else {
        setErr(r?.error === "offline" ? "settings.skillsOffline" : "settings.skillsError");
        setStatus("error");
      }
    });
    return () => { alive = false; };
  }, [authed, reload]);

  const toggle = async (id, on) => {
    if (busy) return;
    const prev = enabled;
    const next = on ? [...prev, id] : prev.filter((x) => x !== id);
    setEnabled(next); // darhol ko'rinadi; xato bo'lsa qaytariladi
    setBusy(true);
    setErr("");
    const r = await Promise.resolve(window.sovereign?.skills?.set(next) ?? null).catch(() => null);
    setBusy(false);
    if (r?.ok) setEnabled(r.enabled ?? next);
    else {
      setEnabled(prev);
      setErr(r?.error === "offline" ? "settings.skillsOffline" : "settings.skillsSaveError");
    }
  };

  return (
    <>
      <h3>{t("settings.skills")}</h3>
      <p className="muted small">{t("settings.skillsDesc")}</p>
      {!authed && <div className="banner banner-info mt" role="status"><Icon name="user" size={14} /><span>{t("settings.skillsNeedAuth")}</span></div>}
      {local && <div className="banner banner-warn mt-sm" role="status"><Icon name="monitor" size={14} /><span>{t("settings.skillsLocal")}</span></div>}
      {err && (
        <div className="banner banner-danger mt-sm" role="alert">
          <Icon name="alert" size={14} />
          <span className="grow">{t(err)}</span>
          {status === "error" && <button type="button" className="link-btn" onClick={() => setReload((n) => n + 1)}>{t("common.retry")}</button>}
        </div>
      )}
      {authed && status === "loading" && <div className="muted small mt" role="status"><span className="spinner sm" aria-hidden="true" /> {t("common.loading")}</div>}
      {authed && status === "ready" && (
        <div className="mt">
          {SKILLS.map((s) => {
            const name = skillName(s, t);
            return (
              <label key={s.id} className="toggle-row skill-row">
                <span className="skill-mark"><Icon name={s.icon} size={15} /></span>
                <span className="grow">
                  <span className="block strong small">
                    {name}
                    <span className="pill" title={t(s.auto ? "settings.skillsAutoTitle" : "settings.skillsManualTitle")}>{t(s.auto ? "settings.skillsAuto" : "settings.skillsManual")}</span>
                  </span>
                  <span className="block faint small">{t(`skill.${s.id}.desc`)}</span>
                </span>
                <input type="checkbox" role="switch" className="switch" checked={enabled.includes(s.id)} disabled={busy} onChange={(e) => toggle(s.id, e.target.checked)} aria-label={name} />
              </label>
            );
          })}
          <p className="faint small mt-sm">{t("settings.skillsLimit", { n: MAX_ACTIVE_SKILLS })}</p>
        </div>
      )}
    </>
  );
}

const LOCAL_ERRORS = new Set(["busy", "bad-model", "unavailable", "not-installed"]);
const CONTEXT_ENV_HINT = "OLLAMA_CONTEXT_LENGTH=16384";

/**
 * "Mahalliy model" bo'limi: Ollama holati, zaxira rejimi (localFallback), standart model, o'rnatilgan
 * modellar (vositalar/rasm/o'lcham), RAM bo'yicha tavsiya va halol izohlar, Full auto + mahalliy tasdig'i.
 * Ollama'ga faqat main ulanadi (127.0.0.1); renderer URL bermaydi.
 */
function LocalSection({ settings, setSetting, onLink }) {
  const t = useT();
  const local = useLocalMode();
  const [st, setSt] = useState(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [confirmFA, setConfirmFA] = useState(false);

  useEffect(() => {
    let alive = true;
    setSt(null);
    // Avval tez holat (imkoniyatlarsiz), keyin har model uchun imkoniyatlar (/api/show).
    loadLocal(false).then((d) => {
      if (!alive) return;
      setSt(d);
      // ModelPicker yoki taklif kartasi orqali tanlangan model main'da saqlangan — sozlamani tenglashtiramiz.
      if (d.localModel && d.localModel !== settings.localModel) setSetting({ localModel: d.localModel });
      if (d.available && d.models.length) loadLocal(true).then((c) => alive && c.available && setSt((p) => ({ ...(p ?? d), models: c.models })));
    });
    return () => { alive = false; };
  }, [reload]);

  const switchTo = async (name) => {
    if (busy) return;
    setBusy(name || "\u0000cloud");
    setErr("");
    const r = await (window.sovereign?.local?.use(name) ?? Promise.resolve(null)).catch(() => null);
    setBusy("");
    if (!r?.ok) { setErr(t(`model.local.err.${LOCAL_ERRORS.has(r?.error) ? r.error : "unavailable"}`)); return; }
    setLocalMode(r.local ?? null);
    // main tanlovni localModel sifatida saqlaydi — renderer holati ham shunga tenglashadi.
    if (name && settings.localModel !== name) setSetting({ localModel: name });
  };

  const names = st?.models.map((m) => m.name) ?? [];
  const saved = settings.localModel || "";
  const modelOptions = saved && !names.includes(saved) ? [saved, ...names] : names;
  const fullAutoOn = !!settings.fullAuto;
  const setFullAutoLocal = (on) => {
    if (!on) { setConfirmFA(false); Promise.resolve(setSetting({ fullAutoLocal: false })).then(refreshLocal); return; }
    setConfirmFA(true); // yoqish — faqat alohida tasdiq bilan (quyidagi ogohlantirish)
  };

  return (
    <>
      <h3>{t("settings.local")}</h3>
      <p className="muted small">{t("settings.localDesc")}</p>

      {!st ? (
        <div className="muted small mt" role="status"><span className="spinner sm" aria-hidden="true" /> {t("common.loading")}</div>
      ) : st.available ? (
        <div className="banner banner-info mt" role="status">
          <Icon name="check" size={14} />
          <span className="grow">{t("settings.localStatusOn", { v: st.version || "?" })}{st.ramGb ? ` · ${t("local.ram", { ram: st.ramGb })}` : ""}</span>
          <button type="button" className="link-btn" onClick={() => setReload((n) => n + 1)}>{t("common.retry")}</button>
        </div>
      ) : (
        <div className="banner banner-warn mt" role="status">
          <Icon name="wifiOff" size={14} />
          <span className="grow">{t("model.local.unavailable")}</span>
          <button type="button" className="link-btn" onClick={() => setReload((n) => n + 1)}>{t("common.retry")}</button>
        </div>
      )}

      {local && (
        <div className="local-active mt">
          <Icon name="monitor" size={15} className="local-mark" />
          <span className="grow small strong trunc">{t("local.marker", { model: local.model })}</span>
          <button type="button" className="btn btn-sm" onClick={() => switchTo(null)} disabled={!!busy}><Icon name="undo" size={13} /> {t("local.backToCloud")}</button>
        </div>
      )}
      {local?.fullAutoPaused && <div className="banner banner-warn mt-sm"><Icon name="bolt" size={14} /><span>{t("local.fullAutoPaused")}</span></div>}

      <div className="field mt">
        <span className="label-sm">{t("settings.localFallback")}</span>
        <Seg label={t("settings.localFallback")} value={settings.localFallback ?? "ask"} onChange={(v) => setSetting({ localFallback: v })} options={[["off", t("settings.localFallback.off")], ["ask", t("settings.localFallback.ask")], ["auto", t("settings.localFallback.auto")]]} />
        <span className="block faint small mt-sm">{t("settings.localFallbackDesc")}</span>
      </div>

      <label className="field block">
        <span className="label-sm">{t("settings.localModel")}</span>
        <span className="inq-field">
          <select className="local-select" value={saved} onChange={(e) => setSetting({ localModel: e.target.value })} disabled={!st}>
            <option value="">{t("settings.localModelAuto")}</option>
            {modelOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
      </label>

      {st?.available && (
        <div className="field">
          <span className="label-sm">{t("settings.localModels", { n: st.models.length })}</span>
          {st.models.length === 0 ? (
            <span className="faint small">{t("model.local.none")}</span>
          ) : (
            <ul className="local-list">
              {st.models.map((m) => {
                const active = local?.model === m.name;
                return (
                  <li key={m.name} className={`local-row ${active ? "on" : ""}`}>
                    <Icon name="monitor" size={14} className={active ? "local-mark" : "faint"} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="block mono small strong trunc">{m.name}</span>
                      <LocalCaps m={m} />
                    </span>
                    {active ? (
                      <span className="pill pill-ok">{t("model.local.active")}</span>
                    ) : (
                      <button type="button" className="btn btn-sm" onClick={() => switchTo(m.name)} disabled={!!busy} aria-label={t("model.local.use", { model: m.name })}>
                        {busy === m.name ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="play" size={12} />} {t("settings.localUse")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {err && <div className="banner banner-danger" role="alert"><Icon name="alert" size={14} /><span>{err}</span></div>}

      {st && (
        <>
          <LocalRecommend recommend={st.recommend} ramGb={st.ramGb} installed={names} />
          {st.ramGb > 0 && st.ramGb < 8 && <div className="banner banner-warn mt-sm"><Icon name="alert" size={14} /><span>{t("local.lowRam")}</span></div>}
          <div className="row gap-sm mt-sm wrap">
            {!st.available && <button type="button" className="btn btn-sm btn-primary" onClick={() => onLink("ollama")}><Icon name="external" size={13} /> {t("local.install")}</button>}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onLink("ollamaLibrary")}><Icon name="external" size={13} /> {t("local.library")}</button>
          </div>
        </>
      )}

      <div className="mt">
        <Toggle
          checked={!!settings.fullAutoLocal && fullAutoOn} disabled={!fullAutoOn || confirmFA} onChange={setFullAutoLocal}
          label={t("settings.fullAutoLocal")} desc={fullAutoOn ? t("settings.fullAutoLocalDesc") : `${t("settings.fullAutoLocalDesc")} ${t("settings.fullAutoLocalNeedsFullAuto")}`}
        />
        {confirmFA && (
          <div className="danger-zone" role="alertdialog" aria-labelledby="fal-title" aria-describedby="fal-desc">
            <div className="grow">
              <div className="strong small" id="fal-title">{t("settings.fullAutoLocalConfirmTitle")}</div>
              <div className="faint small" id="fal-desc">{t("settings.fullAutoLocalConfirm")}</div>
            </div>
            <span className="row gap-sm">
              <button type="button" className="btn btn-sm" onClick={() => setConfirmFA(false)} autoFocus>{t("common.cancel")}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => { Promise.resolve(setSetting({ fullAutoLocal: true })).then(refreshLocal); setConfirmFA(false); }}>{t("settings.fullAutoLocalYes")}</button>
            </span>
          </div>
        )}
      </div>

      <details className="local-about mt">
        <summary className="small strong">{t("local.about.title")}</summary>
        <ul className="plain-list muted small">
          <li>{t("local.about.privacy")}</li>
          <li>{t("local.about.noServer")}</li>
          <li>{t("local.about.tools")}</li>
          <li>{t("local.about.speed")}</li>
          <li>{t("local.about.context", { env: CONTEXT_ENV_HINT })}</li>
          {local?.contextLength || st?.contextEnv ? <li>{t("local.about.contextNow", { n: local?.contextLength || st.contextEnv })}</li> : null}
        </ul>
      </details>
    </>
  );
}

export default function Settings({ initial = "general", onClose, info, settings, setSetting, lang, setLang, model, onModel, auth, onLogin, onCancelLogin, onLogout, onPick, onOpenRecent, onReveal, recent, onClearHistory, update, onUpdateAction, onLink, onFullAuto }) {
  const t = useT();
  const [sec, setSec] = useState(initial);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Modal title={t("settings.title")} onClose={onClose} width={820} className="settings">
      <div className="settings-grid">
        <nav className="settings-nav" role="tablist" aria-orientation="vertical" aria-label={t("settings.title")}>
          {SECTIONS.map(([k, icon]) => (
            <button
              key={k} id={`set-tab-${k}`} type="button" role="tab" aria-selected={sec === k} aria-controls="set-panel" tabIndex={sec === k ? 0 : -1}
              className={`settings-tab ${sec === k ? "on" : ""}`} onClick={() => setSec(k)}
              onKeyDown={(e) => tabKeyDown(e, SECTIONS.map(([x]) => x), sec, setSec, { vertical: true, idOf: (x) => `set-tab-${x}` })}
            >
              <Icon name={icon} size={15} /> {t(`settings.${k}`)}
            </button>
          ))}
        </nav>
        <div className="settings-pane" id="set-panel" role="tabpanel" aria-labelledby={`set-tab-${sec}`} tabIndex={0}>
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
              <div className="field">
                <span className="label-sm">{t("settings.inquiry")}</span>
                <Seg label={t("settings.inquiry")} value={settings.inquiryMode ?? "auto"} onChange={(v) => setSetting({ inquiryMode: v })} options={[["auto", t("settings.inquiry.auto")], ["always", t("settings.inquiry.always")], ["off", t("settings.inquiry.off")]]} />
                <span className="block faint small mt-sm">{t("settings.inquiryDesc")}</span>
              </div>
              <Toggle checked={!!settings.fullAuto} onChange={(v) => Promise.resolve(onFullAuto ? onFullAuto(v) : setSetting({ fullAuto: v })).then(refreshLocal)} label={t("settings.fullAuto")} desc={t("settings.fullAutoDesc")} />
              <SandboxSection settings={settings} setSetting={setSetting} />
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
              <div className="field mt">
                <span className="label-sm">{t("settings.budget")}</span>
                <Seg label={t("settings.budget")} value={settings.tokenBudget ?? 0} onChange={(v) => setSetting({ tokenBudget: v })} options={BUDGETS.map((n) => [n, n ? formatTokens(n) : t("settings.budgetOff")])} />
                <span className="faint small">{t("settings.budgetDesc")}</span>
              </div>
            </>
          )}

          {sec === "skills" && <SkillsSection authed={!!info.authed} />}

          {sec === "local" && <LocalSection settings={settings} setSetting={setSetting} onLink={onLink} />}

          {sec === "workspace" && (
            <>
              <h3>{t("settings.workspace")}</h3>
              <div className="folder-pick static">
                <Icon name="folder" size={20} className="accent" />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="block strong">{info.cwd ? info.cwd.split(/[\\/]/).filter(Boolean).pop() : t("folder.none")}</span>
                  <span className="block faint small mono trunc">{info.cwd || t("folder.pickHint")}</span>
                </span>
                {info.cwd && <button type="button" className="btn btn-sm btn-ghost" onClick={onReveal}><Icon name="external" size={13} /> {t(info.platform === "darwin" ? "files.revealMac" : "files.reveal")}</button>}
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
                  <span className="grow small muted tnum" aria-hidden={update?.state === "downloading" ? "true" : undefined}>{t(`update.state.${update?.state ?? "idle"}`, { v: update?.version ?? "", p: update?.percent ?? 0 })}</span>
                  {/* Holat e'loni: yuklash paytida har foiz emas — bosqich bir marta aytiladi. */}
                  <span className="sr-only" role="status">{update?.state === "downloading" ? t("updCard.downloadingSr") : t(`update.state.${update?.state ?? "idle"}`, { v: update?.version ?? "", p: 0 })}</span>
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
