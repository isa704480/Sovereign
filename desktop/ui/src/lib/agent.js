// Agent hodisalari → UI holati (reducer). Jonli hodisalar va tarixdan qayta
// tiklash (replay) bir xil yo'l bilan o'tadi.

import { knownSkillIds } from "./skills.js";

let seq = 0;
const nid = () => `i${++seq}`;

// local — joriy navbatdagi mahalliy model ("local" hodisasi) yoki null; localProgress — mahalliy model
// yozgan belgilar soni (taraqqiyot); awaiting — foydalanuvchi javobini kutayotgan karta: "inquiry" | "local-offer" | null.
export const initialAgent = { items: [], busy: false, term: [], changes: [], confirm: null, startedAt: 0, local: null, localProgress: 0, awaiting: null };

// ---- Chuqur so'rash / mahalliy model hodisalari: himoyaning renderer qatlami --------------
// Main jarayon ham tozalaydi; bu yerda — oddiy matn, uzunlik va enum'lar yana bir bor (karta
// hech qachon HTML/Markdown ko'rsatmaydi).
const INQ_DOMAINS = new Set(["legal", "medical", "financial", "code", "business", "personal", "education", "creative", "general"]);
const INQ_STAKES = new Set(["low", "medium", "high"]);
const INQ_PROFESSIONALS = new Set(["lawyer", "doctor", "financial_advisor"]);
const OFFER_KINDS = new Set(["user_limit", "rate_limited", "offline", "server"]);
const LOCAL_ERR_KINDS = new Set(["unreachable", "not-found", "failed"]);
// Boshqaruv, nol-kenglik va bidi belgilari (U+202A–202E, U+2066–2069) — bitta bo'shliqqa.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Model yozgan matn → bir qatorli oddiy matn (≤ max). */
export function plainText(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const PROJECT_STATUSES = new Set(["ok", "failed", "declined", "stale", "notRun"]);
const count = (v) => Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));

/** SOVEREIGN.md tekshiruv buyruqlari (main: projectCheckStatus) — faqat ma'lum holatlar, matn qisqartiriladi. */
export function projectRows(list) {
  if (!Array.isArray(list)) return null;
  const rows = list
    .slice(0, 8)
    .map((r) => ({ label: plainText(r?.label, 40), command: plainText(r?.command, 200), status: PROJECT_STATUSES.has(r?.status) ? r.status : "notRun" }))
    .filter((r) => r.command);
  return rows.length ? rows : null;
}

/** projectClaimIssue: {code: "projectUnrun", commands: [...]} yoki null. */
function projectWarn(w) {
  if (!w || w.code !== "projectUnrun" || !Array.isArray(w.commands)) return null;
  const commands = w.commands.map((c) => plainText(c, 200)).filter(Boolean).slice(0, 8);
  return commands.length ? { commands } : null;
}

