import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Icon from "./Icon.jsx";
import ModelPicker from "./ModelPicker.jsx";
import { useT } from "../lib/i18n.js";

/** Xabar yozish maydoni: rejim (Chat/Kod), model, yuborish / to'xtatish. */
const Composer = forwardRef(function Composer({ value, onChange, onSend, onStop, busy, mode, setMode, model, onModel, disabledReason, onFix, fullAuto, onFullAuto }, ref) {
  const t = useT();
  const ta = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }));

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [value]);

  const canSend = !busy && !!value.trim() && !disabledReason;
  const submit = (e) => {
    e?.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div className="composer-wrap">
      {disabledReason && (
        <div className="composer-note" role="status">
          <Icon name={disabledReason === "auth" ? "user" : "folder"} size={14} />
          <span className="grow">{t(`composer.need.${disabledReason}`)}</span>
          <button type="button" className="btn btn-sm" onClick={() => onFix(disabledReason)}>
            {disabledReason === "auth" ? t("account.signIn") : t("folder.open")}
          </button>
        </div>
      )}
      <form className={`composer ${busy ? "is-busy" : ""}`} onSubmit={submit}>
        <label htmlFor="composer-input" className="sr-only">{t("composer.label")}</label>
        <textarea
          id="composer-input"
          ref={ta}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={mode === "chat" ? t("composer.phChat") : t("composer.phCode")}
          spellCheck={false}
        />
        <div className="composer-bar">
          <div className="seg" role="radiogroup" aria-label={t("mode.label")}>
            {[["code", "code", t("mode.code")], ["chat", "chat", t("mode.chat")]].map(([k, icon, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} className={`seg-btn ${mode === k ? "on" : ""}`} onClick={() => setMode(k)} disabled={busy} title={`${l} (Ctrl+E)`}>
                <Icon name={icon} size={13} /> {l}
              </button>
            ))}
          </div>
          {mode === "code" && (
            <button
              type="button"
              className={`auto-btn ${fullAuto ? "on" : ""}`}
              aria-pressed={!!fullAuto}
              onClick={() => onFullAuto(!fullAuto)}
              title={fullAuto ? t("auto.onTitle") : t("auto.offTitle")}
            >
              <Icon name="bolt" size={13} stroke={2} /> {t("auto.label")}
            </button>
          )}
          <ModelPicker label={model} onSelect={onModel} disabled={busy} />
          <span className="grow composer-hint faint small">{t("composer.hint")}</span>
          {busy ? (
            <button type="button" className="send stop" onClick={onStop} aria-label={t("composer.stop")} title={`${t("composer.stop")} (Ctrl+.)`}>
              <Icon name="stop" size={14} stroke={2} />
            </button>
          ) : (
            <button type="submit" className="send" disabled={!canSend} aria-label={t("composer.send")} title={`${t("composer.send")} (Enter)`}>
              <Icon name="send" size={15} stroke={2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

export default Composer;
