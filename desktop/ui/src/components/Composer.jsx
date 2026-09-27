import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Icon from "./Icon.jsx";
import ModelPicker from "./ModelPicker.jsx";
import { useT } from "../lib/i18n.js";
import { formatSize } from "../lib/attachments.js";

/** Fayl kengaytmasi (yorliq uchun): "app.test.js" → "JS". */
const extOf = (name) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name ?? ""));
  return m ? m[1].toUpperCase() : "";
};

/** Kiritish maydoni ustidagi biriktirma: rasm — kichik ko'rinish, fayl — ikon + nom + hajm. */
function AttachmentChip({ a, onRemove }) {
  const t = useT();
  const size = formatSize(a.size, t);
  const processing = a.status === "processing";
  const label = `${a.name} · ${size}${a.truncated ? ` · ${t("attach.truncated")}` : ""}`;
  const remove = (
    <button type="button" className="att-x" onClick={onRemove} aria-label={t("attach.remove", { name: a.name })} title={t("attach.remove", { name: a.name })}>
      <Icon name="x" size={11} stroke={2.2} />
    </button>
  );
  if (a.kind === "image") {
    return (
      <li className={`att att-img ${processing ? "is-processing" : ""}`} title={processing ? t("attach.processing") : label}>
        {a.thumb ? <img src={a.thumb} alt={a.name} draggable={false} /> : <span className="att-ph"><Icon name="image" size={18} /></span>}
        {processing && <span className="att-spin" role="status" aria-label={t("attach.processing")} />}
        {remove}
      </li>
    );
  }
  return (
    <li className="att att-file" title={label}>
      <span className="att-ico"><Icon name={a.sub === "pdf" ? "fileText" : "file"} size={16} /></span>
      <span className="att-meta">
        <span className="att-name trunc">{a.name}</span>
        <span className="att-sub">{a.sub === "pdf" ? "PDF" : extOf(a.name)}{extOf(a.name) || a.sub === "pdf" ? " · " : ""}{size}{a.truncated ? ` · ${t("attach.truncated")}` : ""}</span>
      </span>
      {remove}
    </li>
  );
}

/** Xabar yozish maydoni: rejim (Chat/Kod), model, biriktirmalar, yuborish / to'xtatish. */
const Composer = forwardRef(function Composer({ value, onChange, onSend, onStop, busy, mode, setMode, model, onModel, disabledReason, onFix, fullAuto, onFullAuto, attachments = [], onAttach, onRemoveAttachment, onFiles }, ref) {
  const t = useT();
  const ta = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }));

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [value]);

  const processing = attachments.some((a) => a.status === "processing");
  const canSend = !busy && (!!value.trim() || attachments.length > 0) && !processing && !disabledReason;
  const submit = (e) => {
    e?.preventDefault();
    if (canSend) onSend();
  };

  // Ctrl+V: skrinshot (clipboard rasmi) yoki Explorer'da nusxalangan fayllar — biriktirma bo'ladi;
  // oddiy matn odatdagidek qo'yiladi.
  const onPaste = (e) => {
    const files = e.clipboardData?.files;
    if (files && files.length && onFiles) {
      e.preventDefault();
      onFiles(Array.from(files));
    }
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
        {attachments.length > 0 && (
          <ul className="att-row" aria-label={t("attach.list")}>
            {attachments.map((a) => <AttachmentChip key={a.key} a={a} onRemove={() => onRemoveAttachment(a.key)} />)}
          </ul>
        )}
        <label htmlFor="composer-input" className="sr-only">{t("composer.label")}</label>
        <textarea
          id="composer-input"
          ref={ta}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
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
          {onAttach && (
            <button type="button" className="icon-btn attach-btn" onClick={onAttach} aria-label={t("attach.add")} title={t("attach.add")}>
              <Icon name="paperclip" size={16} />
            </button>
          )}
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
            <button type="submit" className="send" disabled={!canSend} aria-label={t("composer.send")} title={processing ? t("attach.err.processing") : `${t("composer.send")} (Enter)`}>
              <Icon name="send" size={15} stroke={2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

export default Composer;
