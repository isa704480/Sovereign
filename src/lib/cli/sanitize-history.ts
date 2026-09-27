/**
 * /api/cli/chat — mijoz (CLI / Cowork) yuborgan suhbat tarixini provayder qabul qiladigan
 * shaklga keltiradi. Zaif modellar (mas. qwen2.5-coder) `id`siz yoki argumentlari obyekt bo'lgan
 * vosita chaqiruvlari, bo'sh assistant xabarlari qaytaradi; tarixga tushgach ikki xil provayder
 * ham 400 beradi va suhbat "Noto'g'ri so'rov" bilan qotib qoladi. Sof funksiya — testlangan.
 */
type Msg = {
  role: "user" | "assistant" | "system" | "tool";
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: unknown[];
  name?: string;
};

type Call = { id: string; type: "function"; function: { name: string; arguments: string } };

const NO_RESULT = "[Natija yo'q: bu vosita chaqiruvi bajarilmagan yoki natijasi tarixda saqlanmagan.]";

function isEmptyContent(c: unknown): boolean {
  if (c == null) return true;
  if (typeof c === "string") return c.trim() === "";
  if (Array.isArray(c)) return c.length === 0;
  return false;
}

function normalizeCall(raw: unknown, fallbackId: string): { call: Call; orig: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
  const name = typeof r.function?.name === "string" ? r.function.name.trim() : "";
  if (!name || name.length > 80) return null;
  const a = r.function?.arguments;
  const args = typeof a === "string" ? a : a == null ? "{}" : JSON.stringify(a);
  const orig = typeof r.id === "string" ? r.id : "";
  const id = orig && orig.length <= 200 ? orig : fallbackId;
  return { call: { id, type: "function", function: { name, arguments: args } }, orig };
}

export function sanitizeHistory<T extends Msg>(messages: readonly T[]): T[] {
  const out: T[] = [];
  let pending: { id: string; orig: string }[] = [];
  const flush = () => {
    for (const p of pending) out.push({ role: "tool", tool_call_id: p.id, content: NO_RESULT } as T);
    pending = [];
  };
  messages.forEach((m, i) => {
    if (m.role === "tool") {
      if (!pending.length) return; // egasiz tool natijasi — provayder rad etadi; tashlanadi
      const want = typeof m.tool_call_id === "string" ? m.tool_call_id : "";
      let idx = want ? pending.findIndex((p) => p.orig === want || p.id === want) : -1;
      if (idx === -1) idx = 0; // id yo'q / mos emas — tartib bo'yicha
      const [p] = pending.splice(idx, 1);
      out.push({ ...m, tool_call_id: p.id, content: m.content ?? "" });
      return;
    }
    flush();
    if (m.role === "assistant") {
      const calls = Array.isArray(m.tool_calls)
        ? m.tool_calls
            .map((c, j) => normalizeCall(c, `call_${i}_${j}`))
            .filter((x): x is { call: Call; orig: string } => !!x)
        : [];
      // Bir xabar ichida takrorlangan id'lar ham provayderni buzadi.
      const seen = new Set<string>();
      for (const [j, c] of calls.entries()) {
        if (seen.has(c.call.id)) c.call.id = `call_${i}_${j}_d`;
        seen.add(c.call.id);
      }
      if (!calls.length) {
        if (isEmptyContent(m.content)) return; // bo'sh assistant xabari — tashlanadi
        const rest = { ...m };
        delete rest.tool_calls;
        out.push(rest);
        return;
      }
      out.push({ ...m, content: isEmptyContent(m.content) ? null : m.content, tool_calls: calls.map((c) => c.call) });
      pending = calls.map((c) => ({ id: c.call.id, orig: c.orig }));
      return;
    }
    out.push(m);
  });
  flush();
  return out;
}

const TRIMMED = "\n…[qisqartirildi: model konteksti sig'ishi uchun]";

/**
 * Model konteksti to'lganda (provayder context_length / 413) tarixni qisqartiradi: barcha system
 * xabarlari va birinchi foydalanuvchi xabari (asl vazifa) saqlanadi, o'rtadagi eski qadamlar
 * olib tashlanadi, qolgan tool natijalari `toolMax` belgigacha kesiladi. Juftliklar sanitizeHistory
 * bilan qayta tekshiriladi (egasiz tool xabari qolmaydi).
 */
export function compactHistory<T extends Msg>(messages: readonly T[], keepRatio: number, toolMax: number): T[] {
  const sys = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const firstUser = rest.find((m) => m.role === "user");
  const keepN = Math.max(4, Math.ceil(rest.length * keepRatio));
  let tail = rest.slice(-keepN);
  while (tail.length && tail[0].role === "tool") tail = tail.slice(1);
  const dropped = rest.length - tail.length - (firstUser && !tail.includes(firstUser) ? 1 : 0);
  const cut = (m: T): T =>
    m.role === "tool" && typeof m.content === "string" && m.content.length > toolMax
      ? { ...m, content: m.content.slice(0, toolMax) + TRIMMED }
      : m;
  const out: T[] = [...sys];
  if (firstUser && !tail.includes(firstUser)) out.push(firstUser);
  if (dropped > 0) {
    out.push({
      role: "system",
      content: `[${dropped} ta oldingi xabar model konteksti sig'ishi uchun olib tashlandi. Asl vazifa — birinchi foydalanuvchi xabari; oxirgi qadamlardan davom et.]`,
    } as T);
  }
  out.push(...tail.map(cut));
  return sanitizeHistory(out);
}
