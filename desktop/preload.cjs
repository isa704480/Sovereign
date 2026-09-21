// SOVEREIGN Cowork — preload. Renderer'ga xavfsiz (contextIsolation) API beradi.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sovereign", {
  init: () => ipcRenderer.invoke("app:init"),
  pickFolder: () => ipcRenderer.invoke("app:pick-folder"),
  send: (text) => ipcRenderer.send("agent:send", text),
  remember: (fact) => ipcRenderer.send("agent:remember", fact),
  confirmReply: (id, ok) => ipcRenderer.send("agent:confirm-reply", { id, ok }),
  onEvent: (cb) => {
    const handler = (_e, ev) => cb(ev);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
});
