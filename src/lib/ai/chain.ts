/**
 * Provayder zanjiri — PURE qoidalar (tarmoq, env yo'q). providers.ts, auto-pools.ts va chat
 * route shu yerdagi id va qoidalardan foydalanadi. Test: npx tsx src/lib/ai/chain.test.ts
 *
 * Tekin tarif (FREE) tartibi:
 *   1) Groq  — qwen3.8-27b, gpt-oss-120b (bepul: 30 RPM, 1K RPD, 200K TPD har model)
 *   2) Cloudflare Workers AI — ruxsat etilgan eng yaxshi model (kuniga 10k neuron tekin)
 *   3) OpenRouter tekin puli (OmniRoute "auto/*", Gemma/Nemotron :free)
 *   4) mavjud zaxiralar (llama-3.3-free → LLM7 va h.k.)
 * Pullik tariflar odatdagi afzallikda qoladi; OpenRouter krediti (402) yoki kvotasi tugasa
 * providers.ts shu modelning Cloudflare ekvivalentiga o'tadi va haqiqiy modelni ko'rsatadi.
 */
import { CF, cfId, cfQuotaExceeded } from "./cloudflare";

export const GROQ_QWEN = "groq/qwen/qwen3.8-27b";
export const GROQ_OSS = "groq/openai/gpt-oss-120b";

export const CF_IDS = {
  qwen: cfId(CF.qwen),
  gptOss: cfId(CF.gptOss),
  deepseekPro: cfId(CF.deepseekPro),
  deepseekFlash: cfId(CF.deepseekFlash),
  kimi: cfId(CF.kimi),
  kimiCode: cfId(CF.kimiCode),
  glm: cfId(CF.glm),
} as const;

/**
 * Tekin tarifning to'g'ridan-to'g'ri zanjiri (Groq → Cloudflare). Cloudflare'da tekin tarif
 * uchun Qwen 3.8 27B — o'z evalimizda o'lchangan eng yaxshi ochiq model (Groq'dagi bilan bir
 * xil og'irliklar). Cloudflare gpt-oss-120b (neuron bo'yicha eng arzoni, 1M chiqish ≈ 68k)
 * — oxirgi nomzodning tekin "rescue" shlyuzi (providers.ts fallbackTargets).
 */
export const FREE_DIRECT_CHAIN = [GROQ_QWEN, GROQ_OSS, CF_IDS.qwen] as const;

/**
 * Tekin foydalanuvchi o'zi tanlagan model yiqilsa: [tanlangan, Groq, Cloudflare, ...eski zaxiralar].
 * `available` — kalit bor-yo'qligi, `allowed` — mintaqa siyosati (chaqiruvchi beradi).
 */
export function freePlanCandidates(
  requested: string,
  fallbacks: string[],
  available: (id: string) => boolean,
  allowed: (id: string) => boolean = () => true,
): string[] {
  const direct = FREE_DIRECT_CHAIN.filter((id) => available(id) && allowed(id));
  return [...new Set([requested, ...direct, ...fallbacks])];
}

/**
 * Xato provayder tomonida (kredit 402, kvota/429, Cloudflare neuron limiti 4006, 5xx, kalit yoki
 * model yo'q) — boshqa provayder shu so'rovni bajara oladi. So'rovning o'zi yaroqsiz bo'lsa
 * (400/413/422 — masalan kontekst juda uzun) hamma joyda yiqiladi: zanjir aylantirilmaydi.
 * status 0 — tarmoq xatosi yoki taymaut.
 */
export function providerSideFailure(status: number, raw = ""): boolean {
  if (cfQuotaExceeded(status, raw) || /credits|can only afford|insufficient|quota/i.test(raw)) return true;
  return ![400, 413, 422].includes(status);
}
