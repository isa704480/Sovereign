/**
 * Unit economics — "har javob uchun xarajat" hisobi. PURE (tarmoq/env yo'q):
 * server funksiyasi (unit-economics.server.ts) va testlar bir xil mantiqdan foydalanadi.
 * Test: npx tsx src/lib/econ/unit-economics.test.ts
 *
 * Metodika:
 *  - Manba: token_usage_daily qatorlari (kun × foydalanuvchi × model [× provayder × upstream]).
 *    "Javob" = calls (web: bitta so'rov; CLI: bitta model chaqiruvi).
 *  - Bizning xarajat = Σ tokenlar × HAQIQATDA javob bergan modelning ro'yxat narxi
 *    (src/config/model-prices.ts). Upstream model saqlangan bo'lsa ("verified") — o'sha,
 *    aks holda qatordagi model id (katalog id bo'lsa → uning providerModel'i).
 *  - Qarshi faraz (counterfactual): o'sha tokenlar bitta vendor flagmani (GPT-4o, Claude
 *    Sonnet) ro'yxat narxida. Faqat narxi topilgan qatorlar ikkala tomonda ham qatnashadi.
 *  - Tekin tarif (Groq free, Cloudflare kunlik neuron, ":free") ham ro'yxat narxida,
 *    lekin ulushi alohida ko'rsatiladi. Model yo'q / "auto" / narxsiz qatorlar chiqariladi
 *    va soni hisobotda aytiladi.
 */
import { MODEL_BY_ID } from "@/config/models";
import {
  DEFAULT_BASELINES,
  FREE_TIER_PROVIDERS,
  MODEL_PRICES,
  type Baseline,
  type ModelPrice,
} from "@/config/model-prices";
import { sameModel } from "@/lib/ai/served";

export interface UsageRow {
  day: string;
  user_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  calls: number;
  /** 0036 dan: javob bergan provayder ("groq", "cloudflare", ...). Bo'sh — noma'lum. */
  provider?: string | null;
  /** 0036 dan: upstream qaytargan haqiqiy model id. Bo'sh — saqlanmagan. */
  upstream_model?: string | null;
}

export interface ServedModel {
  model: string;
  provider: string;
  /** Upstream model id saqlangan (true) yoki faqat marshrut/katalog id'dan (false). */
  verified: boolean;
}

/** Admin kartasidagi sanalar oralig'i (kun). */
export const ECON_RANGES = [7, 30, 90] as const;
export type EconRange = (typeof ECON_RANGES)[number];

export function parseEconRange(v: unknown): EconRange {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (ECON_RANGES as readonly number[]).includes(n) ? (n as EconRange) : 30;
}

const HOST_PREFIX = /^(openrouter|omniroute|groq|cloudflare)\//i;

