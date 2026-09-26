import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { TitleBar, StatusBar, Toasts } from "./components/Chrome.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Conversation from "./components/Conversation.jsx";
import Composer from "./components/Composer.jsx";
import RightPanel from "./components/RightPanel.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import CommandPalette, { ShortcutsHelp } from "./components/CommandPalette.jsx";
import Settings from "./components/Settings.jsx";
import Onboarding from "./components/Onboarding.jsx";
import Modal from "./components/Modal.jsx";
import Icon, { Logo } from "./components/Icon.jsx";
import { applyEvent, replayEvents, addChange, initialAgent } from "./lib/agent.js";
import { I18n, makeT, detectLang, LANGS } from "./lib/i18n.js";

const S = () => window.sovereign;

function reducer(s, a) {
  switch (a.type) {
    case "event": return applyEvent(s, a.ev);
    case "reset": return { ...initialAgent };
    case "replay": return replayEvents(a.events);
    case "confirm-done": return { ...s, confirm: null, changes: a.change ? addChange(s.changes, a.change) : s.changes };
    case "set-changes": return { ...s, changes: a.changes };
    case "clear-term": return { ...s, term: [] };
    default: return s;
  }
}

let toastSeq = 0;

/** Main'dan kelgan fayl xatosi kodi (fs:read / fs:restore) → UI tilidagi matn. */
const fsErrText = (r, t) => {
  const code = String(r?.error ?? "");
  const text = t(`fsErr.${code}`, null, code || t("common.unknownError"));
  return r?.detail ? `${text} (${r.detail})` : text;
};

