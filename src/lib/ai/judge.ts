import "server-only";
import { MODEL_BY_ID } from "@/config/models";
import { CF, CF_PREFIX, jsonCompletionToChunk } from "./cloudflare";
import { modelAllowedIn, PROVIDER_POLICY, restrictedRegion, normalizeCountry } from "./region";
import { isOpaqueAuto, OPAQUE_AUTO_VENDORS, vendorOfId, VENDOR_LABEL, type Vendor } from "./vendor";

/**
 * Mustaqil hakam (independent judge) — SOVEREIGN'ning asosiy va'dasi:
 *   "Model yaratuvchisi o'zini tekshira olmaydi — tekshiruvimiz HAR DOIM javobni yaratgan
 *    kompaniyadan BOSHQA kompaniyaning modeli bilan bajariladi."
 *
 * Fakt-verifier (verifier.ts), amal da'volarini tasdiqlash va CLI/Cowork halollik hakami
 * (/api/cli/verify) shu yerdan o'tadi. Qoidalar:
 *  1) javob modelining kompaniyasi (vendorOf) bilan bir xil hakam HECH QACHON tanlanmaydi;
 *     javob kompaniyasi noma'lum bo'lsa ham hakam faqat ma'lum kompaniyadan olinadi;
 *  2) mintaqa siyosati (region.ts): model/host shu mamlakatda ruxsat etilmasa — o'tkaziladi;
 *     cheklangan mintaqada kompaniya darajasidagi qoida ham qo'llanadi (ochiq og'irlikli
 *     gpt-oss ham OpenAI hakami sifatida Rossiyada ishlatilmaydi — ehtiyotkorlik);
 *  3) kaliti yo'q yo'l o'tkaziladi; OpenRouter krediti kerak bo'lmagan yo'llar avval;
 *  4) ketma-ket, har chaqiruvga timeout va umumiy byudjet; hech qachon throw qilmaydi.
 * providers.ts ichki qismlariga bog'lanmaydi (u alohida qayta yozilmoqda) — kichik fetch.
 */

export { isOpaqueAuto, OPAQUE_AUTO_VENDORS, vendorOfId, VENDOR_LABEL, type Vendor } from "./vendor";

/**
 * Katalog id ("gpt-5-6-sol", "llama-3.3-free") → providerModel orqali; qolganlari
 * (OpenRouter / OmniRoute / Cloudflare / upstream javobidagi nom) — to'g'ridan-to'g'ri.
 */
export function vendorOf(modelId: string | null | undefined): Vendor {
  if (!modelId) return "unknown";
  const cat = MODEL_BY_ID[modelId];
  if (cat) {
    const v = vendorOfId(cat.providerModel || cat.id);
    return v !== "unknown" ? v : vendorOfId(cat.id);
  }
  return vendorOfId(modelId);
}

/** Bir nechta id (upstream + katalog) — birinchi ma'lum kompaniya. */
export function answerVendorOf(ids: AnswerModels): Vendor {
  for (const id of toList(ids)) {
    const v = vendorOf(id);
    if (v !== "unknown") return v;
  }
  return "unknown";
}

/** Id kompaniyasi noma'lum aralash kombo (auto/best-free ...) — haqiqiy upstream id'dan ko'rinmaydi. */
function opaque(id: string): boolean {
  return vendorOf(id) === "unknown" && isOpaqueAuto(id);
}

/**
 * Hakam uchun javob mualliflari ro'yxati. `served` — upstream haqiqatda qaytargan model(lar)
 * (mesh "served" hodisasi: OmniRoute X-OmniRoute-Model, katalog nomzodi). Ulardan biri aniq
 * kompaniyaga tegishli bo'lsa, so'ralgan aralash auto/* id'lari ro'yxatdan chiqariladi — ular
 * shu served modelga yechilgan. Aks holda auto/* qoladi va judgeCandidates u yo'naltira oladigan
 * barcha kompaniyalarni chiqaradi.
 */
export function answerModelsFor(served: AnswerModels, requested: AnswerModels): string[] {
  const s = toList(served);
  const r = toList(requested);
  const resolved = s.some((id) => vendorOf(id) !== "unknown");
  const all = [...s, ...r];
  return resolved ? all.filter((id) => !opaque(id)) : all;
}

type Route = "groq" | "cloudflare" | "omniroute" | "mistral" | "openrouter";

export interface JudgeCandidate {
  /** Region/vendor tekshiruvi uchun to'liq id (host prefiksi bilan). */
  id: string;
  route: Route;
  /** Upstream'ga yuboriladigan model nomi. */
  model: string;
  /** Qo'shimcha so'rov maydonlari (masalan gpt-oss uchun reasoning_effort). */
  extra?: Record<string, unknown>;
}

