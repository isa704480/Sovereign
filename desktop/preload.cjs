// SOVEREIGN Cowork — preload. Renderer'ga xavfsiz (contextIsolation) API beradi.
// Diskka yozadigan chaqiruvlar — fsRestore / fsRestoreSnapshot (faqat main'dagi zaxira/nusxa id'si bo'yicha).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

/** Haqiqiy File obyektining diskdagi yo'li (drag&drop / Explorer'dan nusxa); JS'da yasalgan File — "". */
function pathOf(file) {
  try {
    return webUtils.getPathForFile(file) || "";
  } catch {
    return "";
  }
}
// ---- Terminal: faqat HAQIQIY klaviatura/paste kiritishi pty'ga yoziladi ----
// Bu hisoblagich izolyatsiyalangan olamda (preload) turadi — sahifadagi JS uni
// o'zgartira olmaydi va `isTrusted` hodisani soxtalashtira olmaydi. Shu sababli
// modelning javobi (yoki XSS) pty'ga buyruq yoza olmaydi.
const USER_INPUT_WINDOW_MS = 10_000;
let lastUserInput = 0;
for (const ev of ["keydown", "keyup", "paste", "input", "compositionend", "pointerdown", "mouseup", "auxclick", "wheel"]) {
  window.addEventListener(
    ev,
    (e) => {
      if (e.isTrusted) lastUserInput = Date.now();
    },
    true,
  );
}
/**
 * Klaviatura/paste'siz o'tishi mumkin bo'lgan yagona narsa — xterm'ning terminal
 * so'rovlariga javobi (kursor holati, qurilma atributlari, sichqoncha hisobotlari).
 * Ular ESC bilan boshlanadi va ichida CR/LF yo'q — ya'ni hech qanday buyruqni
 * bajara olmaydi.
 */
const isTerminalReport = (s) => s.length <= 64 && s.charCodeAt(0) === 0x1b && !/[\r\n\u0003\u0004]/.test(s);
const userTyped = (data) => Date.now() - lastUserInput < USER_INPUT_WINDOW_MS || isTerminalReport(data);

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
  // Shell Undo — buyruq o'zgartirgan fayllar main'dagi nusxa id'si bo'yicha tiklanadi.
  fsRestoreSnapshot: (snapId) => invoke("fs:restore-snapshot", snapId),
  // Muharrir fayl amallari — yo'l/nom main jarayonda tekshiriladi (electron/files-ipc.mjs):
  // realpath → ish papkasi ichida → himoyalangan ro'yxat → SOVEREIGN.md «Tegma».
  files: {
    open: (path) => invoke("fs:open", { path }),
    stat: (path) => invoke("fs:stat", { path }),
    write: (arg) => invoke("fs:write", arg),
    create: (arg) => invoke("fs:create", arg),
    rename: (arg) => invoke("fs:rename", arg),
    duplicate: (arg) => invoke("fs:duplicate", arg),
    trash: (arg) => invoke("fs:trash", arg),
    revealItem: (path) => invoke("fs:reveal-item", { path }),
  },
  // Xavfsizlik tekshiruvi — faqat o'qish (ish papkasi).
  audit: () => invoke("audit:run"),
  setModel: (id, label) => invoke("app:set-model", id, label),
  models: (qs) => invoke("app:models", qs),
  // attachments: [{kind: "file", id} | {kind: "image", name, dataUrl, thumb}] — main qayta tekshiradi.
  send: (text, mode, attachments) => ipcRenderer.send("agent:send", { text, mode, ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}) }),
  // Biriktirmalar. Renderer yo'l satrini bera OLMAYDI: yo'l faqat native dialogdan yoki
  // haqiqiy File obyektidan (webUtils) olinadi. `files` — yo'li yo'q File'lar (mas. clipboard
  // skrinshoti) indekslari `rest` da qaytadi — renderer ularni rasm sifatida o'zi o'qiydi.
  attach: {
    pick: () => invoke("attach:pick"),
    files: async (files) => {
      const list = Array.from(files ?? []).slice(0, 40);
      const paths = [];
      const rest = [];
      list.forEach((f, i) => {
        const p = pathOf(f);
        if (p) paths.push(p);
        else rest.push(i);
      });
      const r = paths.length ? await invoke("attach:paths", paths) : { items: [], errors: [] };
      return { ...r, rest };
    },
    discard: (id) => invoke("attach:discard", id),
  },
  retry: (mode) => ipcRenderer.send("agent:send", { text: "", mode, retry: true }),
  remember: (fact) => ipcRenderer.send("agent:remember", fact),
  confirmReply: (id, ok) => ipcRenderer.send("agent:confirm-reply", { id, ok }),
  settings: {
    set: (patch) => invoke("settings:set", patch),
  },
  // Full auto buyruqlari sandbox'i: {mode, level: full|container|limited, method, image, reason}.
  sandboxStatus: (force) => invoke("sandbox:status", force === true),
  // Chuqur so'rash kartasi: javob {q1: "…", q2: ["a","b"]} yoki "Taxmin bilan javob ber" (skip).
  inquiry: {
    answer: (id, answers) => invoke("inquiry:answer", { id, answers }),
    skip: (id) => invoke("inquiry:answer", { id, skip: true }),
  },
  // Mahalliy model (Ollama, faqat 127.0.0.1 — so'rovlar main jarayondan).
  local: {
    status: () => invoke("local:status"),
    models: () => invoke("local:models"),
    // Qo'lda: use("qwen2.5-coder:7b") / use(null) — bulutga qaytish.
    use: (model) => invoke("local:use", { model: model ?? null }),
    // "local-offer" kartasiga javob: model null — rad; remember — "Keyingi safar so'rama".
    answerOffer: (id, model, remember) => invoke("local:use", { id, model: model ?? null, remember: !!remember }),
  },
  // Loyiha xotirasi (SOVEREIGN.md) — yo'l main'da hisoblanadi, renderer yo'l bermaydi.
  project: {
    info: () => invoke("project:info"),
    open: () => invoke("project:open"),
    create: () => invoke("project:create"),
    remember: (text) => invoke("project:remember", text),
  },
  // SOVEREIGN Skills — akkauntda yoqilgan skillar (so'rov main'dan, token renderer'ga chiqmaydi).
  skills: {
    get: () => invoke("skills:get"),
    set: (ids) => invoke("skills:set", ids),
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
  // Foydalanuvchi terminali (pastki panel). `write` — faqat haqiqiy kiritishdan.
  terminal: {
    create: (cols, rows) => invoke("term:create", { cols, rows }),
    write: (id, data) => {
      if (typeof id !== "string" || typeof data !== "string" || !data) return false;
      if (data.length > 4096 || !userTyped(data)) return false;
      ipcRenderer.send("term:write", { id, data });
      return true;
    },
    resize: (id, cols, rows) => ipcRenderer.send("term:resize", { id, cols, rows }),
    // Ctrl+V: matnni main'dan olamiz (shell o'zi qo'ymasin). Faqat haqiqiy
    // klaviatura hodisasidan keyin — model javobi buferni o'qiy olmaydi.
    paste: (id) => (typeof id === "string" && userTyped("") ? invoke("term:paste", id) : Promise.resolve({ error: "no-input" })),
    close: (id) => invoke("term:close", id),
    info: () => invoke("term:info"),
    onEvent: (cb) => {
      const handler = (_e, ev) => cb(ev);
      ipcRenderer.on("term:event", handler);
      return () => ipcRenderer.removeListener("term:event", handler);
    },
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