export default function App() {
  const [boot, setBoot] = useState("loading");
  const [info, setInfo] = useState(null);
  const [settings, setSettings] = useState(null);
  const [agent, dispatch] = useReducer(reducer, initialAgent);
  const [mode, setMode] = useState("code");
  const [history, setHistory] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [tree, setTree] = useState(null);
  const [treeError, setTreeError] = useState(false);
  const [sideTab, setSideTab] = useState("tasks");
  const [panelTab, setPanelTab] = useState("changes");
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [auth, setAuth] = useState({ state: "idle" });
  const [update, setUpdate] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [input, setInput] = useState("");
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);
  const composerRef = useRef(null);
  // Sidebar kartasidan bosilgan yuklash: tayyor bo'lgach avtomatik o'rnatib qayta ishga tushiriladi
  // (agent ishlayotgan bo'lsa — yo'q; karta "qayta ishga tushirish" tugmasini ko'rsatadi).
  const installWhenReady = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = agent.busy;

  const lang = settings?.lang || detectLang();
  const t = useMemo(() => makeT(lang), [lang]);

  const toast = useCallback((text, tone = "info", action) => {
    const id = ++toastSeq;
    setToasts((l) => [...l.slice(-3), { id, text, tone, action }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), action ? 7000 : 4200);
  }, []);
  const dismissToast = (id) => setToasts((l) => l.filter((x) => x.id !== id));

  const refreshTree = useCallback(async () => {
    const r = await S()?.fsTree().catch(() => null);
    setTreeError(!!r?.error);
    setTree(r?.nodes ?? []);
  }, []);

  // ---- Boot ----
  useEffect(() => {
    if (!S()) { setBoot("error"); return; }
    let off = () => {};
    (async () => {
      try {
        const i = await S().init();
        setInfo(i);
        setSettings(i.settings);
        setHistory(i.history ?? []);
        setMode(i.settings?.defaultMode ?? "code");
        setUpdate(i.update);
        setSideTab(i.cwd ? "files" : "tasks");
        setBoot("ready");
        refreshTree();
      } catch {
        setBoot("error");
      }
    })();
    off = S().onEvent((ev) => {
      if (ev.type === "task") {
        setActiveTaskId(ev.task.id);
        setHistory((h) => [ev.task, ...h.filter((x) => x.id !== ev.task.id)]);
        return;
      }
      if (ev.type === "auth") {
        setAuth(ev);
        if (ev.state === "approved") S().state().then(setInfo);
        return;
      }
      if (ev.type === "update") {
        setUpdate(ev);
        if (ev.state === "ready" && installWhenReady.current) {
          installWhenReady.current = false;
          if (!busyRef.current) S().updates.install();
        }
        return;
      }
      dispatch({ type: "event", ev });
      if (ev.type === "tool-done" && (ev.name === "write_file" || ev.name === "make_dir") && ev.status === "ok") refreshTree();
    });
    return () => off();
  }, [refreshTree]);

  // ---- Theme + language on <html> ----
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, []);
  const themePref = settings?.theme ?? "system";
  const resolvedTheme = themePref === "system" ? (dark ? "dark" : "light") : themePref;
  useEffect(() => { document.documentElement.dataset.theme = resolvedTheme; }, [resolvedTheme]);
  useEffect(() => {
    document.documentElement.lang = lang === "uz-cyrl" ? "uz-Cyrl" : lang;
    document.title = "SOVEREIGN Cowork";
  }, [lang]);

  // ---- Actions ----
  const setSetting = useCallback(async (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    const next = await S().settings.set(patch).catch(() => null);
    if (next) setSettings(next);
  }, []);
  const setLang = (l) => setSetting({ lang: l });
  const setFullAuto = (on) => {
    setSetting({ fullAuto: on });
    toast(on ? t("auto.enabled") : t("auto.disabled"), on ? "info" : "ok");
  };
  const toggleSidebar = () => setSetting({ sidebar: !settings.sidebar });
  const togglePanel = (tab) => {
    if (tab && (!settings.rightPanel || panelTab !== tab)) { setPanelTab(tab); setSetting({ rightPanel: true }); return; }
    setSetting({ rightPanel: !settings.rightPanel });
  };

  const afterFolder = (r) => {
    if (!r || r.error) { if (r?.error) toast(t("folder.notFound"), "err"); return; }
    setInfo((i) => ({ ...i, cwd: r.cwd, recent: r.recent ?? i.recent }));
    if (r.settings) setSettings(r.settings);
    if (r.fullAutoOff) toast(t("auto.resetFolder"), "info");
    dispatch({ type: "reset" });
    setActiveTaskId(null);
    setTree(null);
    refreshTree();
    setSideTab("files");
    toast(t("folder.opened", { name: r.cwd.split(/[\\/]/).filter(Boolean).pop() }), "ok");
  };
  const pickFolder = async () => afterFolder(await S().pickFolder());
  const openRecent = async (p) => afterFolder(await S().openRecent(p));
  const reveal = () => S().revealWorkspace();

  const newTask = async () => {
    const r = await S().newTask();
    dispatch({ type: "reset" });
    setActiveTaskId(null);
    if (r?.history) setHistory(r.history);
    setMode(settings?.defaultMode ?? "code");
    setInput("");
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  const openTask = async (id) => {
    if (id === activeTaskId) return;
    const r = await S().history.open(id);
    if (!r || r.error) { toast(t("tasks.openFailed"), "err"); return; }
    dispatch({ type: "replay", events: r.events });
    setActiveTaskId(id);
    setMode(r.task.mode === "chat" ? "chat" : "code");
    setInfo((i) => ({ ...i, cwd: r.cwd, recent: r.recent ?? i.recent }));
    if (r.settings) setSettings(r.settings);
    if (r.fullAutoOff) toast(t("auto.resetFolder"), "info");
    refreshTree();
    if (r.folderMissing) toast(t("tasks.folderMissing"), "err");
  };
  const removeTask = async (id) => {
    const list = await S().history.remove(id);
    setHistory(list ?? []);
    if (id === activeTaskId) { dispatch({ type: "reset" }); setActiveTaskId(null); }
  };
  const clearHistory = async () => {
    await S().history.clear();
    setHistory([]);
    dispatch({ type: "reset" });
    setActiveTaskId(null);
    toast(t("privacy.cleared"), "ok");
  };

  const send = () => {
    const text = input.trim();
    if (!text || agent.busy) return;
    S().send(text, mode);
    setInput("");
  };
  const stop = () => S().stop();
  const retry = () => S().retry(mode);

  const replyConfirm = (ok) => {
    const req = agent.confirm;
    if (!req) return;
    S().confirmReply(req.id, ok);
    dispatch({ type: "confirm-done", change: ok ? req._change : null });
  };

  const restoreOne = async (ch) => {
    if (!ch.backupId) return t("changes.noBackup");
    const r = await S().fsRestore(ch.backupId);
    return r?.ok ? null : fsErrText(r, t);
  };
  const undoChange = async (ch) => {
    const err = await restoreOne(ch);
    if (err) toast(`${t("changes.undoFailed")}: ${ch.path} — ${err}`, "err");
    else { dispatch({ type: "set-changes", changes: agent.changes.filter((c) => c.path !== ch.path) }); toast(t("changes.undone", { path: ch.path }), "ok"); }
    refreshTree();
  };
  const undoAll = async () => {
    const failed = [];
    for (const c of agent.changes) if (await restoreOne(c)) failed.push(c);
    dispatch({ type: "set-changes", changes: failed });
    toast(failed.length ? t("changes.undoPartial", { n: failed.length }) : t("changes.undoneAll"), failed.length ? "err" : "ok");
    refreshTree();
  };

  const onModel = async (id, label) => {
    const r = await S().setModel(id, label);
    if (r?.ok) setInfo((i) => ({ ...i, model: r.model }));
  };

  const login = async () => {
    setAuth({ state: "starting" });
    const r = await S().auth.login().catch(() => ({ ok: false }));
    if (r?.ok && r.cwd !== undefined) { setInfo(r); toast(t("account.welcome"), "ok"); }
  };
  const cancelLogin = () => S().auth.cancel();
  const logout = async () => { const st = await S().auth.logout(); setInfo(st); setAuth({ state: "idle" }); toast(t("account.signedOut")); };

  const updateAction = async (what) => {
    if (what === "check") setUpdate(await S().updates.check());
    else if (what === "download") setUpdate(await S().updates.download());
    else if (what === "install") S().updates.install();
    else if (what === "download-install") {
      // Sidebar kartasi: yuklab olish → tayyor bo'lganda o'rnatib, qayta ishga tushirish.
      installWhenReady.current = true;
      const st = await S().updates.download();
      setUpdate(st);
      if (st?.state === "ready" && installWhenReady.current) {
        installWhenReady.current = false;
        if (!busyRef.current) S().updates.install();
      }
    } else if (what === "open-download") S().openLink("download"); // macOS: sayt orqali
  };

  const openFile = async (node) => {
    const r = await S().fsRead(node.path);
    setViewer({ path: node.path, name: node.name, content: r?.content ?? "", truncated: !!r?.truncated, error: r?.error ? r : null });
  };

  const onErrorAction = (a) => {
    if (a === "retry") retry();
    else if (a === "signin") setSettingsOpen("account");
    else if (a === "folder") pickFolder();
  };

  // ---- Commands + hotkeys ----
  const anyModal = !!(palette || shortcuts || settingsOpen || viewer || agent.confirm);
  const commands = useMemo(() => {
    if (!settings) return [];
    const g = { task: t("palette.gTask"), view: t("palette.gView"), app: t("palette.gApp") };
    const list = [
      { id: "new", label: t("sc.new"), icon: "plus", hint: "Ctrl N", group: g.task, run: newTask },
      { id: "open", label: t("sc.open"), icon: "folder", hint: "Ctrl O", group: g.task, run: pickFolder },
      ...(info?.recent ?? []).filter((r) => r !== info?.cwd).slice(0, 5).map((r) => ({ id: `recent-${r}`, label: `${t("folder.recentOpen")}: ${r.split(/[\\/]/).filter(Boolean).pop()}`, keywords: r, icon: "history", group: g.task, run: () => openRecent(r) })),
      ...(info?.cwd ? [{ id: "reveal", label: t("files.reveal"), icon: "external", group: g.task, run: reveal }] : []),
      { id: "mode", label: mode === "code" ? t("palette.toChat") : t("palette.toCode"), icon: mode === "code" ? "chat" : "code", hint: "Ctrl E", group: g.task, run: () => setMode((m) => (m === "code" ? "chat" : "code")) },
      ...(agent.busy ? [{ id: "stop", label: t("sc.stop"), icon: "stop", hint: "Ctrl .", group: g.task, run: stop }] : []),
      { id: "sidebar", label: t("sc.sidebar"), icon: "sidebar", hint: "Ctrl B", group: g.view, run: toggleSidebar },
      { id: "changes", label: t("palette.showChanges"), icon: "diff", group: g.view, run: () => togglePanel("changes") },
      { id: "terminal", label: t("palette.showTerminal"), icon: "terminal", hint: "Ctrl J", group: g.view, run: () => togglePanel("terminal") },
      { id: "theme-dark", label: `${t("settings.theme")}: ${t("theme.dark")}`, icon: "moon", group: g.view, run: () => setSetting({ theme: "dark" }) },
      { id: "theme-light", label: `${t("settings.theme")}: ${t("theme.light")}`, icon: "sun", group: g.view, run: () => setSetting({ theme: "light" }) },
      { id: "theme-system", label: `${t("settings.theme")}: ${t("theme.system")}`, icon: "monitor", group: g.view, run: () => setSetting({ theme: "system" }) },
      ...LANGS.map((l) => ({ id: `lang-${l.id}`, label: `${t("settings.language")}: ${l.label}`, icon: "globe", group: g.view, run: () => setLang(l.id) })),
      { id: "settings", label: t("sc.settings"), icon: "settings", hint: "Ctrl ,", group: g.app, run: () => setSettingsOpen("general") },
      { id: "model", label: t("palette.model"), icon: "sparkle", group: g.app, run: () => setSettingsOpen("model") },
      { id: "account", label: info?.authed ? t("account.signOut") : t("account.signIn"), icon: "user", group: g.app, run: () => (info?.authed ? logout() : setSettingsOpen("account")) },
      { id: "updates", label: t("update.check"), icon: "download", group: g.app, run: () => setSettingsOpen("about") },
      { id: "help", label: t("sc.help"), icon: "keyboard", hint: "Ctrl /", group: g.app, run: () => setShortcuts(true) },
      { id: "onboarding", label: t("palette.onboarding"), icon: "sparkle", group: g.app, run: () => setSetting({ onboarded: false }) },
    ];
    return list;
  }, [t, settings, info, mode, agent.busy]);

  useEffect(() => {
    if (boot !== "ready" || !settings?.onboarded) return;
    const onKey = (e) => {
      if (agent.confirm) return; // tasdiq dialogi o'z klaviaturasini boshqaradi
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const k = e.key.toLowerCase();
      const act = {
        k: () => setPalette((p) => !p),
        "/": () => setShortcuts((s) => !s),
      }[k];
      if (act) { e.preventDefault(); act(); return; }
      if (anyModal) return;
      const more = {
        n: newTask,
        o: pickFolder,
        ",": () => setSettingsOpen("general"),
        b: toggleSidebar,
        j: () => togglePanel(),
        l: () => composerRef.current?.focus(),
        e: () => !agent.busy && setMode((m) => (m === "code" ? "chat" : "code")),
        ".": () => agent.busy && stop(),
      }[k];
      if (more && !e.shiftKey) { e.preventDefault(); more(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Render ----
  if (boot === "loading") {
    return (
      <I18n.Provider value={t}>
        <div className="app">
          <TitleBar minimal />
          <div className="splash" role="status" aria-label={t("common.loading")}><Logo size={56} className="pulse" /><div className="splash-bar" /></div>
        </div>
      </I18n.Provider>
    );
  }
  if (boot === "error" || !info || !settings) {
    return (
      <I18n.Provider value={t}>
        <div className="app">
          <TitleBar minimal />
          <div className="splash">
            <Icon name="alert" size={36} className="err" />
            <h1>{t("boot.errorTitle")}</h1>
            <p className="muted">{t("boot.errorDesc")}</p>
            <button type="button" className="btn btn-primary" onClick={() => location.reload()}>{t("common.retry")}</button>
          </div>
        </div>
      </I18n.Provider>
    );
  }

  const changedSet = new Set(agent.changes.map((c) => {
    const abs = /^([a-zA-Z]:[\\/]|[\\/])/.test(c.path) ? c.path : `${info.cwd ?? ""}/${c.path}`;
    return abs.replace(/\\/g, "/").replace(/\/\.\//g, "/").toLowerCase();
  }));
  const disabledReason = !info.authed ? "auth" : mode === "code" && !info.cwd ? "folder" : null;
  const settingsProps = {
    info, settings, setSetting, lang, setLang, model: info.model, onModel, auth, onLogin: login, onCancelLogin: cancelLogin, onLogout: logout,
    onPick: pickFolder, onOpenRecent: openRecent, onReveal: reveal, recent: info.recent ?? [], onClearHistory: clearHistory,
    update, onUpdateAction: updateAction, onLink: (k) => S().openLink(k),
  };

  if (!settings.onboarded) {
    return (
      <I18n.Provider value={t}>
        <div className="app">
          <TitleBar minimal info={info} />
          <Onboarding info={info} lang={lang} setLang={setLang} auth={auth} onLogin={login} onCancelLogin={cancelLogin} onPick={pickFolder} onOpenRecent={openRecent} recent={info.recent ?? []} onFinish={() => { setSetting({ onboarded: true }); setTimeout(() => composerRef.current?.focus(), 50); }} />
          <Toasts toasts={toasts} onDismiss={dismissToast} />
        </div>
      </I18n.Provider>
    );
  }

  return (
    <I18n.Provider value={t}>
      <div className="app">
        <a href="#composer-input" className="skip-link">{t("a11y.skip")}</a>
        <TitleBar info={info} sidebar={settings.sidebar} panel={settings.rightPanel} onToggleSidebar={toggleSidebar} onTogglePanel={() => togglePanel()} onPalette={() => setPalette(true)} />
        <div className="body">
          {settings.sidebar && (
            <Sidebar
              tab={sideTab} setTab={setSideTab} info={info} history={history} activeTaskId={activeTaskId} tree={tree} treeError={treeError}
              onOpenTask={openTask} onRemoveTask={removeTask} onNewTask={newTask} onPick={pickFolder} onReveal={reveal} onRefresh={refreshTree}
              onOpenFile={openFile} changedSet={changedSet} onSettings={() => setSettingsOpen("general")} onAccount={() => setSettingsOpen("account")} busy={agent.busy}
              update={update} onUpdateAction={updateAction}
            />
          )}
          <main className="main-col"aria-label={t("chat.label")}>
            <Conversation agent={agent} mode={mode} info={info} fullAuto={!!settings.fullAuto} onAction={onErrorAction} onPick={pickFolder} onSignIn={() => setSettingsOpen("account")} onSuggest={(s) => { setInput(s); composerRef.current?.focus(); }} />
            {(agent.changes.length > 0 || agent.term.length > 0) && !settings.rightPanel && (
              <div className="peek">
                {agent.changes.length > 0 && <button type="button" className="chip" onClick={() => togglePanel("changes")}><Icon name="diff" size={13} /> {t("changes.count", { n: agent.changes.length })}</button>}
                {agent.term.length > 0 && <button type="button" className="chip" onClick={() => togglePanel("terminal")}><Icon name="terminal" size={13} /> {t("term.count", { n: agent.term.length })}</button>}
              </div>
            )}
            <Composer
              ref={composerRef} value={input} onChange={setInput} onSend={send} onStop={stop} busy={agent.busy} mode={mode} setMode={setMode}
              model={info.model} onModel={onModel} disabledReason={disabledReason} onFix={(r) => (r === "auth" ? setSettingsOpen("account") : pickFolder())}
              fullAuto={!!settings.fullAuto} onFullAuto={setFullAuto}
            />
          </main>
          {settings.rightPanel && (
            <RightPanel tab={panelTab} setTab={setPanelTab} changes={agent.changes} term={agent.term} onUndo={undoChange} onUndoAll={undoAll} onClearTerm={() => dispatch({ type: "clear-term" })} onClose={() => togglePanel()} />
          )}
        </div>
        <StatusBar info={info} mode={mode} model={info.model} busy={agent.busy} onShortcuts={() => setShortcuts(true)} update={update} onUpdate={() => setSettingsOpen("about")} />

        {viewer && (
          <Modal title={<span className="mono">{viewer.name}</span>} onClose={() => setViewer(null)} width={920} className="viewer">
            {viewer.error ? (
              <div className="banner banner-warn"><Icon name="alert" size={14} /><span>{t("files.readError")}: {fsErrText(viewer.error, t)}</span></div>
            ) : (
              <>
                <pre className="viewer-code"><code>{viewer.content.split("\n").map((l, i) => <span key={i} className="vl"><span className="ln">{i + 1}</span>{l || " "}{"\n"}</span>)}</code></pre>
                {viewer.truncated && <p className="faint small pad-sm">{t("files.truncated")}</p>}
              </>
            )}
          </Modal>
        )}
        {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
        {shortcuts && <ShortcutsHelp onClose={() => setShortcuts(false)} Modal={Modal} />}
        {settingsOpen && <Settings initial={settingsOpen} onClose={() => setSettingsOpen(null)} {...settingsProps} />}
        {agent.confirm && <ConfirmDialog req={agent.confirm} onReply={replyConfirm} />}
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    </I18n.Provider>
  );
}
