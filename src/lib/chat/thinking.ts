/**
 * "O'ylab javob" (thinking / reasoning) — server va mijoz uchun umumiy SOF mantiq.
 *
 * Bitta haqiqat manbai: kim o'ylay oladi (tarif), mijozdan kelgan bayroq nimaga aylanadi
 * (marshrut afzalligi), reasoning bo'lagi mijozga uzatiladimi va o'ylash davomiyligi
 * qanday hisoblanadi. Tarmoq, React, env yo'q — shuning uchun test qilish oson.
 *
 * Test: npx tsx --conditions=react-server src/lib/chat/thinking.test.ts
 */
import type { Plan } from "@/config/plans";

/** Tarif "o'ylab javob" rejimiga ruxsat beradimi (Free — yo'q). */
export function planAllowsThinking(plan: Pick<Plan, "limits">): boolean {
  return plan.limits.thinking === true;
}

/**
 * Marshrut afzalligi (mesh RouteRequest.needs.thinking):
 *   true      — fikrlaydigan modelga ustunlik (foydalanuvchi chipni yoqqan, tarif ruxsat bergan);
 *   false     — tez (flash) modelga ustunlik (Free tarifi: o'ylash umuman yo'q);
 *   undefined — afzallik yo'q (pullik tarif, chip o'chiq).
 *
 * Bu QAT'IY filtr emas: mos model bo'lmasa ham so'rov bajariladi (yumshoq zaxira).
 */
export type ThinkingPreference = boolean | undefined;

export interface ThinkingDecision {
  /** Shu so'rovda o'ylash rejimi haqiqatda yoqilganmi (mijoz so'radi VA tarif ruxsat berdi). */
  enabled: boolean;
  /** Tarif umuman reasoning ko'rsatishga ruxsat beradimi (Free — yo'q, hatto so'ralmagan bo'lsa ham). */
  allowed: boolean;
  /** RouteRequest.needs.thinking uchun qiymat. */
  preference: ThinkingPreference;
}

/**
 * Mijozdan kelgan `thinking` bayrog'i — SO'ROV, ruxsat emas: server har doim haqiqiy tarifni
 * qayta tekshiradi. Free'da bayroq e'tiborsiz qoldiriladi (so'rov rad etilmaydi) va marshrut
 * ataylab tez modelga suriladi.
 */
export function resolveThinking(requested: boolean, plan: Pick<Plan, "limits">): ThinkingDecision {
  const allowed = planAllowsThinking(plan);
  if (!allowed) return { enabled: false, allowed: false, preference: false };
  return { enabled: requested === true, allowed: true, preference: requested === true ? true : undefined };
}

/**
 * Provayder yuborgan reasoning bo'lagi mijozga uzatiladimi. Free'da — HECH QACHON
 * (model o'zicha yuborgan bo'lsa ham): ko'rsatilmaydi va saqlanmaydi.
 */
export function forwardReasoning(decision: Pick<ThinkingDecision, "allowed">): boolean {
  return decision.allowed === true;
}

/**
 * O'ylash davomiyligi (soniya) — panel sarlavhasi uchun. Har doim butun son va kamida 1:
 * "0 soniya o'yladi" deb yozmaymiz. Yaroqsiz/salbiy qiymat — 0 (sarlavha ko'rsatilmaydi).
 */
export function thinkingSeconds(ms: number | undefined | null): number {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 1000));
}

/* ------------------------------------------------------------------ */
/* Mijoz tomonidagi yig'uvchi                                          */
/* ------------------------------------------------------------------ */

/** Bitta javob xabari uchun reasoning holati (use-send-message shuni yuritadi). */
export interface ThinkingAccumulator {
  /** Yig'ilgan fikr matni (oddiy matn — HTML/markdown sifatida ko'rsatilmaydi). */
  reasoning: string;
  /** Birinchi reasoning bo'lagi kelgan vaqt (epoch ms) yoki null. */
  startedAt: number | null;
  /** Yakuniy davomiylik (ms) — javob tugagach yoziladi. */
  durationMs?: number;
}

export function emptyThinking(): ThinkingAccumulator {
  return { reasoning: "", startedAt: null };
}

/**
 * Yangi reasoning bo'lagi. Birinchi bo'lak vaqtni boshlaydi; har bo'lakda davomiylik
 * yangilanadi, shuning oqim davomida ham "N soniya" jonli o'sib boradi.
 */
export function pushReasoning(acc: ThinkingAccumulator, text: string, now: number): ThinkingAccumulator {
  if (!text) return acc;
  const startedAt = acc.startedAt ?? now;
  return { reasoning: acc.reasoning + text, startedAt, durationMs: Math.max(0, now - startedAt) };
}

/**
 * Yakuniy davomiylik: birinchi va OXIRGI fikr bo'lagi orasidagi vaqt — javob yozilgan vaqt
 * bunga kirmaydi ("N soniya o'yladi" faqat o'ylashni bildiradi). Reasoning kelmagan bo'lsa
 * — o'zgarishsiz (panel umuman ko'rsatilmaydi).
 */
export function finishThinking(acc: ThinkingAccumulator): ThinkingAccumulator {
  if (acc.startedAt === null) return acc;
  return { ...acc, durationMs: acc.durationMs ?? 0 };
}
