import React, { useCallback, useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

const S = () => window.sovereign;
const NOTE_MAX = 500;
const ERRORS = ["empty", "duplicate", "unsafe", "too-long", "no-folder", "open", "io"];

/**
 * Loyiha xotirasi (SOVEREIGN.md): jamoa qoidalari, git orqali ulashiladi.
 * Agent uni har suhbat boshida o'qiydi. Bu yerda — holat, muharrirda ochish,
 * shablon yaratish va eslatma qo'shish (fayl yo'li main jarayonda hisoblanadi).
 */
export default function ProjectMemory({ cwd, toast }) {
  const t = useT();
  const [info, setInfo] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo((await S().project?.info()) ?? null);
    } catch {
      setInfo(null);
    }
  }, []);
  useEffect(() => { load(); }, [load, cwd]);

  const fail = (code) => {
    const k = ERRORS.includes(code) ? code : "io";
    toast?.(t(`project.err.${k}`), "err");
  };

  const create = async () => {
    setBusy(true);
    const r = await S().project.create().catch(() => ({ ok: false, error: "io" }));
    setBusy(false);
    if (r.info) setInfo(r.info);
    if (!r.ok) return fail(r.error);
    toast?.(r.created ? t("project.created") : t("project.exists"), "ok");
  };

  const open = async () => {
    const r = await S().project.open().catch(() => ({ ok: false, error: "open" }));
    if (!r.ok) fail(r.error === "missing" ? "io" : "open");
  };

  const remember = async (e) => {
    e.preventDefault();
    const text = note.trim();
    if (!text || busy) return;
    setBusy(true);
    const r = await S().project.remember(text).catch(() => ({ ok: false, error: "io" }));
    setBusy(false);
    if (r.info) setInfo(r.info);
    if (!r.ok) return fail(r.error);
    setNote("");
    toast?.(r.created ? t("project.savedCreated") : t("project.saved"), "ok");
    if (r.overLimit) toast?.(t("project.tooBig"), "info");
  };

  if (!cwd) {
    return (
      <div className="panel-empty">
        <Icon name="list" size={22} />
        <p>{t("project.title")}</p>
        <p className="faint small">{t("project.noFolder")}</p>
      </div>
    );
  }

  const exists = !!info?.exists;
  return (
    <div className="proj">
      <div className="proj-head">
        <Icon name="list" size={16} className="faint" />
        <strong className="grow">{t("project.title")}</strong>
        <span className={`pill ${exists ? "pill-ok" : ""}`}>{exists ? t("project.on") : t("project.off")}</span>
      </div>
      <p className="faint small">{t("project.desc")}</p>

      {exists ? (
        <div className="proj-file">
          <span className="mono small trunc" title={info.path}>{info.path}</span>
          <span className="faint small">
            {t("project.stats", { kb: (info.bytes / 1024).toFixed(1), n: info.notes })}
          </span>
          {info.truncated && <span className="small proj-warn">{t("project.tooBig")}</span>}
          <div className="proj-actions">
            <button type="button" className="btn btn-sm" onClick={open}><Icon name="external" size={13} /> {t("project.open")}</button>
            <button type="button" className="icon-btn" onClick={load} aria-label={t("files.refresh")} title={t("files.refresh")}><Icon name="refresh" size={13} /></button>
          </div>
        </div>
      ) : (
        <div className="proj-file">
          <span className="small">{t("project.missing")}</span>
          <div className="proj-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={create} disabled={busy}><Icon name="plus" size={13} /> {t("project.create")}</button>
          </div>
        </div>
      )}

      <form className="proj-note" onSubmit={remember}>
        <label className="small" htmlFor="proj-note-input">{t("project.noteLabel")}</label>
        <div className="tree-filter">
          <input
            id="proj-note-input"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("project.notePlaceholder")}
          />
        </div>
        <button type="submit" className="btn btn-sm" disabled={!note.trim() || busy}><Icon name="check" size={13} /> {t("project.remember")}</button>
      </form>
      <p className="faint small">{t("project.hint")}</p>
    </div>
  );
}
