import React from "react";
import Icon from "./Icon.jsx";
import FileTree from "./FileTree.jsx";
import { useT, relTime } from "../lib/i18n.js";

const STATUS_DOT = { running: "dot-warn pulse", done: "dot-ok", error: "dot-err", stopped: "dot-muted" };

function TaskList({ history, activeId, onOpen, onRemove, busy }) {
  const t = useT();
  if (!history.length) {
    return (
      <div className="side-empty">
        <Icon name="history" size={20} />
        <p>{t("tasks.empty")}</p>
        <p className="faint small">{t("tasks.emptyHint")}</p>
      </div>
    );
  }
  const today = new Date().setHours(0, 0, 0, 0);
  const groups = [
    [t("tasks.today"), history.filter((h) => (h.updatedAt ?? 0) >= today)],
    [t("tasks.earlier"), history.filter((h) => (h.updatedAt ?? 0) < today)],
  ].filter(([, l]) => l.length);
  return (
    <nav aria-label={t("tasks.title")} className="task-list">
      {groups.map(([label, list]) => (
        <div key={label}>
          <div className="eyebrow side-eyebrow">{label}</div>
          {list.map((h) => (
            <div key={h.id} className={`task ${activeId === h.id ? "active" : ""}`}>
              <button type="button" className="task-main" onClick={() => onOpen(h.id)} disabled={busy && activeId !== h.id} aria-current={activeId === h.id ? "true" : undefined}>
                <span className={`dot ${STATUS_DOT[h.status] ?? "dot-muted"}`} aria-label={t(`taskStatus.${h.status}`, null, h.status)} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="trunc block task-title">{h.title}</span>
                  <span className="trunc block faint small">
                    {h.mode === "chat" ? t("mode.chat") : (h.cwd || "").split(/[\\/]/).filter(Boolean).pop() || t("mode.code")} · {relTime(h.updatedAt, t)}
                  </span>
                </span>
              </button>
              <button type="button" className="icon-btn task-del" aria-label={t("tasks.remove")} title={t("tasks.remove")} onClick={() => onRemove(h.id)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar({ tab, setTab, info, history, activeTaskId, tree, treeError, onOpenTask, onRemoveTask, onNewTask, onPick, onReveal, onRefresh, onOpenFile, changedSet, onSettings, onAccount, busy }) {
  const t = useT();
  const folderName = info.cwd ? info.cwd.split(/[\\/]/).filter(Boolean).pop() : null;
  const initials = info.authed ? (info.email || "SC").replace(/@.*/, "").slice(0, 2).toUpperCase() : "";
  return (
    <aside className="sidebar" aria-label={t("sidebar.label")}>
      <div className="side-top">
        <button type="button" className="btn btn-primary btn-block" onClick={onNewTask}>
          <Icon name="plus" size={15} stroke={2} /> {t("tasks.new")}
          <kbd className="kbd-inline">Ctrl N</kbd>
        </button>
      </div>

      <button type="button" className="folder-card" onClick={onPick} title={info.cwd || t("folder.open")}>
        <Icon name="folder" size={16} className="accent" />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="trunc block strong">{folderName || t("folder.none")}</span>
          <span className="trunc block faint small mono">{info.cwd || t("folder.pickHint")}</span>
        </span>
        <Icon name="chevronDown" size={13} className="faint" />
      </button>

      <div className="tabs" role="tablist" aria-label={t("sidebar.label")}>
        {[["tasks", t("tasks.title"), history.length], ["files", t("files.title"), null]].map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {l}{n ? <span className="count">{n}</span> : null}
          </button>
        ))}
        {tab === "files" && info.cwd && (
          <span className="tab-actions">
            <button type="button" className="icon-btn" aria-label={t("files.refresh")} title={t("files.refresh")} onClick={onRefresh}><Icon name="refresh" size={13} /></button>
            <button type="button" className="icon-btn" aria-label={t("files.reveal")} title={t("files.reveal")} onClick={onReveal}><Icon name="external" size={13} /></button>
          </span>
        )}
      </div>

      <div className="side-scroll">
        {tab === "tasks" ? (
          <TaskList history={history} activeId={activeTaskId} onOpen={onOpenTask} onRemove={onRemoveTask} busy={busy} />
        ) : !info.cwd ? (
          <div className="side-empty">
            <Icon name="folder" size={20} />
            <p>{t("files.noFolder")}</p>
            <button type="button" className="btn btn-sm" onClick={onPick}>{t("folder.open")}</button>
          </div>
        ) : treeError ? (
          <div className="side-empty">
            <Icon name="alert" size={20} />
            <p>{t("files.missing")}</p>
            <button type="button" className="btn btn-sm" onClick={onPick}>{t("folder.open")}</button>
          </div>
        ) : tree == null ? (
          <div className="skeleton-list" aria-label={t("common.loading")}>{Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton" style={{ width: `${50 + ((i * 37) % 45)}%` }} />)}</div>
        ) : (
          <FileTree nodes={tree} onOpen={onOpenFile} changed={changedSet} />
        )}
      </div>

      <div className="side-foot">
        <button type="button" className="account" onClick={onAccount} title={t("settings.account")}>
          <span className="avatar-sm">{initials || <Icon name="user" size={13} />}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="trunc block strong small">{info.authed ? info.email || t("account.connected") : t("account.notSignedIn")}</span>
            <span className="trunc block faint small">{info.authed ? t("account.synced") : t("account.signInHint")}</span>
          </span>
        </button>
        <button type="button" className="icon-btn" aria-label={t("settings.title")} title={`${t("settings.title")} (Ctrl+,)`} onClick={onSettings}>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </aside>
  );
}