/** Id'ning o'zidan provayderni aniqlash (faqat ishonchli belgilar bo'yicha; aks holda ""). */
export function inferProvider(id: string): string {
  const s = (id ?? "").trim();
  if (/^cloudflare\//i.test(s) || s.startsWith("@cf/")) return "cloudflare";
  const host = /^(groq|perplexity|openrouter|omniroute|mock)\//i.exec(s);
  if (host) return host[1].toLowerCase();
  if (/^(mistral|codestral|pixtral|ministral|magistral|devstral)-[\w.-]*latest$/i.test(s)) return "mistral";
  return "";
}

/** Qator qaysi model/provayder bilan javob berganini aniqlaydi; aniqlab bo'lmasa — null. */
export function resolveServed(row: Pick<UsageRow, "model" | "provider" | "upstream_model">): ServedModel | null {
  const upstream = (row.upstream_model ?? "").trim();
  const rowModel = (row.model ?? "").trim();
  const verified = upstream.length > 0;
  let model = verified ? upstream : rowModel;
  if (!model || model === "auto" || model.startsWith("auto/")) return null;
  // Katalog id ("claude-sonnet-4-5") → marshrutdagi providerModel ("anthropic/claude-sonnet-4.5").
  if (!verified && MODEL_BY_ID[model]?.providerModel) model = MODEL_BY_ID[model].providerModel;
  const provider = (row.provider ?? "").trim().toLowerCase() || inferProvider(model) || inferProvider(rowModel);
  return { model, provider, verified };
}

function bareId(id: string): { id: string; free: boolean } {
  let s = id.trim();
  while (HOST_PREFIX.test(s)) s = s.replace(HOST_PREFIX, "");
  const free = /:free$/i.test(s);
  return { id: s.replace(/:free$/i, ""), free };
}

const names = (p: ModelPrice) => [p.id, ...(p.aliases ?? [])];

function findIn(pool: ModelPrice[], id: string): ModelPrice | undefined {
  const lower = id.toLowerCase();
  return (
    pool.find((p) => names(p).some((n) => n.toLowerCase() === lower)) ??
    pool.find((p) => names(p).some((n) => sameModel(n, id)))
  );
}

export interface PriceMatch {
  price: ModelPrice;
  /** ":free" variant yoki tekin tarifli provayder. */
  freeTier: boolean;
}

/** Model (+ provayder) narxi. Provayderga xos narx ustun; topilmasa — null (taxmin qilinmaydi). */
export function lookupPrice(model: string, provider = "", prices: ModelPrice[] = MODEL_PRICES): PriceMatch | null {
  const { id, free } = bareId(model);
  if (!id) return null;
  const prov = provider.toLowerCase();
  const price =
    (prov ? findIn(prices.filter((p) => p.provider === prov), id) : undefined) ??
    findIn(prices.filter((p) => !p.provider), id) ??
    findIn(prices.filter((p) => p.provider && p.provider !== "cloudflare"), id);
  if (!price) return null;
  return { price, freeTier: free || prov in FREE_TIER_PROVIDERS };
}

export function costUsd(inTokens: number, outTokens: number, p: Pick<ModelPrice, "inPerM" | "outPerM">): number {
  return (inTokens * p.inPerM + outTokens * p.outPerM) / 1_000_000;
}

export interface Breakdown {
  key: string;
  answers: number;
  tokens: number;
  costUsd: number;
}

export interface BaselineResult {
  key: string;
  label: string;
  model: string;
  costUsd: number;
  perAnswerUsd: number | null;
  /** (1 − biz / baza) × 100. Baza 0 bo'lsa — null. */
  savingsPct: number | null;
}

export interface UnitEconomics {
  from: string;
  to: string;
  /** 0036 ustunlari (provider, upstream_model) mavjudmi. */
  servedColumns: boolean;
  totals: { answers: number; tokensIn: number; tokensOut: number };
  priced: { answers: number; tokensIn: number; tokensOut: number; costUsd: number; verifiedAnswers: number };
  excluded: { answers: number; noModelAnswers: number; unpricedAnswers: number; unpriced: { model: string; answers: number }[] };
  perAnswerUsd: number | null;
  baselines: BaselineResult[];
  freeTier: { answers: number; sharePct: number | null; costAtListUsd: number };
  byProvider: Breakdown[];
  byModel: Breakdown[];
  byPlan: Breakdown[];
}

export interface ComputeOptions {
  from: string;
  to: string;
  servedColumns?: boolean;
  /** user_id → tarif (joriy tarif; tarix saqlanmaydi). */
  planByUser?: Record<string, string>;
  baselines?: Baseline[];
  prices?: ModelPrice[];
}

function add(map: Map<string, Breakdown>, key: string, answers: number, tokens: number, cost: number) {
  const b = map.get(key) ?? { key, answers: 0, tokens: 0, costUsd: 0 };
  b.answers += answers;
  b.tokens += tokens;
  b.costUsd += cost;
  map.set(key, b);
}

const sorted = (m: Map<string, Breakdown>) => [...m.values()].sort((a, b) => b.costUsd - a.costUsd || b.answers - a.answers);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function computeUnitEconomics(rows: UsageRow[], opts: ComputeOptions): UnitEconomics {
  const prices = opts.prices ?? MODEL_PRICES;
  const baselines = (opts.baselines ?? DEFAULT_BASELINES)
    .map((b) => ({ b, match: lookupPrice(b.model, "", prices) }))
    .filter((x): x is { b: Baseline; match: PriceMatch } => x.match !== null);
  const baseCost = baselines.map(() => 0);

  const totals = { answers: 0, tokensIn: 0, tokensOut: 0 };
  const priced = { answers: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, verifiedAnswers: 0 };
  let noModelAnswers = 0;
  const unpriced = new Map<string, number>();
  const free = { answers: 0, costAtListUsd: 0 };
  const byProvider = new Map<string, Breakdown>();
  const byModel = new Map<string, Breakdown>();
  const byPlan = new Map<string, Breakdown>();

  for (const r of rows) {
    const calls = num(r.calls);
    const tin = num(r.input_tokens);
    const tout = num(r.output_tokens);
    totals.answers += calls;
    totals.tokensIn += tin;
    totals.tokensOut += tout;

    const served = resolveServed(r);
    if (!served) {
      noModelAnswers += calls;
      continue;
    }
    const match = lookupPrice(served.model, served.provider, prices);
    if (!match) {
      unpriced.set(served.model, (unpriced.get(served.model) ?? 0) + calls);
      continue;
    }
    const cost = costUsd(tin, tout, match.price);
    priced.answers += calls;
    priced.tokensIn += tin;
    priced.tokensOut += tout;
    priced.costUsd += cost;
    if (served.verified) priced.verifiedAnswers += calls;
    if (match.freeTier) {
      free.answers += calls;
      free.costAtListUsd += cost;
    }
    baselines.forEach(({ match: bm }, i) => {
      baseCost[i] += costUsd(tin, tout, bm.price);
    });
    add(byProvider, served.provider || "unknown", calls, tin + tout, cost);
    add(byModel, match.price.id, calls, tin + tout, cost);
    add(byPlan, opts.planByUser?.[r.user_id] ?? "unknown", calls, tin + tout, cost);
  }

  const unpricedAnswers = [...unpriced.values()].reduce((a, n) => a + n, 0);
  const perAnswer = priced.answers > 0 ? priced.costUsd / priced.answers : null;

  return {
    from: opts.from,
    to: opts.to,
    servedColumns: opts.servedColumns ?? false,
    totals,
    priced,
    excluded: {
      answers: noModelAnswers + unpricedAnswers,
      noModelAnswers,
      unpricedAnswers,
      unpriced: [...unpriced.entries()].map(([model, answers]) => ({ model, answers })).sort((a, b) => b.answers - a.answers),
    },
    perAnswerUsd: perAnswer,
    baselines: baselines.map(({ b }, i) => ({
      key: b.key,
      label: b.label,
      model: b.model,
      costUsd: baseCost[i],
      perAnswerUsd: priced.answers > 0 ? baseCost[i] / priced.answers : null,
      savingsPct: baseCost[i] > 0 ? (1 - priced.costUsd / baseCost[i]) * 100 : null,
    })),
    freeTier: {
      answers: free.answers,
      sharePct: priced.answers > 0 ? (free.answers / priced.answers) * 100 : null,
      costAtListUsd: free.costAtListUsd,
    },
    byProvider: sorted(byProvider),
    byModel: sorted(byModel),
    byPlan: sorted(byPlan),
  };
}
