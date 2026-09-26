// DEV ONLY — Electron'siz brauzerda UI'ni ko'rish uchun soxta window.sovereign.
// Hech qanday tarmoq yoki disk amali yo'q; agent navbati skript bilan simulyatsiya qilinadi.
// URL parametrlari: ?fresh=1 (onboarding), ?anon=1 (kirilmagan), ?nofolder=1,
// ?update=available|downloading|ready|failed (&mac=1, &fail=1) — yangilanish kartasi.

const qs = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

export function install() {
  const listeners = new Set();
  const emit = (ev) => listeners.forEach((cb) => cb(ev));
  const settings = {
    onboarded: !qs.has("fresh"), theme: qs.get("theme") || "system", lang: qs.get("lang") || "", notifications: true, autoUpdate: true,
    defaultMode: "code", sidebar: true, rightPanel: qs.has("panel"), model: "", modelLabel: "",
  };
  let cwd = qs.has("nofolder") ? null : "D:\\Projects\\demo-shop";
  let authed = !qs.has("anon");
  let model = "Auto";
  const history = [
    { id: uuid(), title: "Landing sahifaga hero bo‘limi qo‘sh", cwd: "D:\\Projects\\demo-shop", mode: "code", createdAt: Date.now() - 3600e3, updatedAt: Date.now() - 3500e3, status: "done" },
    { id: uuid(), title: "SQL indekslar haqida savol", cwd: null, mode: "chat", createdAt: Date.now() - 2 * 86400e3, updatedAt: Date.now() - 2 * 86400e3, status: "stopped" },
  ];
  const pending = new Map();
  let task = null;
  let aborted = false;

  const state = () => ({
    authed, email: authed ? "islombek@example.com" : "", baseUrl: "https://api.example.invalid", cwd, model, modelId: "", version: "0.5.0-dev",
    offline: false, platform: qs.has("mac") ? "darwin" : "win32", settings: { ...settings }, recent: ["D:\\Projects\\demo-shop", "D:\\Projects\\api-server"], history: [...history], task: null, busy: false, update: { ...update },
  });
  // ?update=available|downloading|ready|failed — sidebar yangilanish kartasi holatlari (?mac=1 — macOS).
  const UPDATE_PRESETS = {
    available: { state: "available", version: "0.5.9", ...(qs.has("mac") ? { manual: true } : {}) },
    downloading: { state: "downloading", version: "0.5.9", percent: 42 },
    ready: { state: "ready", version: "0.5.9" },
    failed: { state: "error", version: "0.5.9", phase: "download" },
  };
  let update = UPDATE_PRESETS[qs.get("update")] ?? { state: "idle" };
  const setUpdate = (u) => { update = u; emit({ type: "update", ...u }); return u; };
  async function mockDownload() {
    if (qs.get("fail") === "1") { await sleep(600); return setUpdate(UPDATE_PRESETS.failed); }
    for (let p = 0; p <= 100; p += 20) { setUpdate({ state: "downloading", version: "0.5.9", percent: p }); await sleep(250); }
    return setUpdate(UPDATE_PRESETS.ready);
  }
  const confirm = (meta, question = "") => new Promise((resolve) => {
    const id = uuid();
    pending.set(id, resolve);
    emit({ type: "confirm", id, question, meta });
  });

  async function runTurn(text, mode) {
    aborted = false;
    if (!task) { task = { id: uuid(), title: text.slice(0, 80), cwd, mode, createdAt: Date.now(), updatedAt: Date.now(), status: "running" }; }
    emit({ type: "task", task: { ...task, status: "running" } });
    emit({ type: "user", text, mode });
    await sleep(900);
    if (aborted) return;
    if (mode === "chat") {
      emit({ type: "text", text: "Albatta! Qisqa javob:\n\n- **useState** — holat\n- **useEffect** — yon ta’sirlar\n\n```js\nconst [n, setN] = useState(0);\n```" });
      emit({ type: "done" });
      return finish("done");
    }
    emit({ type: "text", text: "Reja: avval loyiha tuzilmasini ko‘raman, keyin `src/server.js` yarataman va testni ishga tushiraman." });
    const entries = [];
    const step = async (name, args, run) => {
      const callId = uuid();
      emit({ type: "tool", callId, name, args });
      const r = await run();
      if (aborted) return;
      entries.push({ tool: name, target: args.path ?? args.command, status: r.status, exit: r.exit ?? null, detail: r.detail ?? "" });
      emit({ type: "tool-done", callId, name, status: r.status, result: r.result });
    };
    await step("list_dir", { path: "." }, async () => { await sleep(500); return { status: "ok", result: "src/\npackage.json\nREADME.md" }; });
    if (aborted) return;
    await step("write_file", { path: "src/server.js", contentLength: 214 }, async () => {
      const ok = await confirm({ tool: "write_file", path: "src/server.js", exists: true, existed: true, before: "import express from \"express\";\nconst app = express();\napp.listen(3000);\n", content: "import express from \"express\";\n\nconst app = express();\napp.use(express.json());\n\napp.get(\"/health\", (_req, res) => res.json({ ok: true }));\n\nconst port = process.env.PORT ?? 3000;\napp.listen(port, () => console.log(`listening on ${port}`));\n", backupId: uuid() });
      return ok ? { status: "ok", result: "OK: src/server.js yozildi." } : { status: "declined", result: "Foydalanuvchi rad etdi." };
    });
    if (aborted) return;
    await step("run_command", { command: "npm test" }, async () => {
      // Haqiqiy classifyCommand'dagi kabi: npm faqat-o'qish ro'yxatida yo'q → risky; main riskReason qo'shadi.
      const ok = await confirm({ tool: "run_command", command: "npm test", risky: true, riskReason: "Faqat-o'qish ro'yxatida yo'q: npm" }, "⚠️  FAQAT-O'QISH RO'YXATIDA YO'Q: NPM — bajarilsinmi: npm test?");
      if (!ok) return { status: "declined", result: "Foydalanuvchi rad etdi." };
      await sleep(700);
      const output = "EXIT 0\n> demo-shop@1.0.0 test\n> node --test\n\n✔ health endpoint (12ms)\nℹ tests 1  pass 1  fail 0";
      emit({ type: "terminal", command: "npm test", output, status: "ok" });
      return { status: "ok", result: output, exit: "0" };
    });
    if (aborted) return;
    await sleep(500);
    emit({ type: "text", text: "Tayyor: `/health` endpoint qo‘shildi va testlar o‘tdi." });
    emit({ type: "ledger", entries, warning: entries.some((e) => e.status === "declined") ? "Javobda tilga olingan, lekin aslida yozilmagan: src/server.js." : null, noteCode: null });
    emit({ type: "done" });
    finish("done");
  }
  function finish(status) {
    task = { ...task, status, updatedAt: Date.now() };
    const i = history.findIndex((h) => h.id === task.id);
    if (i >= 0) history.splice(i, 1);
    history.unshift({ ...task });
    emit({ type: "task", task: { ...task } });
  }

  const tree = [
    { name: "src", path: "D:\\Projects\\demo-shop\\src", dir: true, children: [
      { name: "components", path: "D:\\Projects\\demo-shop\\src\\components", dir: true, children: [{ name: "Hero.jsx", path: "D:\\Projects\\demo-shop\\src\\components\\Hero.jsx", dir: false }] },
      { name: "server.js", path: "D:\\Projects\\demo-shop\\src\\server.js", dir: false },
    ] },
    { name: "package.json", path: "D:\\Projects\\demo-shop\\package.json", dir: false },
    { name: "README.md", path: "D:\\Projects\\demo-shop\\README.md", dir: false },
  ];

  window.sovereign = {
    init: async () => { await sleep(250); return state(); },
    state: async () => state(),
    pickFolder: async () => { cwd = "D:\\Projects\\api-server"; task = null; return { cwd, recent: state().recent }; },
    openRecent: async (p) => { cwd = p; task = null; return { cwd, recent: state().recent }; },
    revealWorkspace: async () => ({ ok: true }),
    openLink: async (key) => { window.__mockOpenedLink = key; return { ok: true }; },
    newTask: async () => { task = null; aborted = true; return { ok: true, history: [...history] }; },
    stop: async () => { aborted = true; for (const r of pending.values()) r(false); pending.clear(); emit({ type: "stopped" }); if (task) finish("stopped"); return { ok: true }; },
    fsTree: async () => ({ cwd, nodes: cwd ? tree : [] }),
    fsRead: async (p) => ({ content: `// ${p}\nexport default function Demo() {\n  return null;\n}\n` }),
    fsRestore: async () => ({ ok: true }),
    // Xavfsizlik tekshiruvi — namunaviy natija (haqiqiy skaner main'da; ?cleanaudit=1 — toza).
    audit: async () => {
      await sleep(500);
      if (!cwd) return { error: "no-folder" };
      const L = (uz, ru, en) => ({ uz, "uz-cyrl": uz, ru, en });
      const findings = qs.has("cleanaudit") ? [] : [
        { severity: "critical", rule: "supabase.no-rls", file: "supabase/migrations/001_init.sql", line: 3, message: L("«orders» jadvalida RLS yoqilmagan.", "В таблице «orders» не включён RLS.", "Table “orders” has no RLS."), fix: L("alter table orders enable row level security;", "alter table orders enable row level security;", "alter table orders enable row level security;") },
        { severity: "high", rule: "client.server-env", file: "src/app/admin/page.tsx", line: 7, message: L("\"use client\" komponent server env o'qiydi.", "Клиентский компонент читает серверный env.", "A \"use client\" component reads a server env."), fix: L("Server route'ga ko'chiring.", "Перенесите на сервер.", "Move it to a server route.") },
        { severity: "medium", rule: "xss.inner-html", file: "src/components/Bio.tsx", line: 12, message: L("dangerouslySetInnerHTML", "dangerouslySetInnerHTML", "dangerouslySetInnerHTML"), fix: L("DOMPurify.sanitize()", "DOMPurify.sanitize()", "DOMPurify.sanitize()") },
      ];
      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const f of findings) counts[f.severity]++;
      const prompt = `Security audit (mock): ${findings.length} findings\n` + findings.map((f) => `- [${f.severity}] ${f.file}:${f.line}`).join("\n");
      return { findings, counts, ok: !counts.critical && !counts.high, scanned: 42, durationMs: 180, truncated: false, prompts: { uz: prompt, "uz-cyrl": prompt, ru: prompt, en: prompt } };
    },
    setModel: async (id, label) => { model = id ? label || id : "Auto"; return { ok: true, model }; },
    models: async (q) => {
      await sleep(300);
      if (q.includes("families")) return { families: [{ key: "claude", label: "Claude", count: 12 }, { key: "gemini", label: "Gemini", count: 9 }, { key: "deepseek", label: "DeepSeek", count: 5 }], featured: [{ id: "free/llama-3.3-70b", label: "Llama 3.3 70B" }, { id: "free/qwen3-coder", label: "Qwen3 Coder" }] };
      return { models: [{ id: "dva/claude-opus-5-high", owner: "anthropic", context: 200000, tools: true, reasoning: true }, { id: "dva/claude-sonnet-5", owner: "anthropic", context: 200000, tools: true }] };
    },
    send: (text, mode) => { runTurn(text, mode); },
    retry: () => {},
    remember: () => {},
    confirmReply: (id, ok) => { const r = pending.get(id); if (r) { pending.delete(id); r(!!ok); } },
    settings: { set: async (p) => { Object.assign(settings, p); return { ...settings }; } },
    auth: {
      login: async () => { emit({ type: "auth", state: "waiting", code: "QX7-4KD" }); await sleep(2500); authed = true; emit({ type: "auth", state: "approved", email: "islombek@example.com" }); return { ok: true, ...state() }; },
      cancel: async () => ({ ok: true }),
      logout: async () => { authed = false; return state(); },
    },
    history: {
      list: async () => [...history],
      open: async (id) => {
        const h = history.find((x) => x.id === id);
        task = { ...h };
        return { task: h, cwd: h.cwd, recent: state().recent, events: [
          { type: "user", text: h.title, mode: h.mode },
          { type: "text", text: "Bu tarixdan tiklangan suhbat." },
          { type: "tool", callId: "a", name: "write_file", args: { path: "src/components/Hero.jsx", contentLength: 880 } },
          { type: "tool-done", callId: "a", name: "write_file", status: "ok", result: "OK: src/components/Hero.jsx yozildi." },
          { type: "tool", callId: "b", name: "run_command", args: { command: "npm run lint" } },
          { type: "tool-done", callId: "b", name: "run_command", status: "failed", result: "XATO (exit 1):\n  12:5  error  'x' is defined but never used" },
          { type: "ledger", entries: [{ tool: "write_file", target: "src/components/Hero.jsx", status: "ok" }, { tool: "run_command", target: "npm run lint", status: "failed", exit: "1" }], warning: null, noteCode: null },
        ] };
      },
      remove: async (id) => { const i = history.findIndex((h) => h.id === id); if (i >= 0) history.splice(i, 1); return [...history]; },
      clear: async () => { history.length = 0; return []; },
    },
    updates: {
      check: async () => (update.state === "idle" ? setUpdate({ state: "no-release" }) : update),
      download: async () => mockDownload(),
      install: async () => { window.__mockInstalled = (window.__mockInstalled ?? 0) + 1; return { ok: true }; },
    },
    onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
}