/**
 * Hakamlar navbati (afzallik tartibida), 7 kompaniya. Avval OpenRouter krediti kerak
 * bo'lmagan yo'llar: Groq (tekin kvota), Cloudflare Workers AI (kuniga 10k neuron),
 * OmniRoute orqali Groq, Mistral to'g'ridan-to'g'ri; OpenRouter (gpt-4o-mini) — oxirida.
 */
export const JUDGE_POOL: readonly JudgeCandidate[] = [
  { id: "groq/qwen/qwen3.8-27b", route: "groq", model: "qwen/qwen3.8-27b" }, // alibaba
  // 120b: 20b hakam sifatida sinovda xato javob berdi (2026-09-27); Groq'da ikkalasi ham tekin kvotada.
  { id: "groq/openai/gpt-oss-120b", route: "groq", model: "openai/gpt-oss-120b" }, // openai
  { id: `${CF_PREFIX}${CF.glm}`, route: "cloudflare", model: CF.glm }, // zhipu
  { id: `${CF_PREFIX}${CF.deepseekFlash}`, route: "cloudflare", model: CF.deepseekFlash }, // deepseek
  { id: `${CF_PREFIX}${CF.llama}`, route: "cloudflare", model: CF.llama }, // meta
  { id: "groq/qwen/qwen3.8-27b", route: "omniroute", model: "groq/qwen/qwen3.8-27b" }, // alibaba (OmniRoute)
  { id: "groq/openai/gpt-oss-20b", route: "omniroute", model: "groq/openai/gpt-oss-20b" }, // openai (OmniRoute)
  { id: "mistral/mistral-small-latest", route: "mistral", model: "mistral-small-latest" }, // mistral
  { id: "openai/gpt-4o-mini", route: "openrouter", model: "openai/gpt-4o-mini" }, // openai — OpenRouter krediti
];

type AnswerModels = string | null | undefined | readonly (string | null | undefined)[];

