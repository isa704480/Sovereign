import React, { useState } from "react";
import Icon from "./Icon.jsx";
import DiffView from "./DiffView.jsx";
import { lineDiff, diffStats } from "../lib/diff.js";
import { useT } from "../lib/i18n.js";

function ChangeRow({ c, open, onToggle, onUndo }) {
  const t = useT();
  const st = diffStats(lineDiff(c.beforeUnknown ? "" : c.before || "", c.after || ""));
  const parts = c.path.split(/[\\/]/);
  return (
    <div className={`change ${open ? "open" : ""}`}>
      <div className="change-row">
        <button type="button" className="change-main" onClick={onToggle} aria-expanded={open}>
          <Icon name="chevron" size={12} className={`caret ${open ? "open" : ""}`} />
          <Icon name="file" size={14} className="faint" />
          <span className="trunc grow mono small" title={c.path}>
            <span className="faint">{parts.slice(0, -1).join("/")}{parts.length > 1 ? "/" : ""}</span>{parts[parts.length - 1]}
          </span>
          <span className={`tag ${c.existed ? "tag-edit" : "tag-new"}`}>{c.existed ? t("changes.modified") : t("changes.new")}</span>
          <span className="mono tnum small"><span className="add">+{st.add}</span> <span className="del">−{st.del}</span></span>
        </button>
        <button type="button" className="icon-btn" onClick={onUndo} aria-label={`${t("changes.undo")}: ${c.path}`} title={c.backupId ? t("changes.undo") : t("changes.noBackup")} disabled={!c.backupId}>
          <Icon name="undo" size={14} />
        </button>
      </div>
      {open && <DiffView oldText={c.beforeUnknown ? "" : c.before} newText={c.after} compact />}
    </div>
  );
}

function Terminal({ term, onClear }) {
  const t = useT();
  const [copied, setCopied] = useState(null);
  const copy = (x) => navigator.clipboard?.writeText(`$ ${x.command}\n${x.output}`).then(() => { setCopied(x.id); setTimeout(() => setCopied(null), 1300); }).catch(() => {});
  if (!term.length) {
    return (
      <div className="panel-empty">
        <Icon name="terminal" size={22} />
        <p>{t("term.empty")}</p>
        <p className="faint small">{t("term.emptyHint")}</p>
      </div>
    );
  }
  return (
    <div className="term">
      <div className="panel-toolbar">
        <span className="faint small">{t("term.count", { n: term.length })}</span>
        <button type="button" className="link-btn" onClick={onClear}>{t("term.clear")}</button>
      </div>
      {term.map((x) => (
        <div key={x.id} className="term-entry">
          <div className="term-cmd">
            <span className="accent">$</span>
            <span className="grow mono">{x.command}</span>
            <span className={`pill pill-${x.status === "ok" ? "ok" : "failed"}`}>{x.status === "ok" ? "exit 0" : t("status.failed")}</span>
            <button type="button" className="icon-btn" aria-label={t("common.copy")} onClick={() => copy(x)}><Icon name={copied === x.id ? "check" : "copy"} size={13} /></button>
          </div>
          <pre className="term-out">{String(x.output || "").replace(/^EXIT 0\n?/, "") || t("term.noOutput")}</pre>
        </div>
      ))}
    </div>
  );
}

/** O'ng panel: o'zgarishlar (diff + Undo) va terminal. */
export default function RightPanel({ tab, setTab, changes, term, onUndo, onUndoAll, onClearTerm, onClose }) {
  const t = useT();
  const [openPath, setOpenPath] = useState(null);
  return (
    <aside className="rpanel" aria-label={t("panel.label")}>
      <div className="tabs" role="tablist">
        {[["changes", t("panel.changes"), changes.length], ["terminal", t("panel.terminal"), term.length]].map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {l}{n ? <span className="count">{n}</span> : null}
          </button>
        ))}
        <span className="tab-actions">
          <button type="button" className="icon-btn" aria-label={t("panel.close")} title={`${t("panel.close")} (Ctrl+J)`} onClick={onClose}><Icon name="x" size={14} /></button>
        </span>
      </div>
      <div className="panel-scroll">
        {tab === "changes" ? (
          changes.length === 0 ? (
            <div className="panel-empty">
              <Icon name="diff" size={22} />
              <p>{t("changes.empty")}</p>
              <p className="faint small">{t("changes.emptyHint")}</p>
            </div>
          ) : (
            <>
              <div className="panel-toolbar">
                <span className="faint small">{t("changes.count", { n: changes.length })}</span>
                <button type="button" className="btn btn-sm" onClick={onUndoAll}><Icon name="undo" size={13} /> {t("changes.undoAll")}</button>
              </div>
              {changes.map((c) => (
                <ChangeRow key={c.path} c={c} open={openPath === c.path} onToggle={() => setOpenPath((p) => (p === c.path ? null : c.path))} onUndo={() => onUndo(c)} />
              ))}
              <p className="faint small pad-sm">{t("changes.note")}</p>
            </>
          )
        ) : (
          <Terminal term={term} onClear={onClearTerm} />
        )}
      </div>
    </aside>
  );
}
