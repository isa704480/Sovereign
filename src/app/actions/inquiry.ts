"use server";

/**
 * Chuqur so'rash — mijoz server action'lari (docs/INQUIRY.md §A.7, §A.10, §C T6).
 *
 * - `rememberInquiryFacts(facts, domain)` — faqat foydalanuvchi kartadagi "Bu faktlarni eslab qol"
 *   checkbox'ini belgilaganda chaqiriladi (rozilik). Xotira profilda o'chiq bo'lsa hech narsa yozilmaydi.
 *   PII filtri (email, telefon, karta, IBAN, pasport, JShShIR, API kalit, parol...) — shunday fakt butunlay
 *   tashlanadi. LLM chaqirilmaydi: fakt to'g'ridan-to'g'ri `memory_nodes` ga (source "inquiry") yoziladi.
 * - `logInquiryOutcome(id, outcome)` — karta taqdiri (answered / skipped / ignored / followup_clicked);
 *   faqat bir marta, rate-limited, user_id yozilmaydi.
 *
 * Qaytadigan `error` — mashina kodi (UI o'zi tarjima qiladi), foydalanuvchi matni emas.
 */
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/rate-limit";
import { getMemories } from "@/lib/ai/memory";
import { isNearDuplicate } from "@/lib/ai/memory-prompt";
import { cleanText } from "@/lib/ai/inquiry/sanitize";
import { normalizeSlot } from "@/lib/ai/inquiry/known-facts";
import { containsPii } from "@/lib/ai/inquiry/pii";
import { INQUIRY_DOMAINS, type InquiryDomain, type InquiryOutcome } from "@/lib/ai/inquiry/types";
import { INQUIRY_OUTCOMES, setInquiryOutcome } from "@/lib/ai/inquiry/telemetry";

const MAX_FACTS = 6;
const REMEMBER_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const OUTCOME_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };

/** Bitta fakt: slot id + javob; `label` — kartadagi savolning qisqa nomi (foydalanuvchi tilida, ixtiyoriy). */
export interface InquiryFactInput {
  slot: string;
  value: string;
  label?: string;
}

export interface RememberInquiryResult {
  ok: boolean;
  /** xotiraga yangi qo'shilgan faktlar */
  added: number;
  /** PII / bo'sh / takror sababli tashlanganlar */
  dropped: number;
  error?: "invalid" | "auth" | "disabled" | "rate_limited" | "failed";
}

const factSchema = z.object({
  slot: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(400),
  label: z.string().trim().max(120).optional(),
});
const rememberSchema = z.object({
  facts: z.array(factSchema).min(1).max(MAX_FACTS),
  domain: z.enum(INQUIRY_DOMAINS),
});
const outcomeSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(INQUIRY_OUTCOMES),
});

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** "Mamlakat: O'zbekiston" — label bo'lmasa slot id'si ("jurisdiction: O'zbekiston"). */
function factContent(f: InquiryFactInput): string | null {
  const value = cleanText(f.value, 240);
  if (!value) return null;
  const label = cleanText(f.label ?? "", 60) || normalizeSlot(f.slot) || "";
  const content = label ? `${label}: ${value}` : value;
  return content.length > 3 ? content.slice(0, 300) : null;
}

/**
 * Kartadagi javoblarni (foydalanuvchi roziligi bilan) uzoq muddatli xotiraga yozadi.
 * `domain` — sezgir soha (legal/medical/financial) uchun ogohlantirishni mijoz ko'rsatadi; server
 * faqat tekshiradi va faktlarni `fact` turida saqlaydi.
 */
export async function rememberInquiryFacts(facts: InquiryFactInput[], domain: InquiryDomain): Promise<RememberInquiryResult> {
  const parsed = rememberSchema.safeParse({ facts, domain });
  if (!parsed.success) return { ok: false, added: 0, dropped: 0, error: "invalid" };

  const s = await session();
  if (!s) return { ok: false, added: 0, dropped: 0, error: "auth" };

  const rl = await rateLimit(`inquiry:remember:${s.user.id}`, REMEMBER_LIMIT.limit, REMEMBER_LIMIT.windowMs);
  if (!rl.ok) return { ok: false, added: 0, dropped: 0, error: "rate_limited" };

  // Xotira o'chiq bo'lsa — rozilik checkbox'i bo'lsa ham yozilmaydi (profil sozlamasi ustun).
  const { data: profile, error: profileErr } = await s.supabase
    .from("profiles")
    .select("memory_enabled")
    .eq("id", s.user.id)
    .maybeSingle();
  if (profileErr) return { ok: false, added: 0, dropped: 0, error: "failed" };
  if ((profile as { memory_enabled?: boolean } | null)?.memory_enabled === false) {
    return { ok: false, added: 0, dropped: 0, error: "disabled" };
  }

  const existing = await getMemories(s.supabase, s.user.id, 60);
  const kept: string[] = existing.map((m) => m.content);
  const rows: { user_id: string; content: string; kind: "fact"; source: "inquiry" }[] = [];
  let dropped = 0;
  for (const f of parsed.data.facts) {
    // PII tekshiruvi tozalashdan OLDIN (cleanText URL/domenlarni olib tashlaydi — email yarim qolardi)
    // va KEYIN ham (ko'rinmas belgilar bilan bo'lingan raqamlar).
    if (containsPii(`${f.label ?? ""} ${f.value}`)) {
      dropped++;
      continue;
    }
    const content = factContent(f);
    if (!content || containsPii(content) || kept.some((k) => isNearDuplicate(k, content))) {
      dropped++;
      continue;
    }
    kept.push(content);
    rows.push({ user_id: s.user.id, content, kind: "fact", source: "inquiry" });
  }

  if (!rows.length) return { ok: true, added: 0, dropped };
  const { error } = await s.supabase.from("memory_nodes").insert(rows);
  if (error) return { ok: false, added: 0, dropped, error: "failed" };
  return { ok: true, added: rows.length, dropped };
}

/**
 * Karta natijasini telemetriyaga yozadi. Faqat kirgan foydalanuvchi, rate-limited; har `inquiryId`
 * uchun bir marta (keyingi chaqiruvlar `ok: false`). Fail-silent — UI natijani kutmasa ham bo'ladi.
 */
export async function logInquiryOutcome(id: string, outcome: InquiryOutcome): Promise<{ ok: boolean }> {
  const parsed = outcomeSchema.safeParse({ id, outcome });
  if (!parsed.success) return { ok: false };
  const s = await session();
  if (!s) return { ok: false };
  const rl = await rateLimit(`inquiry:outcome:${s.user.id}`, OUTCOME_LIMIT.limit, OUTCOME_LIMIT.windowMs);
  if (!rl.ok) return { ok: false };
  const ok = await setInquiryOutcome(parsed.data.id, parsed.data.outcome);
  return { ok };
}
