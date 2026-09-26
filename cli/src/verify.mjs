// Ixtiyoriy LLM "hakam": yakuniy javobdagi "bajardim" da'volarini tizim jurnaliga
// solishtiradi (server: POST /api/cli/verify, arzon model). Faqat akkaunt rejimida.
// Har qanday xato/offline/timeout — null (chaqiruvchi regex natijasida qoladi).
// Hakam faqat QO'SHIMCHA ogohlantirish beradi: regex topgan muammoni u o'chira olmaydi.

import { ledgerLines, SIDE_EFFECT_TOOLS } from "./tools.mjs";

const VERIFY_TIMEOUT_MS = 8_000;
const ANSWER_MAX = 8_000;

/** Hakamni chaqirishga arziydimi: regex shubha qildi YOKI navbatda yozish/buyruq amali bo'ldi. */
export function shouldVerify(entries, regexWarn) {
  if (regexWarn) return true;
  return (entries ?? []).some((e) => SIDE_EFFECT_TOOLS.has(e.tool) && e.status !== "skipped");
}

/** Foydalanuvchi o'chirib qo'ygan bo'lsa (SOV_VERIFY=0 yoki --no-verify). */
export function verifyDisabled() {
  const v = String(process.env.SOV_VERIFY ?? "").toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

/**
 * @returns {Promise<{ unsupported: string[], model?: string } | null>}
 */
export async function verifyClaims(config, { answer, entries, signal } = {}) {
  if (!config?.token || !config?.baseUrl || verifyDisabled()) return null;
  const text = String(answer ?? "").trim();
  if (!text) return null;
  const ledger = ledgerLines(entries)
    .slice(0, 60)
    .map((l) => ({ status: l.status, text: String(l.text).slice(0, 300) }));
  const timeout = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
  const combined = signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/cli/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ answer: text.slice(0, ANSWER_MAX), ledger }),
      signal: combined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.unsupported)) return null;
    const unsupported = data.unsupported
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, 200))
      .slice(0, 10);
    return { unsupported, model: typeof data.model === "string" ? data.model : undefined };
  } catch {
    return null;
  }
}
