import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import CodeEditor from "./CodeEditor.jsx";
import { languageLabel } from "../lib/editor.js";
import { useT } from "../lib/i18n.js";

const S = () => window.sovereign;
/** Bir vaqtda ochiq yorliqlar chegarasi. */
export const MAX_TABS = 8;

const norm = (p) => String(p ?? "").replace(/\\/g, "/").toLowerCase();

/** Main'dan kelgan xato kodi → UI tilidagi matn. */
function errText(r, t) {
  const code = String(r?.error ?? "");
  const text = t(`fsErr.${code}`, null, code || t("common.unknownError"));
  return r?.detail ? `${text} (${r.detail})` : text;
}

function Tab({ tab, active, onSelect, onClose }) {
  const t = useT();
  return (
    <span className={`ed-tab ${active ? "on" : ""} ${tab.dirty ? "dirty" : ""}`}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className="ed-tab-main"
        title={tab.rel || tab.path}
        onClick={onSelect}
        onAuxClick={(e) => e.button === 1 && (e.preventDefault(), onClose())}
      >
        <Icon name={tab.kind === "image" ? "eye" : "file"} size={12} className="faint" />
        <span className="trunc">{tab.name}</span>
        {tab.dirty ? <span className="dot dot-warn ed-dot" aria-label={t("editor.unsaved")} /> : null}
      </button>
      <button type="button" className="ed-tab-x" aria-label={`${t("editor.closeTab")}: ${tab.name}`} title={t("editor.closeTab")} onClick={onClose}>
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}

/**
 * Muharrir paneli: yorliqlar + CodeMirror 6 + holat qatorlari (faqat o'qish,
 * juda katta fayl, ikkilik fayl, rasm ko'rish, diskda o'zgargan).
 *
 * Ref orqali: open(path), externalChange(paths), closeAll().
 */
const EditorPane = forwardRef(function EditorPane({ dark, wrap, onWrap, onSaved, onToast, onRefreshTree, platform }, ref) {
  const t = useT();
  const [tabs, setTabs] = useState([]);
  const [active, setActive] = useState(null);
  const [ask, setAsk] = useState(null); // { kind: "dirty" | "tegma", ... }
  const editorRef = useRef(null);
  const docs = useRef(new Map()); // path -> joriy matn (har bosishda state yangilanmasin)
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const cur = tabs.find((x) => x.path === active) ?? null;
  const patch = useCallback((path, p) => setTabs((l) => l.map((x) => (x.path === path ? { ...x, ...p } : x))), []);

  // ---- Ochish ----------------------------------------------------------
  const open = useCallback(
    async (path) => {
      if (!path) return;
      const found = tabsRef.current.find((x) => norm(x.path) === norm(path));
      if (found) {
        setActive(found.path);
        setTimeout(() => editorRef.current?.focus(), 0);
        return;
      }
      const r = await S()?.files.open(path).catch(() => null);
      if (!r || r.error) {
        onToast?.(`${t("files.readError")}: ${errText(r, t)}`, "err");
        return;
      }
      setTabs((l) => {
        // Chegara: eng eski o'zgartirilmagan yorliq yopiladi.
        let next = l;
        if (next.length >= MAX_TABS) {
          const victim = next.find((x) => !x.dirty);
          if (!victim) {
            onToast?.(t("editor.tooManyTabs", { n: MAX_TABS }), "err");
            return l;
          }
          docs.current.delete(victim.path);
          editorRef.current?.forget(victim.path);
          next = next.filter((x) => x !== victim);
        }
        return [...next, { ...r, dirty: false, origin: r.content ?? "", disk: null, reloadSeq: 0 }];
      });
      docs.current.set(r.path, r.content ?? "");
      setActive(r.path);
      setTimeout(() => editorRef.current?.focus(), 0);
    },
    [onToast, t],
  );

  // ---- Saqlash ----------------------------------------------------------
  const doSave = useCallback(
    async (path, opts = {}) => {
      const tab = tabsRef.current.find((x) => x.path === path);
      if (!tab || tab.kind !== "text" || tab.readOnly) return false;
      const content = docs.current.get(path) ?? tab.content ?? "";
      const r = await S()
        ?.files.write({ path, content, eol: tab.eol, finalNewline: tab.finalNewline, expect: { mtimeMs: tab.mtimeMs, size: tab.size }, ...opts })
        .catch(() => null);
      if (r?.error === "stale") {
        patch(path, { disk: r.missing ? "missing" : "changed" });
        onToast?.(t("editor.staleToast"), "err");
        return false;
      }
      if (r?.error === "tegma") {
        setAsk({ kind: "tegma", rel: tab.rel, run: () => doSave(path, { ...opts, confirmTegma: true }) });
        return false;
      }
      if (!r?.ok) {
        onToast?.(`${t("editor.saveFailed")}: ${errText(r, t)}`, "err");
        return false;
      }
      patch(path, { dirty: false, origin: content, content, size: r.size, mtimeMs: r.mtimeMs, disk: null });
      onSaved?.({ path: tab.rel || path, before: tab.origin, beforeUnknown: false, existed: r.existed, backupId: r.backupId, after: content });
      onToast?.(t("editor.saved", { name: tab.name }), "ok");
      onRefreshTree?.();
      return true;
    },
    [onSaved, onToast, onRefreshTree, patch, t],
  );

  // ---- Yopish ----------------------------------------------------------
  const closeTab = useCallback(
    (path, force = false) => {
      const tab = tabsRef.current.find((x) => x.path === path);
      if (!tab) return;
      if (tab.dirty && !force) {
        setAsk({
          kind: "dirty",
          name: tab.name,
          save: async () => {
            if (await doSave(path)) closeTab(path, true);
          },
          discard: () => closeTab(path, true),
        });
        return;
      }
      docs.current.delete(path);
      editorRef.current?.forget(path);
      setTabs((l) => {
        const i = l.findIndex((x) => x.path === path);
        const next = l.filter((x) => x.path !== path);
        setActive((a) => (a === path ? (next[Math.min(i, next.length - 1)]?.path ?? null) : a));
        // Fokus yo'qolmasin: yorliq qolsa — muharrirga, qolmasa — yorliqlar qatoriga.
        setTimeout(() => (next.length ? editorRef.current?.focus() : document.querySelector(".tree-row")?.focus()), 0);
        return next;
      });
    },
    [doSave],
  );

  // ---- Diskdan qayta o'qish --------------------------------------------
  const reload = useCallback(
    async (path) => {
      const r = await S()?.files.open(path).catch(() => null);
      if (!r || r.error) {
        onToast?.(`${t("files.readError")}: ${errText(r, t)}`, "err");
        return;
      }
      docs.current.set(path, r.content ?? "");
      editorRef.current?.forget(path);
      patch(path, { ...r, dirty: false, origin: r.content ?? "", disk: null, reloadSeq: (tabsRef.current.find((x) => x.path === path)?.reloadSeq ?? 0) + 1 });
    },
    [onToast, patch, t],
  );

  /**
   * Diskda o'zgarish (agent yoki tashqi muharrir). O'zgartirilmagan yorliq
   * jim yangilanadi; o'zgartirilgan yorliqda «diskda o'zgardi» qatori chiqadi.
   */
  const externalChange = useCallback(
    async (paths) => {
      const set = new Set((paths ?? []).map(norm));
      for (const tab of tabsRef.current) {
        if (set.size && !set.has(norm(tab.path))) continue;
        const st = await S()?.files.stat(tab.path).catch(() => null);
        if (st?.error === "not-found") {
          patch(tab.path, { disk: "missing" });
          continue;
        }
        if (!st?.ok) continue;
        if (st.size === tab.size && Math.abs(st.mtimeMs - tab.mtimeMs) <= 1) continue;
        if (tab.dirty) patch(tab.path, { disk: "changed" });
        else reload(tab.path);
      }
    },
    [patch, reload],
  );

  useImperativeHandle(ref, () => ({
    open,
    externalChange,
    /** Daraxtda nomi o'zgardi — ochiq yorliq yangi yo'l bilan qayta ochiladi. */
    renamed: (from, to) => {
      if (!tabsRef.current.some((x) => norm(x.path) === norm(from))) return;
      closeTab(tabsRef.current.find((x) => norm(x.path) === norm(from)).path, true);
      open(to);
    },
    /** Daraxtdan o'chirildi (savat) — yorliq yopiladi. */
    removed: (p) => {
      const tab = tabsRef.current.find((x) => norm(x.path) === norm(p) || norm(x.path).startsWith(`${norm(p)}/`));
      if (tab) closeTab(tab.path, true);
    },
    closeAll: () => { docs.current.clear(); editorRef.current?.forgetAll(); setTabs([]); setActive(null); },
    has: (p) => tabsRef.current.some((x) => norm(x.path) === norm(p)),
  }));

  // Ctrl+S panel fokusda bo'lmaganda ham ishlasin (masalan yorliq tugmasida fokus).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s" || e.altKey) return;
      if (!active) return;
      // Muharrir ichidan kelgan bo'lsa — uni CodeMirror keymap'i allaqachon bajardi.
      if (e.target?.closest?.(".cm-editor")) return;
      e.preventDefault();
      doSave(active);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, doSave]);

  const onDocChange = useCallback(
    (path, doc) => {
      docs.current.set(path, doc);
      const tab = tabsRef.current.find((x) => x.path === path);
      if (!tab) return;
      const dirty = doc !== tab.origin;
      if (dirty !== tab.dirty) patch(path, { dirty });
    },
    [patch],
  );

  if (!tabs.length) {
    return (
      <div className="editor-pane">
        <div className="panel-empty">
          <Icon name="code" size={22} />
          <p>{t("editor.empty")}</p>
          <p className="faint small">{t("editor.emptyHint")}</p>
        </div>
      </div>
    );
  }

  const lang = cur ? languageLabel(cur.name) : "";
  return (
    <div className="editor-pane">
      <div className="ed-tabs" role="tablist" aria-label={t("editor.tabs")}>
        <span className="ed-tab-strip">
          {tabs.map((x) => (
            <Tab key={x.path} tab={x} active={x.path === active} onSelect={() => { setActive(x.path); setTimeout(() => editorRef.current?.focus(), 0); }} onClose={() => closeTab(x.path)} />
          ))}
        </span>
        <span className="ed-tab-actions">
          <button type="button" className={`icon-btn ${wrap ? "on" : ""}`} aria-pressed={wrap} aria-label={t("editor.wrap")} title={t("editor.wrap")} onClick={() => onWrap?.(!wrap)}>
            <Icon name="repeat" size={13} />
          </button>
          {cur && (
            <button type="button" className="icon-btn" aria-label={t(platform === "darwin" ? "files.revealMac" : "files.reveal")} title={t(platform === "darwin" ? "files.revealMac" : "files.reveal")} onClick={() => S()?.files.revealItem(cur.path)}>
              <Icon name="external" size={13} />
            </button>
          )}
          {cur && cur.kind === "text" && !cur.readOnly && (
            <button type="button" className="btn btn-sm" disabled={!cur.dirty} onClick={() => doSave(cur.path)} title={`${t("editor.save")} (Ctrl+S)`}>
              <Icon name="check" size={13} /> {t("editor.save")}
            </button>
          )}
        </span>
      </div>

      {cur?.disk === "changed" && (
        <div className="banner banner-warn ed-banner">
          <Icon name="alert" size={14} />
          <span className="grow">{t("editor.diskChanged")}</span>
          <button type="button" className="btn btn-sm" onClick={() => reload(cur.path)}>{t("editor.reload")}</button>
          <button type="button" className="btn btn-sm" onClick={() => doSave(cur.path, { force: true })}>{t("editor.overwrite")}</button>
        </div>
      )}
      {cur?.disk === "missing" && (
        <div className="banner banner-warn ed-banner">
          <Icon name="alert" size={14} />
          <span className="grow">{t("editor.diskMissing")}</span>
          <button type="button" className="btn btn-sm" onClick={() => doSave(cur.path, { force: true })}>{t("editor.saveAnyway")}</button>
        </div>
      )}
      {cur?.kind === "text" && cur.readOnly && (
        <div className="banner ed-banner">
          <Icon name="lock" size={14} />
          <span className="grow">
            {cur.tooLarge ? t("editor.roLarge") : cur.longLines ? t("editor.roLongLines") : cur.truncated ? t("editor.roTruncated") : cur.tegma ? t("editor.roTegma") : t("editor.readOnly")}
          </span>
        </div>
      )}

      <div className="ed-body">
        {cur?.kind === "image" ? (
          cur.tooLarge ? (
            <div className="panel-empty"><Icon name="alert" size={22} /><p>{t("editor.imageTooLarge")}</p></div>
          ) : (
            <div className="ed-image"><img src={cur.dataUrl} alt={cur.name} /></div>
          )
        ) : cur?.kind === "binary" ? (
          <div className="panel-empty">
            <Icon name="ban" size={22} />
            <p>{t("editor.binary")}</p>
            <p className="faint small">{t("editor.binaryHint")}</p>
          </div>
        ) : (
          <CodeEditor ref={editorRef} tab={cur} dark={dark} wrap={wrap} onChange={onDocChange} onSave={(p) => doSave(p)} />
        )}
      </div>

      <div className="ed-status">
        <span className="trunc mono faint small" title={cur?.path}>{cur?.rel || cur?.name}</span>
        <span className="grow" />
        {lang ? <span className="faint small">{lang}</span> : null}
        <span className="faint small">{cur?.eol === "crlf" ? "CRLF" : "LF"}</span>
        {cur?.dirty ? <span className="warn small">{t("editor.unsaved")}</span> : null}
      </div>

      {ask?.kind === "dirty" && (
        <Modal
          title={t("editor.closeDirtyTitle")}
          width={460}
          onClose={() => setAsk(null)}
          footer={(
            <span className="foot-actions">
              <button type="button" className="btn" data-autofocus onClick={() => setAsk(null)}>{t("confirm.cancel")}</button>
              <button type="button" className="btn" onClick={() => { const f = ask.discard; setAsk(null); f(); }}>{t("editor.discard")}</button>
              <button type="button" className="btn btn-primary" onClick={() => { const f = ask.save; setAsk(null); f(); }}>{t("editor.save")}</button>
            </span>
          )}
        >
          <p>{t("editor.closeDirtyBody", { name: ask.name })}</p>
        </Modal>
      )}
      {ask?.kind === "tegma" && (
        <Modal
          title={t("editor.tegmaTitle")}
          tone="danger"
          width={480}
          onClose={() => setAsk(null)}
          footer={(
            <span className="foot-actions">
              <button type="button" className="btn" data-autofocus onClick={() => setAsk(null)}>{t("confirm.cancel")}</button>
              <button type="button" className="btn btn-danger" onClick={() => { const f = ask.run; setAsk(null); f(); }}>{t("editor.tegmaYes")}</button>
            </span>
          )}
        >
          <p>{t("editor.tegmaBody")}</p>
          <p className="mono small muted">{ask.rel}</p>
        </Modal>
      )}
    </div>
  );
});

export default EditorPane;