function toList(ids: AnswerModels): string[] {
  const arr = Array.isArray(ids) ? ids : [ids];
  return (arr as (string | null | undefined)[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

type Env = Record<string, string | undefined>;

function endpoint(route: Route, env: Env): { url: string; key: string; headers?: Record<string, string> } | null {
  switch (route) {
    case "groq":
      return env.GROQ_API_KEY ? { url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY } : null;
    case "cloudflare": {
      const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
      const token = env.CLOUDFLARE_AI_TOKEN?.trim();
      if (!account || !token) return null;
      return { url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`, key: token };
    }
    case "omniroute": {
      const base = (env.OMNIROUTE_BASE_URL ?? "").trim().replace(/\/$/, "");
      return base && env.OMNIROUTE_API_KEY ? { url: `${base}/chat/completions`, key: env.OMNIROUTE_API_KEY } : null;
    }
    case "mistral":
      return env.MISTRAL_API_KEY ? { url: "https://api.mistral.ai/v1/chat/completions", key: env.MISTRAL_API_KEY } : null;
    case "openrouter":
      return env.OPENROUTER_API_KEY
        ? {
            url: "https://openrouter.ai/api/v1/chat/completions",
            key: env.OPENROUTER_API_KEY,
            headers: { "HTTP-Referer": env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz", "X-Title": "SOVEREIGN Judge" },
          }
        : null;
  }
}

/** Hakam kompaniyasi shu mamlakatda ishlatilishi mumkinmi (model/host + kompaniya qoidasi). */
function judgeAllowedIn(c: JudgeCandidate, vendor: Vendor, country: string | null | undefined): boolean {
  if (!modelAllowedIn(c.id, country)) return false;
  const cc = normalizeCountry(country);
  if (!cc || !restrictedRegion(cc)) return true;
  // Cheklangan mintaqa: kompaniya o'zi xizmat ko'rsatmaydigan joyda uning nomi bilan hakamlik ham yo'q.
  return !PROVIDER_POLICY[vendor].restricted.includes(cc);
}

/**
 * Shu javob uchun ruxsat etilgan hakamlar (tartib bilan). Javob kompaniyasi(lari)
 * chiqarib tashlanadi, mintaqa va kalitlar hisobga olinadi. Tarmoqqa chiqmaydi.
 */
export function judgeCandidates(opts: {
  answerModel?: AnswerModels;
  country?: string | null;
  env?: Env;
  pool?: readonly JudgeCandidate[];
}): (JudgeCandidate & { vendor: Vendor })[] {
  const env = opts.env ?? (process.env as Env);
  const ids = toList(opts.answerModel);
  const excluded = new Set<Vendor>(ids.map(vendorOf).filter((v) => v !== "unknown"));
  // Aralash auto/* kombo va served model noma'lum: javob istalgan kompaniyadan bo'lishi mumkin —
  // u yo'naltira oladigan barcha kompaniyalar chiqariladi (bir kompaniya o'zini tekshirmasin).
  if (ids.some(opaque)) for (const v of OPAQUE_AUTO_VENDORS) excluded.add(v);
  const out: (JudgeCandidate & { vendor: Vendor })[] = [];
  for (const c of opts.pool ?? JUDGE_POOL) {
    const vendor = vendorOfId(c.id);
    if (vendor === "unknown" || vendor === "sovereign") continue; // hakam har doim tashqi, ma'lum kompaniya
    if (excluded.has(vendor)) continue;
    if (!judgeAllowedIn(c, vendor, opts.country)) continue;
    if (!endpoint(c.route, env)) continue;
    out.push({ ...c, vendor });
  }
  return out;
}

export interface JudgeRequest {
  system: string;
  user: string;
  /** Javobni yaratgan model(lar): upstream nomi va/yoki katalog id. Hammasining kompaniyasi chiqariladi. */
  answerModel?: AnswerModels;
  /** Foydalanuvchi mamlakati (region.ts) — null: cheklov yo'q. */
  country?: string | null;
  /** Bitta hakam chaqiruvi uchun (default 8 s). */
  timeoutMs?: number;
  /** Barcha urinishlar uchun jami (default 15 s). */
  budgetMs?: number;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Javob yaroqlimi (masalan JSON) — yo'q bo'lsa keyingi hakamga o'tiladi. */
  accept?: (text: string) => boolean;
  /** Testlar uchun. */
  fetchImpl?: typeof fetch;
  env?: Env;
  pool?: readonly JudgeCandidate[];
}

export interface JudgeResult {
  text: string;
  judgeModel: string;
  judgeVendor: Vendor;
  /** Javob kompaniyasi (UI: "javob: <Vendor>"); aniqlanmasa "unknown". */
  answerVendor: Vendor;
}

/** <think>…</think> va kod to'siqlarisiz matn. */
export function cleanJudgeText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/** Model javobidan birinchi {...} JSON obyektini ajratadi; bo'lmasa null. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const text = cleanJudgeText(raw);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function contentOf(body: unknown): string {
  const chunk = jsonCompletionToChunk(body);
  return chunk?.choices[0]?.delta.content ?? "";
}

/**
 * Mustaqil hakamni chaqiradi: javob kompaniyasidan boshqa, mintaqada ruxsat etilgan,
 * kaliti bor birinchi ishlagan hakam. Hech biri javob bermasa — null. Hech qachon throw qilmaydi.
 */
export async function callJudge(req: JudgeRequest): Promise<JudgeResult | null> {
  try {
    const env = req.env ?? (process.env as Env);
    const doFetch = req.fetchImpl ?? fetch;
    const list = judgeCandidates({ answerModel: req.answerModel, country: req.country, env, pool: req.pool });
    const answerVendor = answerVendorOf(req.answerModel);
    const perCall = req.timeoutMs ?? 8_000;
    const deadline = Date.now() + (req.budgetMs ?? 15_000);
    for (const c of list) {
      if (req.signal?.aborted) return null;
      const left = deadline - Date.now();
      if (left < 500) break;
      const ep = endpoint(c.route, env);
      if (!ep) continue;
      const timeout = AbortSignal.timeout(Math.min(perCall, left));
      const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
      try {
        const res = await doFetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ep.key}`, ...(ep.headers ?? {}) },
          body: JSON.stringify({
            model: c.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            temperature: req.temperature ?? 0.1,
            // Fikrlovchi modellar (qwen3, gpt-oss) tokenning bir qismini reasoning'ga sarflaydi.
            max_tokens: Math.max(req.maxTokens ?? 800, 600),
            stream: false,
            ...(c.extra ?? {}),
          }),
          signal,
        });
        if (!res.ok) {
          await res.body?.cancel().catch(() => {});
          continue;
        }
        const text = cleanJudgeText(contentOf(await res.json()));
        if (!text) continue;
        if (req.accept && !req.accept(text)) continue;
        return { text, judgeModel: c.id, judgeVendor: c.vendor, answerVendor };
      } catch {
        /* timeout / tarmoq — keyingi hakam */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** UI/log uchun qisqa yorliq ("Alibaba (Qwen)"); noma'lum — bo'sh satr. */
export function vendorLabel(v: Vendor): string {
  return VENDOR_LABEL[v] ?? "";
}
