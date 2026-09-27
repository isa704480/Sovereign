import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { TitleBar, StatusBar, Toasts } from "./components/Chrome.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Conversation from "./components/Conversation.jsx";
import Composer from "./components/Composer.jsx";
import RightPanel from "./components/RightPanel.jsx";
import EditorPane from "./components/EditorPane.jsx";
import TerminalPanel from "./components/TerminalPanel.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import CommandPalette, { ShortcutsHelp } from "./components/CommandPalette.jsx";
import Settings from "./components/Settings.jsx";
import Onboarding from "./components/Onboarding.jsx";
import AuditDialog from "./components/AuditDialog.jsx";
import Modal, { hasOpenLayer } from "./components/Modal.jsx";
import Icon, { Logo } from "./components/Icon.jsx";
import { applyEvent, replayEvents, addChange, initialAgent } from "./lib/agent.js";
import { I18n, makeT, detectLang, LANGS } from "./lib/i18n.js";
import { setPlatform } from "./lib/keys.js";
import { ATTACH_LIMITS, attachErrKey, checkSend, toSendPayload, prepareImage, dataUrlToBlob, isImageMime } from "./lib/attachments.js";

const S = () => window.sovereign;
const TICK = String.fromCharCode(96); // `  — Ctrl+` yorlig‘i uchun

