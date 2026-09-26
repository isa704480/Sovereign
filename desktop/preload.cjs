// SOVEREIGN Cowork — preload. Renderer'ga xavfsiz (contextIsolation) API beradi.
// Diskka yozadigan yagona chaqiruv — fsRestore (faqat main'dagi zaxira id'si bo'yicha).
const { contextBridge, ipcRenderer } = require("electron");

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld("sovereign", {
  init: () => invoke("app:init"),
  state: () => invoke("app:state"),
  pickFolder: () => invoke("app:pick-folder"),
  openRecent: (path) => invoke("app:open-recent", path),
  revealWorkspace: () => invoke("app:reveal-workspace"),
  openLink: (key) => invoke("app:open-link", key),
  newTask: () => invoke("app:new-task"),
  stop: () => invoke("agent:stop"),
  fsTree: () => invoke("fs:tree"),
  fsRead: (path) => invoke("fs:read", path),
  // Undo — ixtiyoriy yo'lga yozish yo'q; faqat main'dagi zaxira id'si bo'yicha tiklash.
  fsRestore: (backupId) => invoke("fs:restore", backupId),
  setModel: (id, label) => invoke("app:set-model", id, label),
  models: (qs) => invoke("app:models", qs),
  send: (text, mode) => ipcRenderer.send("agent:send", { text, mode }),
  retry: (mode) => ipcRenderer.send("agent:send", { text: "", mode, retry: true }),
  remember: (fact) => ipcRenderer.send("agent:remember", fact),
  confirmReply: (id, ok) => ipcRenderer.send("agent:confirm-reply", { id, ok }),
  settings: {
    set: (patch) => invoke("settings:set", patch),
  },
  auth: {
    login: () => invoke("auth:login"),
    cancel: () => invoke("auth:cancel"),
    logout: () => invoke("auth:logout"),
  },
  history: {
    list: () => invoke("history:list"),
    open: (id) => invoke("history:open", id),
    remove: (id) => invoke("history:remove", id),
    clear: () => invoke("history:clear"),
  },
  updates: {
    check: () => invoke("update:check"),
    download: () => invoke("update:download"),
    install: () => invoke("update:install"),
  },
  onEvent: (cb) => {
    const handler = (_e, ev) => cb(ev);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
});
