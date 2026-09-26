import React, { useCallback, useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

const SEVS = ["critical", "high", "medium", "low"];

/**
 * Xavfsizlik tekshiruvi (sov audit) natijalari. Skaner main jarayonda ishlaydi
 * (ish papkasini faqat o'qiydi); topilma matnlari 4 tilda audit.mjs'dan keladi.
 * "AI bilan tuzatish" — tayyor topshiriqni composer'ga qo'yadi (yubormaydi).
 */
export default function AuditDialog({ lang, onClose, onFix, onOpenFile }) {
  const t = useT();
  const [state, setState] = useState({ status: "loading" });
  const [filter, setFilter] = useState(null);

  const run = useCallback(async () => {
    setState({ status: "loading" });
    setFilter(null);
    try {
      const r = await window.sovereign.audit();
      setState(r?.error ? { status: "error", error: r.error } : { status: "done", result: r });
    } catch {
      setState({ status: "error", error: "io" });
    }
  }, []);
  useEffect(() => { run(); }, [run]);

  const result = state.result;
  const findings = result?.findings ?? [];
  const shown = filter ? findings.filter((f) => f.severity === filter) : findings;
  const pick = (obj) => obj?.[lang] ?? obj?.en ?? obj?.uz ?? "";

  const footer = (
    <>
      <button type="button" className="btn" onClick={run} disabled={state.status === "loading"}>
        <Icon name="refresh" size={14} /> {t("audit.rescan")}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!findings.length}
        onClick={() => onFix(pick(result?.prompts))}
      >
        <Icon name="sparkle" size={14} /> {t("audit.fix")}
      </button>
    </>
  );

  return (
    <Modal title={t("audit.title")} onClose={onClose} width={760} className="audit" footer={footer}>
      <p className="faint small">{t("audit.note")}</p>

      {state.status === "loading" && (
        <div className="audit-state" role="status">
          <Icon name="shield" size={28} className="pulse" />
          <span className="muted">{t("audit.running")}</span>
        </div>
      )}

      {state.status === "error" && (
        <div className="banner banner-warn" role="alert">
          <Icon name="alert" size={14} />
          <span>{t(`audit.err.${state.error}`, null, t("common.unknownError"))}</span>
        </div>
      )}

      {state.status === "done" && (
        <>
          <p className="muted small">{t("audit.summary", { files: result.scanned, ms: result.durationMs })}</p>
          <div className="audit-chips" role="group" aria-label={t("audit.filter")}>
            {SEVS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip audit-chip sev-${s} ${filter === s ? "on" : ""}`}
                aria-pressed={filter === s}
                disabled={!result.counts[s]}
                onClick={() => setFilter((f) => (f === s ? null : s))}
              >
                <span className={`sev-dot sev-${s}`} aria-hidden="true" />
                {t(`audit.sev.${s}`)} <b>{result.counts[s]}</b>
              </button>
            ))}
          </div>

          {findings.length === 0 ? (
            <div className="audit-state">
              <Icon name="shield" size={32} className="ok" />
              <strong>{t("audit.clean")}</strong>
              <span className="faint small">{t("audit.cleanNote")}</span>
            </div>
          ) : (
            <ul className="audit-list" aria-label={t("audit.findings")}>
              {shown.map((f, i) => (
                <li key={`${f.rule}-${f.file}-${f.line}-${i}`} className={`audit-item sev-${f.severity}`}>
                  <div className="audit-head">
                    <span className={`sev-badge sev-${f.severity}`}>{t(`audit.sev.${f.severity}`)}</span>
                    <button type="button" className="audit-file mono" title={t("audit.openFile")} onClick={() => onOpenFile(f.file)}>
                      {f.file}:{f.line}
                    </button>
                    <span className="faint small mono audit-rule">{f.rule}</span>
                  </div>
                  <p className="audit-msg">{pick(f.message)}</p>
                  <p className="audit-fix muted small">
                    <Icon name="chevron" size={12} /> {pick(f.fix)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {result.truncated && <p className="faint small">{t("audit.truncated")}</p>}
        </>
      )}
    </Modal>
  );
}