function reducer(s, a) {
  switch (a.type) {
    case "event": return applyEvent(s, a.ev);
    case "reset": return { ...initialAgent };
    case "replay": return replayEvents(a.events);
    case "confirm-done": return { ...s, confirm: null, changes: a.change ? addChange(s.changes, a.change) : s.changes };
    case "set-changes": return { ...s, changes: a.changes };
    // Muharrirda Ctrl+S bilan saqlangan fayl — agent yozuvlari bilan bir xil ro'yxatga (Undo ishlaydi).
    case "file-saved": return { ...s, changes: addChange(s.changes, a.change) };
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
  const [autoConsent, setAutoConsent] = useState(false); // Full auto xavfi — papka uchun bir martalik rozilik
  const [shortcuts, setShortcuts] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(null);
  const [auth, setAuth] = useState({ state: "idle" });
  const [update, setUpdate] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [input, setInput] = useState("");
  // Biriktirmalar: {key, kind: "image"|"file", name, size, status: "processing"|"ready", id?, sub?, chars?, truncated?, dataUrl?, thumb?}
  const [attachments, setAttachments] = useState([]);
  const attRef = useRef(attachments);
  attRef.current = attachments;
  const attSeq = useRef(0);
  const addFilesRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);
  const composerRef = useRef(null);
  const editorRef = useRef(null);
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
  const tRef = useRef(t);
  tRef.current = t;

  // ---- Yangilanishni o'rnatish (qayta ishga tushirish) ----
  // Agent ishlayotganda HECH QACHON qayta ishga tushirilmaydi: so'rov eslab qolinadi va vazifa
  // tugagach (bekor qilish imkoni bilan) bajariladi. main ham ishlayotgan vazifada "busy" qaytaradi.
  const pendingInstall = useRef(false);
  const restartTimer = useRef(null);
  const deferInstall = useCallback(() => {
    if (!pendingInstall.current) toast(tRef.current("update.deferred"), "info");
    pendingInstall.current = true;
  }, [toast]);
  const requestInstall = useCallback(async () => {
    if (busyRef.current) { deferInstall(); return; }
    const r = await S().updates.install().catch(() => null);
    if (r?.error === "busy") deferInstall();
  }, [deferInstall]);
  const installRef = useRef(requestInstall);
  installRef.current = requestInstall;
  useEffect(() => {
    if (agent.busy || !pendingInstall.current) return;
    pendingInstall.current = false;
    clearTimeout(restartTimer.current);
    const cancel = () => { clearTimeout(restartTimer.current); restartTimer.current = null; };
    toast(t("update.restartingSoon"), "info", { label: t("common.cancel"), run: cancel });
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      installRef.current();
    }, 6000);
  }, [agent.busy]);

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
        setPlatform(i.platform); // kbd belgilari: macOS — ⌘
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
          installRef.current();
        }
        return;
      }
      if (ev.type === "fs-changed") {
        // Agent yoki tashqi muharrir fayl o'zgartirdi — daraxt va ochiq yorliqlar yangilanadi.
        refreshTree();
        editorRef.current?.externalChange(ev.paths ?? []);
        return;
      }
      dispatch({ type: "event", ev });
      if (ev.type === "tool-done" && (ev.name === "write_file" || ev.name === "make_dir" || ev.name === "run_command") && ev.status !== "declined" && ev.status !== "skipped") refreshTree();
      if (ev.type === "snapshot") refreshTree();
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
  // Full auto yoqish: shu papka uchun rozilik bo'lmasa — avval xavf dialogi (main ham `fullAutoAck`siz yoqmaydi).
  const setFullAuto = async (on, ack = false) => {
    if (on && !ack && !settings.fullAutoConsented) {
      setSettingsOpen(null); // ikki modal bir-birining fokus tuzog'ini buzmasin
      setAutoConsent(true);
      return;
    }
    await setSetting(on ? { fullAuto: true, ...(ack ? { fullAutoAck: true } : {}) } : { fullAuto: false });
    toast(on ? t("auto.enabled") : t("auto.disabled"), on ? "info" : "ok");
  };
  const toggleSidebar = () => setSetting({ sidebar: !settings.sidebar });
  // Foydalanuvchi terminali (pastki panel): Ctrl+` bilan ochiladi/yopiladi.
  const toggleTerminal = useCallback(() => {
    setSettings((s) => {
      const open = !s.terminal;
      S().settings.set({ terminal: open }).then((n) => n && setSettings(n));
      if (!open) setTimeout(() => composerRef.current?.focus(), 0);
      return { ...s, terminal: open };
    });
  }, []);
  // Sudrash paytida faqat mahalliy holat; qo'yib yuborilganda sozlamaga yoziladi.
  const setTermHeight = useCallback((h, persist) => {
    setSettings((s) => ({ ...s, terminalHeight: h }));
    if (persist) S().settings.set({ terminalHeight: h });
  }, []);
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
    editorRef.current?.closeAll(); // boshqa papka — eski yorliqlar yopiladi
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
    if (r?.history) setHistory(r.history.filter((x) => !pendingRemovals.current.has(x.id)));
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
  // Vazifani o'chirish — qaytarib bo'ladigan: ro'yxatdan darhol yashiriladi, diskdan esa
  // 7 soniyadan keyin o'chiriladi ("Qaytarish" bosilsa — joyiga qaytadi). Ilova shu orada yopilsa —
  // vazifa saqlanib qoladi (xavfsiz tomonga).
  const pendingRemovals = useRef(new Map());
  const removeTask = async (id) => {
    const item = history.find((h) => h.id === id);
    if (!item || pendingRemovals.current.has(id)) return;
    const wasActive = id === activeTaskId;
    if (wasActive) {
      if (agent.busy) return; // ishlayotgan vazifa avval to'xtatiladi (tugma ham o'chiq)
      await S().newTask().catch(() => null); // main joriy vazifadan chiqadi, fayl hali o'chmaydi
      dispatch({ type: "reset" });
      setActiveTaskId(null);
    }
    setHistory((h) => h.filter((x) => x.id !== id));
    const commit = async () => {
      pendingRemovals.current.delete(id);
      const list = await S().history.remove(id).catch(() => null);
      if (list) setHistory(list.filter((x) => !pendingRemovals.current.has(x.id)));
    };
    const undo = () => {
      const p = pendingRemovals.current.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      pendingRemovals.current.delete(id);
      setHistory((h) => [...h.filter((x) => x.id !== id), item].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
      if (wasActive) openTaskRef.current?.(id);
    };
    pendingRemovals.current.set(id, { timer: setTimeout(commit, 7000) });
    toast(t("tasks.removed", { title: item.title || "" }), "info", { label: t("common.undo"), run: undo });
  };
  const openTaskRef = useRef(null);
  openTaskRef.current = openTask;
  const clearHistory = async () => {
    for (const p of pendingRemovals.current.values()) clearTimeout(p.timer);
    pendingRemovals.current.clear();
    await S().history.clear();
    setHistory([]);
    dispatch({ type: "reset" });
    setActiveTaskId(null);
    toast(t("privacy.cleared"), "ok");
  };

  // ---- Biriktirmalar ----
  // Fayllar diskdan faqat main'da o'qiladi (yo'l — native dialog yoki preload'dagi webUtils orqali);
  // rasmlar bu yerda kichraytiriladi (≤2000 px, ~200 KB) va yuborishda main yana tekshiradi.
  const attachErr = (code, name) => toast(t(attachErrKey(code), { name: name || "", n: ATTACH_LIMITS.maxAttachments }), "err");
  const patchAtt = (key, patch) => setAttachments((l) => l.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const dropAtt = (key) => setAttachments((l) => l.filter((a) => a.key !== key));
  const addImage = async (blob, name) => {
    const key = `att${++attSeq.current}`;
    setAttachments((l) => [...l, { key, kind: "image", name, size: blob.size, status: "processing" }]);
    try {
      const r = await prepareImage(blob);
      if (!r.dataUrl || r.dataUrl.length > ATTACH_LIMITS.imageDataUrlChars) throw new Error("too-large");
      patchAtt(key, { status: "ready", dataUrl: r.dataUrl, thumb: r.thumb });
    } catch {
      dropAtt(key);
      attachErr("bad-image", name);
    }
  };
  /** Joy bormi: ortiqchasi rad (main'dagi fayl tarkibi ham o'chiriladi). */
  const room = () => ATTACH_LIMITS.maxAttachments - attRef.current.length;
  const takeResult = (r) => {
    for (const e of r?.errors ?? []) attachErr(e.code, e.name);
    let full = false;
    for (const it of r?.items ?? []) {
      if (room() <= 0) {
        full = true;
        if (it.kind === "file") S().attach.discard(it.id).catch(() => {});
        continue;
      }
      if (it.kind === "image") {
        attRef.current = [...attRef.current, { key: "pending" }]; // joy band — ketma-ket qo'shishda hisob to'g'ri qolsin
        addImage(dataUrlToBlob(it.dataUrl), it.name);
      } else {
        const a = { key: `att${++attSeq.current}`, kind: "file", id: it.id, sub: it.sub, name: it.name, size: it.size, chars: it.chars, truncated: !!it.truncated, status: "ready" };
        attRef.current = [...attRef.current, a];
        setAttachments((l) => [...l, a]);
      }
    }
    if (full) attachErr("too-many");
  };
  const pickAttachments = async () => {
    if (room() <= 0) { attachErr("too-many"); return; }
    takeResult(await S().attach.pick().catch(() => null));
    composerRef.current?.focus();
  };
  /** Drag&drop va Ctrl+V: yo'li bor File'lar main'da o'qiladi, yo'lsiz rasmlar (skrinshot) — shu yerda. */
  const addFiles = async (files) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    const free = room();
    if (free <= 0) { attachErr("too-many"); return; }
    const take = list.slice(0, free);
    const r = await S().attach.files(take).catch(() => null);
    if (!r) return;
    takeResult(r);
    for (const i of r.rest ?? []) {
      const f = take[i];
      if (!f) continue;
      if (!isImageMime(f.type)) { attachErr("unsupported", f.name); continue; }
      if (room() <= 0) { attachErr("too-many"); break; }
      attRef.current = [...attRef.current, { key: "pending" }];
      addImage(f, f.name && f.name !== "image.png" ? f.name : `${t("attach.pasted")}.png`);
    }
    if (list.length > take.length) attachErr("too-many");
    composerRef.current?.focus();
  };
  const removeAttachment = (key) => {
    const a = attRef.current.find((x) => x.key === key);
    if (a?.kind === "file" && a.id) S().attach.discard(a.id).catch(() => {});
    dropAtt(key);
    composerRef.current?.focus();
  };

  // Oyna ustiga fayl sudralsa — butun oyna tashlash maydoni (overlay); boshqa joyga tashlansa ham ochilmaydi.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true); };
    const over = (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFilesRef.current?.(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  addFilesRef.current = addFiles;

  const send = () => {
    const text = input.trim();
    const atts = attachments;
    if ((!text && !atts.length) || agent.busy) return;
    const err = checkSend(atts);
    if (err) { attachErr(err); return; }
    S().send(text, mode, toSendPayload(atts));
    setInput("");
    setAttachments([]);
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
    if (ch.kind === "command") {
      // Shell Undo — buyruq o'zgartirgan fayllar main'dagi nusxadan.
      const r = await S().fsRestoreSnapshot(ch.snapId).catch(() => null);
      if (r?.ok && r.kept) toast(t("changes.cmdKept", { n: r.kept }), "info");
      return r?.ok ? null : fsErrText(r, t);
    }
    if (!ch.backupId) return t("changes.noBackup");
    const r = await S().fsRestore(ch.backupId);
    return r?.ok ? null : fsErrText(r, t);
  };
  const undoChange = async (ch) => {
    const err = await restoreOne(ch);
    const label = ch.kind === "command" ? ch.command : ch.path;
    if (err) toast(`${t("changes.undoFailed")}: ${label} — ${err}`, "err");
    else {
      dispatch({ type: "set-changes", changes: agent.changes.filter((c) => c !== ch) });
      toast(ch.kind === "command" ? t("changes.cmdUndone", { cmd: label }) : t("changes.undone", { path: label }), "ok");
    }
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
  const logout = async () => {
    const st = await S().auth.logout();
    setInfo(st);
    setAuth({ state: "idle" });
    // Server tokenni bekor qila olmadi — mahalliy chiqish bajarildi, lekin foydalanuvchi ogohlantiriladi.
    if (st?.revokeFailed) toast(t("account.revokeFailed", { url: "soveregn.xyz/cli/sessions" }), "err");
    else toast(t("account.signedOut"));
  };

  const updateAction = async (what) => {
    if (what === "check") setUpdate(await S().updates.check());
    else if (what === "download") setUpdate(await S().updates.download());
    else if (what === "install") requestInstall();
    else if (what === "download-install") {
      // Sidebar kartasi: yuklab olish → tayyor bo'lganda o'rnatib, qayta ishga tushirish.
      installWhenReady.current = true;
      const st = await S().updates.download();
      setUpdate(st);
      if (st?.state === "ready" && installWhenReady.current) {
        installWhenReady.current = false;
        requestInstall();
      }
    } else if (what === "open-download") S().openLink("download"); // macOS: sayt orqali
  };

  // Daraxtdan (yoki auditdan) fayl ochish — muharrir ko'rinishida yangi yorliq.
  const openFile = useCallback(
    (node) => {
      const path = typeof node === "string" ? node : node?.path;
      if (!path) return;
      setSetting({ mainView: "editor" });
      editorRef.current?.open(path);
    },
    [setSetting],
  );
  const setMainView = (v) => setSetting({ mainView: v });

  const onErrorAction = (a) => {
    if (a === "retry") retry();
    else if (a === "signin") setSettingsOpen("account");
    else if (a === "folder") pickFolder();
  };

  // ---- Commands + hotkeys ----
  const anyModal = !!(palette || shortcuts || settingsOpen || auditOpen || autoConsent || agent.confirm);
  // Audit → "AI bilan tuzatish": tayyor topshiriq Kod rejimidagi composer'ga qo'yiladi (yuborilmaydi).
  const fixWithAi = (prompt) => {
    setAuditOpen(false);
    setMode("code");
    setInput(prompt);
    setTimeout(() => composerRef.current?.focus(), 30);
  };
  const commands = useMemo(() => {
    if (!settings) return [];
    const g = { task: t("palette.gTask"), view: t("palette.gView"), app: t("palette.gApp") };
    const list = [
      { id: "new", label: t("sc.new"), icon: "plus", hint: "Ctrl N", group: g.task, run: newTask },
      { id: "open", label: t("sc.open"), icon: "folder", hint: "Ctrl O", group: g.task, run: pickFolder },
      ...(info?.recent ?? []).filter((r) => r !== info?.cwd).slice(0, 5).map((r) => ({ id: `recent-${r}`, label: `${t("folder.recentOpen")}: ${r.split(/[\\/]/).filter(Boolean).pop()}`, keywords: r, icon: "history", group: g.task, run: () => openRecent(r) })),
      ...(info?.cwd ? [{ id: "reveal", label: t(info?.platform === "darwin" ? "files.revealMac" : "files.reveal"), icon: "external", group: g.task, run: reveal }] : []),
      ...(info?.cwd ? [{ id: "audit", label: t("audit.title"), keywords: `${t("audit.keywords")} audit security rls env cors`, icon: "shield", group: g.task, run: () => setAuditOpen(true) }] : []),
      { id: "mode", label: mode === "code" ? t("palette.toChat") : t("palette.toCode"), icon: mode === "code" ? "chat" : "code", hint: "Ctrl E", group: g.task, run: () => setMode((m) => (m === "code" ? "chat" : "code")) },
      ...(agent.busy ? [{ id: "stop", label: t("sc.stop"), icon: "stop", hint: "Ctrl .", group: g.task, run: stop }] : []),
      ...(info?.cwd ? [{ id: "editor", label: settings.mainView === "editor" ? t("editor.toChat") : t("editor.toEditor"), icon: settings.mainView === "editor" ? "chat" : "code", hint: "Ctrl Shift E", group: g.view, run: () => setSetting({ mainView: settings.mainView === "editor" ? "chat" : "editor" }) }] : []),
      { id: "sidebar", label: t("sc.sidebar"), icon: "sidebar", hint: "Ctrl B", group: g.view, run: toggleSidebar },
      { id: "changes", label: t("palette.showChanges"), icon: "diff", group: g.view, run: () => togglePanel("changes") },
      { id: "terminal", label: t("palette.showTerminal"), icon: "terminal", hint: "Ctrl J", group: g.view, run: () => togglePanel("terminal") },
      { id: "shterm", label: t("sh.palette"), keywords: "terminal shell console powershell bash", icon: "terminal", hint: `${info?.platform === "darwin" ? "Cmd" : "Ctrl"} ${TICK}`, group: g.view, run: toggleTerminal },
      { id: "project", label: t("palette.showProject"), keywords: "SOVEREIGN.md", icon: "list", group: g.view, run: () => togglePanel("project") },
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
      // Ctrl+` / Cmd+` — terminal paneli (terminal ichida ham ishlaydi).
      if (e.key === "`" || e.code === "Backquote") { e.preventDefault(); toggleTerminal(); return; }
      // Terminalda yozayotganda qolgan yorliqlar shellga tegishli (Ctrl+L, Ctrl+B…).
      if (e.target?.closest?.(".shterm")) return;
      // Ctrl+K / Ctrl+/ — o'z oynasini yopadi, lekin boshqa dialog yoki popover (ModelPicker) ochiq
      // bo'lsa uning ustiga yangi modal ochmaydi (ikki fokus tuzog'i bir-birini buzmasin).
      const blocked = anyModal || hasOpenLayer();
      const act = {
        k: () => (palette ? setPalette(false) : !blocked && setPalette(true)),
        "/": () => (shortcuts ? setShortcuts(false) : !blocked && setShortcuts(true)),
      }[k];
      if (act) { e.preventDefault(); act(); return; }
      if (blocked) return;
      // Ctrl+Shift+E — suhbat ↔ muharrir ko'rinishi (ish papkasi tanlangan bo'lsa).
      if (e.shiftKey && k === "e" && info?.cwd) {
        e.preventDefault();
        setSetting({ mainView: settings.mainView === "editor" ? "chat" : "editor" });
        return;
      }
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

  // Buyruq yozuvlarida — o'zgargan/yangi fayllar (o'chirilganlar daraxtda yo'q).
  const changedPaths = agent.changes.flatMap((c) => (c.kind === "command" ? c.files.filter((f) => f.kind === "modified" || f.kind === "created").map((f) => f.path) : [c.path]));
  const changedSet = new Set(changedPaths.map((p) => {
    const abs = /^([a-zA-Z]:[\\/]|[\\/])/.test(p) ? p : `${info.cwd ?? ""}/${p}`;
    return abs.replace(/\\/g, "/").replace(/\/\.\//g, "/").toLowerCase();
  }));
  // Muharrir ko'rinishi faqat ish papkasi tanlanganda (aks holda — suhbat).
  const editorView = !!info.cwd && settings.mainView === "editor";
  const disabledReason = !info.authed ? "auth" : mode === "code" && !info.cwd ? "folder" : null;
  const settingsProps = {
    info, settings, setSetting, lang, setLang, model: info.model, onModel, auth, onLogin: login, onCancelLogin: cancelLogin, onLogout: logout,
    onPick: pickFolder, onOpenRecent: openRecent, onReveal: reveal, recent: info.recent ?? [], onClearHistory: clearHistory,
    update, onUpdateAction: updateAction, onLink: (k) => S().openLink(k), onFullAuto: setFullAuto,
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
        <TitleBar info={info} sidebar={settings.sidebar} panel={settings.rightPanel} terminal={!!settings.terminal} onToggleSidebar={toggleSidebar} onTogglePanel={() => togglePanel()} onToggleTerminal={toggleTerminal} onPalette={() => setPalette(true)} />
        <div className="body">
          {settings.sidebar && (
            <Sidebar
              tab={sideTab} setTab={setSideTab} info={info} history={history} activeTaskId={activeTaskId} tree={tree} treeError={treeError}
              onOpenTask={openTask} onRemoveTask={removeTask} onNewTask={newTask} onPick={pickFolder} onReveal={reveal} onRefresh={refreshTree}
              onOpenFile={openFile} changedSet={changedSet} onSettings={() => setSettingsOpen("general")} onAccount={() => setSettingsOpen("account")} busy={agent.busy}
              update={update} onUpdateAction={updateAction} onToast={toast}
              onFileRenamed={(from, to) => { editorRef.current?.renamed(from, to); }} onFileRemoved={(p) => editorRef.current?.removed(p)}
            />
          )}
          <main className="main-col" aria-label={editorView ? t("editor.title") : t("chat.label")}>
            {/* Suhbat asosiy bo'lib qoladi; «Muharrir» — o'sha ustundagi ikkinchi ko'rinish (Ctrl+Shift+E). */}
            {info.cwd && (
              <div className="view-tabs" role="tablist" aria-label={t("editor.viewTabs")}>
                {[["chat", t("chat.label"), "chat"], ["editor", t("editor.title"), "code"]].map(([k, l, ic]) => (
                  <button key={k} type="button" role="tab" aria-selected={(settings.mainView === "editor") === (k === "editor")} className={`view-tab ${(settings.mainView === "editor") === (k === "editor") ? "on" : ""}`} onClick={() => setMainView(k)}>
                    <Icon name={ic} size={13} /> {l}
                  </button>
                ))}
                <span className="grow" />
                <kbd className="kbd-inline">Ctrl Shift E</kbd>
              </div>
            )}
            {editorView ? (
              <EditorPane
                ref={editorRef} dark={resolvedTheme === "dark"} wrap={settings.editorWrap !== false} onWrap={(w) => setSetting({ editorWrap: w })}
                onSaved={(change) => dispatch({ type: "file-saved", change })} onToast={toast} onRefreshTree={refreshTree} platform={info.platform}
              />
            ) : (
              <Conversation agent={agent} mode={mode} info={info} fullAuto={!!settings.fullAuto} onAction={onErrorAction} onPick={pickFolder} onSignIn={() => setSettingsOpen("account")} onSuggest={(s) => { setInput(s); composerRef.current?.focus(); }} />
            )}
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
              attachments={attachments} onAttach={pickAttachments} onRemoveAttachment={removeAttachment} onFiles={addFiles}
            />
          </main>
          {settings.rightPanel && (
            <RightPanel tab={panelTab} setTab={setPanelTab} changes={agent.changes} term={agent.term} onUndo={undoChange} onUndoAll={undoAll} onClearTerm={() => dispatch({ type: "clear-term" })} onClose={() => togglePanel()} cwd={info.cwd} toast={toast} />
          )}
        </div>
        {settings.terminal && (
          <TerminalPanel
            cwd={info.cwd} platform={info.platform} height={settings.terminalHeight ?? 260}
            onHeight={setTermHeight} onClose={toggleTerminal}
          />
        )}
        <StatusBar info={info} mode={mode} model={info.model} busy={agent.busy} onShortcuts={() => setShortcuts(true)} update={update} onUpdate={() => setSettingsOpen("about")} />

        {auditOpen && (
          <AuditDialog
            lang={lang}
            onClose={() => setAuditOpen(false)}
            onFix={fixWithAi}
            onOpenFile={(rel) => { setAuditOpen(false); openFile({ path: rel, name: rel.split("/").pop() }); }}
          />
        )}
        {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
        {shortcuts && <ShortcutsHelp onClose={() => setShortcuts(false)} Modal={Modal} />}
        {settingsOpen && <Settings initial={settingsOpen} onClose={() => setSettingsOpen(null)} {...settingsProps} />}
        {autoConsent && (
          <Modal
            title={t("auto.consent.title")} tone="danger" width={540} onClose={() => setAutoConsent(false)}
            footer={(
              <>
                <span className="trunc mono muted small" title={info.cwd ?? ""}>{info.cwd ?? ""}</span>
                <span className="foot-actions">
                  <button type="button" className="btn" data-autofocus onClick={() => setAutoConsent(false)}>{t("confirm.cancel")}</button>
                  <button type="button" className="btn btn-danger" onClick={() => { setAutoConsent(false); setFullAuto(true, true); }}>{t("auto.consent.yes")}</button>
                </span>
              </>
            )}
          >
            <p>{t("auto.consent.body")}</p>
            <p className="muted small">{t("auto.consent.notSandbox")}</p>
          </Modal>
        )}
        {agent.confirm && <ConfirmDialog req={agent.confirm} onReply={replyConfirm} />}
        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-card">
              <Icon name="upload" size={28} />
              <div className="strong">{t("attach.drop")}</div>
              <div className="muted small">{t("attach.dropHint", { n: ATTACH_LIMITS.maxAttachments })}</div>
            </div>
          </div>
        )}
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    </I18n.Provider>
  );
}
