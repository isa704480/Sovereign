// SOVEREIGN Cowork — preload. Renderer'ga xavfsiz (contextIsolation) API beradi.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sovereign", {
  init: () => ipcRenderer.invoke("app:init"),
  pickFolder: () => ipcRenderer.invoke("app:pick-folder"),
  newTask: () => ipcRenderer.invoke("app:new-task"),
  fsTree: () => ipcRenderer.invoke("fs:tree"),
  fsRead: (path) => ipcRenderer.invoke("fs:read", path),
  fsWrite: (path, content) => ipcRenderer.invoke("fs:write", { path, content }),
  setModel: (id) => ipcRenderer.invoke("app:set-model", id),
  send: (text, mode) => ipcRenderer.send("agent:send", { text, mode }),
  remember: (fact) => ipcRenderer.send("agent:remember", fact),
  confirmReply: (id, ok) => ipcRenderer.send("agent:confirm-reply", { id, ok }),
  onEvent: (cb) => {
    const handler = (_e, ev) => cb(ev);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
});
