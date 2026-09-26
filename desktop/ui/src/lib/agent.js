// Agent hodisalari → UI holati (reducer). Jonli hodisalar va tarixdan qayta
// tiklash (replay) bir xil yo'l bilan o'tadi.

let seq = 0;
const nid = () => `i${++seq}`;

export const initialAgent = { items: [], busy: false, term: [], changes: [], confirm: null, startedAt: 0 };

function lastIndex(list, pred) {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) return i;
  return -1;
}

/** Bitta hodisani holatga qo'llaydi. replay=true — tasdiq so'rovlari e'tiborsiz. */
export function applyEvent(s, ev, { replay = false } = {}) {
  switch (ev.type) {
    case "user":
      return { ...s, busy: !replay, startedAt: Date.now(), items: [...s.items, { id: nid(), kind: "user", text: ev.text, mode: ev.mode }] };
    case "text": {
      const last = s.items[s.items.length - 1];
      if (last?.kind === "assistant") {
        const items = s.items.slice(0, -1).concat({ ...last, text: `${last.text}\n\n${ev.text}` });
        return { ...s, items };
      }
      return { ...s, items: [...s.items, { id: nid(), kind: "assistant", text: ev.text }] };
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
      items[i] = { ...items[i], auto: ev.ok ? "ok" : ev.denied || "command" };
      return { ...s, changes, items };
    }
    case "ledger":
      return {
        ...s,
        items: [
          ...s.items,
          { id: nid(), kind: "ledger", entries: ev.entries ?? [], warning: ev.warning, testWarning: ev.testWarning ?? null, noteCode: ev.noteCode, maxSteps: ev.maxSteps, loop: ev.loop ?? null, budget: ev.budget ?? null },
        ],
      };
    case "usage":
      // Vazifa narxi — token va model qadamlari (jurnal ostida kichik qator).
      return { ...s, items: [...s.items, { id: nid(), kind: "usage", tokens: ev.tokens ?? 0, rounds: ev.rounds ?? 0, estimated: !!ev.estimated, budget: ev.budget ?? 0 }] };
    case "done":
      return { ...s, busy: false, confirm: null };
    case "error":
      return { ...s, busy: false, confirm: null, items: [...s.items, { id: nid(), kind: "error", code: ev.code ?? "server", message: ev.message ?? "", status: ev.status ?? null }] };
    case "stopped": {
      const items = s.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "stopped" } : it));
      return { ...s, busy: false, confirm: null, items: [...items, { id: nid(), kind: "stopped" }] };
    }
    default:
      return s;
  }
}

export function replayEvents(events) {
  let s = { ...initialAgent };
  for (const ev of events ?? []) s = applyEvent(s, ev, { replay: true });
  // Tarixdagi "running" qolgan qadamlar — ilova yopilganda uzilgan.
  s.items = s.items.map((it) => (it.kind === "tool" && it.status === "running" ? { ...it, status: "stopped" } : it));
  return { ...s, busy: false };
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