/** Model yozgan savol matni (R1): markdown belgilari va "://" li bo'laklar (havolalar) ham olib tashlanadi. */
export function questionText(v, max) {
  if (typeof v !== "string") return "";
  let s = v;
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/[*`|~]+|_{2,}/g, "").replace(/\S*:\/\/\S*/g, " ");
    if (next === s) break;
    s = next;
  }
  return plainText(s.replace(/:\/\//g, " "), max);
}

/** "inquiry" / "needs-input" hodisasidagi savollar → xavfsiz ro'yxat (id: q1.., ≤max, variantlar ≤6). */
export function normalizeQuestions(list, max = 5) {
  const out = [];
  for (const q of Array.isArray(list) ? list.slice(0, max) : []) {
    const text = questionText(typeof q === "string" ? q : q?.text, 200);
    if (!text) continue;
    const options = [...new Set((Array.isArray(q?.options) ? q.options.slice(0, 6) : []).map((o) => questionText(o, 60)).filter(Boolean))];
    const kind = options.length ? (q?.kind === "multi" ? "multi" : "single") : "text";
    // Javob main'ga savol id'si bilan qaytadi — main bergan id (q1..q9) saqlanadi.
    const id = typeof q?.id === "string" && /^q[1-9]$/.test(q.id) && !out.some((x) => x.id === q.id) ? q.id : `q${out.length + 1}`;
    out.push({ id, slot: plainText(q?.slot, 40) || "other", text, why: questionText(q?.why, 160), kind, options, critical: q?.critical === true });
  }
  return out;
}

/** Hodisa → "inquiry" elementi. needs-input — Full auto'da bloklovchi yagona savol (ask kabi ko'rsatiladi). */
function inquiryItem(ev, replay) {
  const needsInput = ev.type === "needs-input";
  const phase = !needsInput && ev.phase === "followup" ? "followup" : "ask";
  const qs = needsInput && !Array.isArray(ev.questions) && ev.question ? [ev.question] : ev.questions;
  const inquiryId = plainText(ev.inquiryId ?? ev.id, 64);
  return {
    id: nid(),
    kind: "inquiry",
    inquiryId,
    phase,
    round: Number.isInteger(ev.round) ? ev.round : 1,
    domain: INQ_DOMAINS.has(ev.domain) ? ev.domain : "general",
    stakes: INQ_STAKES.has(ev.stakes) ? ev.stakes : "low",
    goal: questionText(ev.goal, 160),
    // Savol id'lari main'dagi nusxa bilan bir xil tartibda (q1..): main ham bo'sh savollarni tashlab raqamlaydi.
    questions: normalizeQuestions(qs, phase === "followup" ? 3 : 5),
    assumptions: (Array.isArray(ev.assumptions) ? ev.assumptions.slice(0, 6) : []).map((a) => questionText(a, 160)).filter(Boolean),
    blocking: needsInput || ev.blocking === true,
    professional: INQ_PROFESSIONALS.has(ev.professional) ? ev.professional : null,
    // ask: open → answered | skipped | closed (to'xtatildi / tarixdan tiklangan — javob kutilmaydi).
    state: "open",
    live: !replay && !!inquiryId,
  };
}

/** "local-offer" → karta elementi (id null — tanlov yo'q: Ollama o'rnatilmagan yoki modeli yo'q). */
function offerItem(ev) {
  const models = (Array.isArray(ev.models) ? ev.models.slice(0, 40) : [])
    .map((m) => ({
      name: plainText(m?.name, 100),
      size: Number.isFinite(m?.size) && m.size > 0 ? m.size : 0,
      paramSize: plainText(m?.paramSize, 20),
      quant: plainText(m?.quant, 20),
      tools: m?.tools === true,
      vision: m?.vision === true,
    }))
    .filter((m) => m.name);
  const recommend = (Array.isArray(ev.recommend) ? ev.recommend.slice(0, 6) : [])
    .map((r) => ({ name: plainText(r?.name, 100), tier: [1, 2, 3, 4].includes(r?.tier) ? r.tier : 1, sizeGb: plainText(String(r?.sizeGb ?? ""), 12) }))
    .filter((r) => r.name);
  const offerId = typeof ev.id === "string" && ev.id ? plainText(ev.id, 64) : null;
  const suggested = plainText(ev.suggested, 100);
  return {
    id: nid(),
    kind: "local-offer",
    offerId,
    reason: OFFER_KINDS.has(ev.kind) ? ev.kind : "offline",
    available: ev.available === true,
    models,
    suggested: models.some((m) => m.name === suggested) ? suggested : (models[0]?.name ?? ""),
    recommend,
    ramGb: Number.isFinite(ev.ramGb) && ev.ramGb > 0 ? Math.round(ev.ramGb) : 0,
    fullAuto: ev.fullAuto === true,
    // open → accepted | closed; id yo'q — "info" (faqat o'rnatish ko'rsatmasi, javob kutilmaydi).
    state: offerId ? "open" : "info",
  };
}

/** "local" hodisasi → holat (badge uchun) va suhbatdagi "Mahalliy model · <nom>" belgisi. */
function localOf(ev) {
  if (ev.active === false || typeof ev.model !== "string" || !ev.model) return null;
  return {
    model: plainText(ev.model, 100),
    tools: ev.tools === true,
    vision: ev.vision === true,
    reason: ev.reason === "fallback" ? "fallback" : "manual",
    offerKind: OFFER_KINDS.has(ev.kind) ? ev.kind : null,
    toolsOff: ev.toolsOff === true,
    fullAutoPaused: ev.fullAutoPaused === true,
  };
}

/** Javob kutayotgan kartalarni yopadi (navbat tugadi / to'xtatildi / xato / mahalliyga o'tildi). */
function closeOpen(items, offerState = "closed") {
  let changed = false;
  const out = items.map((it) => {
    const open = (it.kind === "inquiry" && it.phase === "ask" && it.state === "open") || (it.kind === "local-offer" && it.state === "open");
    if (!open) return it;
    changed = true;
    return { ...it, state: it.kind === "local-offer" ? offerState : "closed", live: false };
  });
  return changed ? out : items;
}

// Biriktirma ko'rinishi (thumb) — faqat kichik png/jpeg/webp data URL (main ham tekshiradi; tarixdan ham keladi).
const THUMB_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const THUMB_MAX = 48_000;

/** "user" hodisasidagi biriktirmalar meta'si → xavfsiz ro'yxat (≤10; nom — oddiy matn). */
export function sanitizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list.slice(0, 10)) {
    if (!a || typeof a !== "object") continue;
    const kind = a.kind === "image" ? "image" : "file";
    const item = { kind, name: plainText(a.name, 120) || (kind === "image" ? "image" : "file"), size: Number.isFinite(a.size) && a.size > 0 ? Math.round(a.size) : 0 };
    if (kind === "file") {
      item.sub = a.sub === "pdf" ? "pdf" : "text";
      if (a.truncated === true) item.truncated = true;
    } else if (typeof a.thumb === "string" && a.thumb.length <= THUMB_MAX && THUMB_RE.test(a.thumb)) {
      item.thumb = a.thumb;
    }
    out.push(item);
  }
  return out;
}

const NOTICE_CODES = new Set(["localNoVision"]);

function lastIndex(list, pred) {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) return i;
  return -1;
}

/** Bitta hodisani holatga qo'llaydi. replay=true — tasdiq so'rovlari e'tiborsiz. */
export function applyEvent(s, ev, { replay = false } = {}) {
  switch (ev.type) {
    case "user":
      // inquiry: true — savol kartasiga javoblar ("Aniqlashtirish:" bloki); navbat davom etadi.
      if (ev.inquiry === true) return { ...s, awaiting: null, items: [...s.items, { id: nid(), kind: "user", text: ev.text, mode: ev.mode, inquiry: true }] };
    {
      // attachments — nom/hajm/kichik ko'rinish (to'liq rasm yoki fayl tarkibi hech qachon kelmaydi).
      const attachments = sanitizeAttachments(ev.attachments);
      const item = { id: nid(), kind: "user", text: typeof ev.text === "string" ? ev.text : "", mode: ev.mode, ...(attachments.length ? { attachments } : {}) };
      return { ...s, busy: !replay, startedAt: Date.now(), localProgress: 0, items: [...s.items, item] };
    }
    case "notice":
      // Kichik ochiq ogohlantirish (mas. mahalliy model rasmlarni ko'rmaydi — yuborilmadi).
      if (!NOTICE_CODES.has(ev.code)) return s;
      return { ...s, items: [...s.items, { id: nid(), kind: "notice", code: ev.code, model: plainText(ev.model, 100), n: Number.isInteger(ev.n) && ev.n > 0 ? Math.min(ev.n, 99) : 1 }] };
    case "text": {
      const last = s.items[s.items.length - 1];
      if (last?.kind === "assistant") {
        const items = s.items.slice(0, -1).concat({ ...last, text: `${last.text}\n\n${ev.text}` });
        return { ...s, items };
      }
      return { ...s, localProgress: 0, items: [...s.items, { id: nid(), kind: "assistant", text: ev.text }] };
    }
    case "skills": {
      // Shu navbatda server qo'llagan SOVEREIGN Skills — javob ostidagi chip'lar (faqat ma'lum id'lar).
      const ids = knownSkillIds(ev.skills);
      return ids.length ? { ...s, items: [...s.items, { id: nid(), kind: "skills", ids }] } : s;
    }
    case "tool":
      return { ...s, items: [...s.items, { id: nid(), kind: "tool", callId: ev.callId, name: ev.name, args: ev.args ?? {}, status: "running" }] };
    case "tool-done": {
      let i = lastIndex(s.items, (it) => it.kind === "tool" && it.status === "running" && (ev.callId ? it.callId === ev.callId : it.name === ev.name));
      if (i === -1) i = lastIndex(s.items, (it) => it.kind === "tool" && it.status === "running" && it.name === ev.name);
      if (i === -1) return s;
      const items = s.items.slice();
      items[i] = { ...items[i], status: ev.status || "ok", result: ev.result ?? "" };
      return { ...s, items };
    }
    case "terminal":
      return { ...s, term: [...s.term, { id: nid(), command: ev.command, output: ev.output, status: ev.status ?? "ok" }] };
    case "confirm": {
      if (replay) return s;
      const m = ev.meta ?? {};
      if (m.tool === "write_file") {
        return {
          ...s,
          confirm: {
            ...ev,
            _change: { path: m.path, before: m.before ?? "", beforeUnknown: !!m.beforeUnknown, existed: !!(m.existed ?? m.exists), backupId: m.backupId ?? null, after: m.content },
          },
        };
      }
      return { ...s, confirm: ev };
    }
    case "auto": {
      // Full auto: tasdiq oynasisiz qaror. Yozilgan fayl — o'zgarishlar ro'yxatiga (Undo);
      // rad etilgan bo'lsa — sababi ishlayotgan qadamda ko'rinadi.
      if (replay) return s;
      const m = ev.meta ?? {};
      let changes = s.changes;
      if (ev.ok && m.tool === "write_file") {
        changes = addChange(changes, { path: m.path, before: m.before ?? "", beforeUnknown: !!m.beforeUnknown, existed: !!(m.existed ?? m.exists), backupId: m.backupId ?? null, after: m.content });
      }
      const i = lastIndex(s.items, (it) => it.kind === "tool" && it.status === "running");
      if (i === -1) return { ...s, changes };
      const items = s.items.slice();
      // sandbox — buyruq qaysi darajada bajarildi (full | container | limited; cli/src/sandbox.mjs).
      const sandbox = m.tool === "run_command" && ["full", "container", "limited"].includes(m.sandboxLevel) ? m.sandboxLevel : undefined;
      items[i] = { ...items[i], auto: ev.ok ? "ok" : ev.denied || "command", ...(sandbox ? { sandbox } : {}) };
      return { ...s, changes, items };
    }
    case "snapshot": {
      // Shell Undo: fayllarni o'zgartirgan buyruq — O'zgarishlar paneliga (Undo main'dagi nusxa id'si bilan).
      if (replay || !ev.entry?.id) return s;
      const e = ev.entry;
      const ch = {
        kind: "command",
        snapId: e.id,
        command: String(e.command ?? ""),
        counts: e.counts ?? { deleted: 0, modified: 0, created: 0, lost: 0 },
        files: Array.isArray(e.files) ? e.files : [],
        moreFiles: e.moreFiles ?? 0,
        partial: !!e.partial,
      };
      return { ...s, changes: [ch, ...s.changes.filter((c) => c.snapId !== ch.snapId)] };
    }
    case "ledger":
      return {
        ...s,
        items: [
          ...s.items,
          // local — mahalliy model nomi: mustaqil tekshiruv (hakam) o'tkazilmadi.
          // project — SOVEREIGN.md tekshiruv buyruqlarining jurnal bo'yicha holati; projectWarning — "bajarildi" deb aytilgan bajarilmagan buyruqlar.
          { id: nid(), kind: "ledger", entries: ev.entries ?? [], warning: ev.warning, testWarning: ev.testWarning ?? null, noteCode: ev.noteCode, maxSteps: ev.maxSteps, loop: ev.loop ?? null, budget: ev.budget ?? null, judge: ev.judge ?? null, local: plainText(ev.local, 100) || null, project: projectRows(ev.project), projectWarning: projectWarn(ev.projectWarning) },
        ],
      };
    case "project-check":
      // Kod yozilgandan keyin SOVEREIGN.md qoidalari tekshiruvi boshlandi (qadam izohi).
      return { ...s, items: [...s.items, { id: nid(), kind: "project-check", commands: count(ev.commands), rules: count(ev.rules) }] };
    case "usage":
      // Vazifa narxi — token va model qadamlari (jurnal ostida kichik qator). local — server tokeni sarflanmadi.
      return { ...s, items: [...s.items, { id: nid(), kind: "usage", tokens: ev.tokens ?? 0, rounds: ev.rounds ?? 0, estimated: !!ev.estimated, budget: ev.budget ?? 0, local: plainText(ev.local, 100) || null }] };
    case "inquiry":
    case "needs-input": {
      // Savol kartasi (ask) yoki javobdan keyingi follow-up chip'lar. Bir xil id + phase — almashtiriladi.
      const it = inquiryItem(ev, replay);
      if (!it.questions.length) return s;
      const items = s.items.filter((x) => !(x.kind === "inquiry" && x.inquiryId && x.inquiryId === it.inquiryId && x.phase === it.phase));
      return { ...s, awaiting: it.phase === "ask" && it.live ? "inquiry" : s.awaiting, items: [...items, it] };
    }
    case "inquiry-state": {
      const state = ev.state === "answered" || ev.state === "skipped" ? ev.state : "closed";
      const items = s.items.map((it) => (it.kind === "inquiry" && it.phase === "ask" && it.inquiryId === ev.inquiryId ? { ...it, state, live: false } : it));
      return { ...s, awaiting: s.awaiting === "inquiry" ? null : s.awaiting, items };
    }
    case "local-offer": {
      // Tarixga yozilmaydi (main RECORDED'da yo'q) — tanlov kartasi faqat jonli navbatda.
      if (replay) return s;
      const it = offerItem(ev);
      return { ...s, awaiting: it.offerId ? "local-offer" : s.awaiting, items: [...s.items, it] };
    }
    case "local": {
      // Har navbatda keladi (halollik belgisi); active:false — bulutga qaytildi.
      const local = localOf(ev);
      if (!local) return { ...s, local: null };
      return { ...s, local, awaiting: s.awaiting === "local-offer" ? null : s.awaiting, items: [...closeOpen(s.items, "accepted"), { id: nid(), kind: "local", ...local }] };
    }
    case "local-progress":
      if (replay) return s;
      return { ...s, localProgress: Math.max(0, Math.min(1e8, Math.round(Number(ev.chars) || 0))) };
    case "done":
      return { ...s, busy: false, confirm: null, awaiting: null, localProgress: 0, items: closeOpen(s.items) };
    case "error": {
      // code "local" — mahalliy model xatosi (localKind: unreachable | not-found | failed).
      const err = { id: nid(), kind: "error", code: ev.code ?? "server", message: ev.message ?? "", status: ev.status ?? null };
      if (ev.code === "local") err.localKind = LOCAL_ERR_KINDS.has(ev.localKind) ? ev.localKind : "failed";
      return { ...s, busy: false, confirm: null, awaiting: null, localProgress: 0, items: [...closeOpen(s.items), err] };
    }
    case "stopped": {
      const items = closeOpen(s.items).map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "stopped" } : it));
      return { ...s, busy: false, confirm: null, awaiting: null, localProgress: 0, items: [...items, { id: nid(), kind: "stopped" }] };
    }
    default:
      return s;
  }
}

export function replayEvents(events) {
  let s = { ...initialAgent };
  for (const ev of events ?? []) s = applyEvent(s, ev, { replay: true });
  // Tarixdagi "running" qolgan qadamlar — ilova yopilganda uzilgan; javobsiz qolgan savol kartasi — yopiq.
  s.items = closeOpen(s.items).map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "stopped" } : it));
  // Mahalliy rejim sessiyaga tegishli — tarixdagi belgi hozirgi holat emas (badge app:state / local:status'dan).
  return { ...s, busy: false, awaiting: null, local: null, localProgress: 0 };
}

/** O'zgarishlar ro'yxati: bir fayl uchun ENG BIRINCHI asl holat saqlanadi (Undo shunga qaytaradi). */
export function addChange(changes, ch) {
  const ex = changes.find((c) => c.path === ch.path);
  const first = ex ?? ch;
  return [
    { path: ch.path, before: first.before, beforeUnknown: first.beforeUnknown, existed: first.existed, backupId: first.backupId ?? ch.backupId ?? null, after: ch.after },
    ...changes.filter((c) => c.path !== ch.path),
  ];
}

/** 1234 → "1.2k", 999 → "999" (CLI formatTokens bilan bir xil). */
export function formatTokens(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

/** Jurnal yozuvlaridan statistikalar. */
export function ledgerStats(entries) {
  const st = { ok: 0, failed: 0, declined: 0, skipped: 0, reads: 0 };
  for (const e of entries ?? []) {
    if (["read_file", "list_dir"].includes(e.tool) && e.status === "ok") st.reads++;
    else if (e.status in st) st[e.status]++;
  }
  return st;
}
