/**
 * Provider Mesh — rejalashtiruvchi (scheduler). PURE: tarmoq, env, Redis yo'q — faqat
 * adapterlar ro'yxati, sog'liq snapshot'i va (testda) inject qilingan `rand` / `now`.
 *
 * Vazifa (docs/MESH.md §3–§5): so'rov uchun barcha provayderlarning takliflarini (offers)
 * filtrlaydi (enabled, exclude, sog'liq, imkoniyat, mintaqa, tarif), skorlaydi va tartiblaydi:
 *   G0 — aynan so'ralgan model (bir xil og'irliklar), G1 — sinf bo'yicha o'rinbosarlar,
 *   G2 — rescue shlyuzlar (LLM7, Experiential, Gateway).
 * Har guruh boshida yukni yoyish: skori `best · spreadBand` dan yuqorilar orasidan birinchisi
 * skorga proporsional tasodifiy tanlanadi — barcha tekin kvotalar birga sarflanadi.
 *
 * `explain()` — xuddi shu hisob, lekin har taklif nega tashlangani / qaysi o'rinda turgani
 * (server logi uchun, foydalanuvchiga ko'rsatilmaydi).
 *
 * Test: npx tsx --conditions=react-server src/lib/ai/mesh/scheduler.test.ts
 */
import { MODEL_BY_ID } from "@/config/models";
import { hostAllowedIn, modelAllowedIn, regionClassOf } from "../region";
import { sameModel as sameModelId } from "../served";
import { effectiveCaps } from "./caps";
import { maxTier, minTier, modelTierFor } from "./tier";
import {
  COST_RANK,
  MESH_TUNING,
  TIER_RANK,
  type Candidate,
  type HealthSnapshot,
  type HealthState,
  type ModelOffer,
  type OfferClass,
  type OfferCost,
  type PlanTier,
  type ProviderAdapter,
  type RouteRequest,
} from "./types";

/* ------------------------------------------------------------------ */
/* Tiplar                                                              */
/* ------------------------------------------------------------------ */

export interface PlanDeps {
  /** Odatda registry `enabledAdapters()`; scheduler baribir `enabled()` ni qayta tekshiradi. */
  adapters: readonly ProviderAdapter[];
  /** health.ts snapshot() — kalit: `mesh:health:<provider>[:<wire>]`. Yo'q kalit = sog'lom. */
  health: HealthSnapshot;
  /** [0,1) — testda seed'li generator. Standart: Math.random. */
  rand?: () => number;
  /** Epoch ms. Standart: Date.now(). */
  now?: number;
  /**
   * So'ralgan katalog modelining tarifi. Berilmasa `MODEL_BY_ID[sovereignModelId].tier`
   * dan olinadi; katalogda yo'q id (OmniRoute/OpenRouter xom id) — offer'ning o'z tarifi.
   */
  modelTier?: PlanTier;
  /** So'ralgan modelning upstream id'si. Berilmasa katalogdan. */
  providerModel?: string;
}

export type DropReason =
  | "disabled"
  | "excluded"
  | "health_open"
  | "no_tools"
  | "no_vision"
  | "region_host"
  | "region_model"
  | "plan_tier"
  | "same_model_only"
  | "not_substitutable"
  | "class_mismatch"
  | "rescue_disallowed"
  | "cost_ceiling"
  | "duplicate";

export interface ScoreFactors {
  Q: number;
  F: number;
  H: number;
  L: number;
  R: number;
  C: number;
  S: number;
  X: number;
}

export interface ExplainEntry {
  provider: string;
  /** Adapter o'chirilgan bo'lsa bo'sh. */
  wire: string;
  verdict: "kept" | "dropped";
  reason?: DropReason;
  /** Qo'shimcha: health_open → "until=...", region → tekshirilgan id. */
  detail?: string;
  group?: 0 | 1 | 2;
  sameModel?: boolean;
  score?: number;
  factors?: ScoreFactors;
  /** plan() natijasidagi o'rin (0 — birinchi sinaladi). */
  rank?: number;
  /** Yoyish bandida edi (skor >= best · spreadBand). */
  inBand?: boolean;
}

/* ------------------------------------------------------------------ */
/* Yordamchilar (health.ts bilan bir xil kalit/qoida — u yerdan mustaqil) */
/* ------------------------------------------------------------------ */

/** health.ts `healthKey` bilan bir xil shakl (docs/MESH.md §9). */
export function meshHealthKey(provider: string, wire?: string): string {
  return wire ? `mesh:health:${provider}:${wire}` : `mesh:health:${provider}`;
}

/** open + until o'tgan → half_open (health.ts effectiveState bilan bir xil). */
function effState(h: HealthState | undefined, now: number): HealthState["state"] {
  if (!h) return "closed";
  if (h.state === "open") return h.until !== undefined && now >= h.until ? "half_open" : "open";
  return h.state;
}

const COST_TIER: Record<OfferCost, PlanTier> = { free: "free", cheap: "starter", paid: "pro" };

/** O'rinbosar sifatida berilishi uchun minimal tarif. */
export function offerMinTier(o: ModelOffer): PlanTier {
  return o.minTier ?? COST_TIER[o.cost];
}

/**
 * Hisob "hovuzi" kaliti (health.ts poolWire bilan bir xil): tekin taklif — "$free" (masalan OpenRouter
 * free-models-per-day), pullik — "$paid" (kredit tugadi). Faqat mos takliflar yopiladi.
 */
export function offerPool(o: ModelOffer): "$free" | "$paid" {
  return o.cost === "free" ? "$free" : "$paid";
}

/**
 * Aynan so'ralgan model (G0) uchun kerakli tarif: katalog tarifi VA offer'ning o'z tarifi — qaysi
 * biri yuqori (":free" model so'ralsa pullik variant tekin foydalanuvchiga berilmaydi; upstream
 * nomi bilan so'ralgan Ultra model Pro'ga berilmaydi). Istisno: substitutable === false (Tella,
 * Perplexity research) — faqat model tarifi (ular hech qachon o'rinbosar emas).
 */
export function sameModelTier(o: ModelOffer, modelTier: PlanTier | null): PlanTier {
  const own = offerMinTier(o);
  if (!modelTier) return own;
  if (o.substitutable === false) return modelTier;
  return maxTier(modelTier, own);
}

/** Sinf pog'onalari (region.ts regionEquivalents bilan bir xil). */
const LADDER: Record<OfferClass, OfferClass[]> = {
  flagship: ["flagship", "fast", "free"],
  code: ["code", "fast", "free"],
  fast: ["fast", "free"],
  free: ["free"],
};

function displayOf(a: ProviderAdapter, wire: string): string {
  try {
    return a.displayId?.(wire) ?? wire;
  } catch {
    return wire;
  }
}

function norm(id: string): string {
  return id.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Skor                                                                 */
/* ------------------------------------------------------------------ */

interface HealthView {
  state: HealthState["state"];
  successEwma: number;
  latencyEwmaMs: number;
  usedToday?: number;
  until?: number;
}

/** Provayder va model kalitlarini birlashtirish: eng yomon holat, EWMA ko'paytmasi. */
function healthView(a: ProviderAdapter, offer: ModelOffer, health: HealthSnapshot, now: number): HealthView {
  const wire = offer.wire;
  const p = health.get(meshHealthKey(a.id));
  const m = health.get(meshHealthKey(a.id, wire));
  // Hisob hovuzi ($free / $paid) — faqat blok (open) sifatida; EWMA/latency'ga ta'sir qilmaydi.
  const pool = health.get(meshHealthKey(a.id, offerPool(offer)));
  const sp = effState(p, now);
  const sm = effState(m, now);
  const sq = effState(pool, now);
  const states = [sp, sm, sq];
  const state = states.includes("open") ? "open" : states.includes("half_open") ? "half_open" : "closed";
  const until =
    Math.max(sp === "open" ? p?.until ?? 0 : 0, sm === "open" ? m?.until ?? 0 : 0, sq === "open" ? pool?.until ?? 0 : 0) ||
    undefined;
  const perModel = a.limits?.perModel === true;
  return {
    state,
    until,
    successEwma: clamp01(p?.successEwma ?? 1) * clamp01(m?.successEwma ?? 1),
    latencyEwmaMs: m?.latencyEwmaMs ?? p?.latencyEwmaMs ?? MESH_TUNING.defaultLatencyMs,
    usedToday: perModel ? m?.usedToday : p?.usedToday,
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

function factorsFor(
  a: ProviderAdapter,
  offer: ModelOffer,
  sameModel: boolean,
  req: RouteRequest,
  reqClass: OfferClass | null,
  h: HealthView,
): ScoreFactors {
  const Q = offer.quality ?? MESH_TUNING.classQuality[offer.class];
  let steps = 0;
  if (!sameModel && reqClass) steps = Math.max(0, LADDER[reqClass].indexOf(offer.class));
  const F = Math.pow(MESH_TUNING.classStepFactor, steps);
  const H = h.successEwma * (h.state === "half_open" ? MESH_TUNING.halfOpenFactor : 1);
  const L = 1 / (1 + Math.max(0, h.latencyEwmaMs) / MESH_TUNING.latencyRefMs);
  const daily = a.limits?.dailyUnits;
  const R =
    daily && daily > 0 && h.usedToday !== undefined
      ? Math.min(1, Math.max(MESH_TUNING.minHeadroom, 1 - h.usedToday / daily))
      : 1;
  const C = MESH_TUNING.costFactor[offer.cost];
  const S = req.needs.stream && !offer.caps.stream ? MESH_TUNING.noStreamFactor : 1;
  const X = a.rescue ? MESH_TUNING.rescueFactor : 1;
  return { Q, F, H, L, R, C, S, X };
}

function product(f: ScoreFactors): number {
  return f.Q * f.F * f.H * f.L * f.R * f.C * f.S * f.X;
}

/**
 * Bitta nomzod skori (docs/MESH.md §3). `h` — shu provayder (yoki model) kalitining holati;
 * provayder+model kalitlarini birlashtirish plan() ichida.
 */
export function scoreCandidate(
  c: Omit<Candidate, "score">,
  req: RouteRequest,
  h: HealthState,
  a: ProviderAdapter,
  now: number,
): number {
  const view: HealthView = {
    state: effState(h, now),
    successEwma: clamp01(h.successEwma),
    latencyEwmaMs: h.latencyEwmaMs,
    usedToday: h.usedToday,
  };
  return product(factorsFor(a, c.offer, c.sameModel, req, requestedClass(req, undefined), view));
}

/* ------------------------------------------------------------------ */
/* So'ralgan model                                                      */
/* ------------------------------------------------------------------ */

interface Target {
  id: string | null;
  ids: Set<string>;
  providerModel: string | null;
  tier: PlanTier | null;
}

function target(req: RouteRequest, deps: Pick<PlanDeps, "modelTier" | "providerModel">): Target {
  const raw = req.sovereignModelId?.trim();
  const reqTier = deps.modelTier ?? req.modelTier;
  if (!raw || raw === "auto") return { id: null, ids: new Set(), providerModel: null, tier: reqTier ?? null };
  const cat = MODEL_BY_ID[raw];
  const providerModel = deps.providerModel ?? (cat?.providerModel || null);
  const ids = new Set([norm(raw)]);
  if (providerModel) ids.add(norm(providerModel));
  // Katalogda yo'q id (upstream nomi) ham katalog modeliga moslanadi — tarif chetlab o'tilmasin.
  return { id: raw, ids, providerModel, tier: reqTier ?? modelTierFor(raw) };
}

function requestedClass(req: RouteRequest, t: Target | undefined): OfferClass | null {
  if (req.class) return req.class;
  const id = t?.providerModel ?? t?.id ?? req.sovereignModelId;
  if (!id || id === "auto") return null;
  return regionClassOf(id, { tier: t?.tier ?? undefined });
}

function isSameModel(o: ModelOffer, a: ProviderAdapter, t: Target, resolved: boolean): boolean {
  if (!t.id) return false;
  if (resolved) return true; // resolve(id) — aynan so'ralgan id uchun (types.ts shartnomasi)
  if (o.sovereignIds.some((s) => t.ids.has(norm(s)))) return true;
  const want = t.providerModel ?? t.id;
  // "auto/*" kombolar — faqat aniq id bo'yicha (fuzzy moslash yo'q).
  if (want.startsWith("auto/")) return false;
  return sameModelId(o.wire, want) || sameModelId(displayOf(a, o.wire), want);
}

/* ------------------------------------------------------------------ */
/* Asosiy hisob                                                          */
/* ------------------------------------------------------------------ */

interface Scored {
  a: ProviderAdapter;
  offer: ModelOffer;
  sameModel: boolean;
  group: 0 | 1 | 2;
  score: number;
  factors: ScoreFactors;
}

interface Evaluation {
  kept: Scored[];
  dropped: ExplainEntry[];
}

function evaluate(req: RouteRequest, deps: PlanDeps): Evaluation {
  const now = deps.now ?? Date.now();
  const t = target(req, deps);
  const reqClass = requestedClass(req, t);
  const exclude = new Set<string>(req.exclude ?? []);
  const allowRescue = req.allowRescue !== false && !req.sameModelOnly;
  const plan = TIER_RANK[req.planTier] ?? 0;
  // O'rinbosarlar (G1/G2) — planTier va substituteTier'ning kichigi.
  const subPlan = TIER_RANK[minTier(req.planTier, req.substituteTier ?? req.planTier)] ?? 0;
  const kept: Scored[] = [];
  const dropped: ExplainEntry[] = [];
  const seen = new Set<string>();

  for (const a of deps.adapters) {
    let on = false;
    try {
      on = a.enabled();
    } catch {
      on = false;
    }
    if (!on) {
      dropped.push({ provider: a.id, wire: "", verdict: "dropped", reason: "disabled" });
      continue;
    }

    // Statik takliflar + (aggregator) dinamik taklif.
    const offers: { offer: ModelOffer; resolved: boolean }[] = [];
    let list: ModelOffer[] = [];
    try {
      list = a.offers ?? [];
    } catch {
      list = [];
    }
    for (const offer of list) offers.push({ offer, resolved: false });
    if (t.id && a.resolve) {
      for (const id of new Set([t.id, t.providerModel].filter((x): x is string => !!x))) {
        try {
          const r = a.resolve(id);
          if (r) offers.push({ offer: r, resolved: true });
        } catch {
          /* adapter xatosi — e'tiborsiz */
        }
      }
    }
    // Aynan so'ralgan (resolved / sameModel) takliflar dedupe'da ustun bo'lsin.
    const tagged = offers.map((x) => ({ ...x, same: isSameModel(x.offer, a, t, x.resolved) }));
    tagged.sort((x, y) => Number(y.same) - Number(x.same));

    for (const { offer, same } of tagged) {
      const drop = (reason: DropReason, detail?: string) =>
        dropped.push({ provider: a.id, wire: offer.wire, verdict: "dropped", reason, detail, sameModel: same });

      const dedupeKey = `${a.id}\u0000${offer.wire}`;
      if (seen.has(dedupeKey)) {
        drop("duplicate");
        continue;
      }
      if (exclude.has(a.id)) {
        drop("excluded");
        continue;
      }
      if (a.rescue && !allowRescue) {
        drop("rescue_disallowed");
        continue;
      }
      // Byudjet guard'i (RouteRequest.costCeiling) — shiftdan qimmat taklif tanlanmaydi.
      if (req.costCeiling && COST_RANK[offer.cost] > COST_RANK[req.costCeiling]) {
        drop("cost_ceiling", `${offer.cost}>${req.costCeiling}`);
        continue;
      }
      if (!same && req.sameModelOnly) {
        drop("same_model_only");
        continue;
      }
      // Faqat aynan o'zi so'ralganda (Tella, Perplexity research) — o'rinbosar bo'lmaydi.
      if (!same && offer.substitutable === false) {
        drop("not_substitutable");
        continue;
      }
      if (!same && reqClass && !LADDER[reqClass].includes(offer.class)) {
        drop("class_mismatch", `${offer.class}∉${reqClass}`);
        continue;
      }
      const caps = effectiveCaps(a.id, offer, now);
      if (req.needs.tools && !caps.tools) {
        drop("no_tools");
        continue;
      }
      if (req.needs.vision && !caps.vision) {
        drop("no_vision");
        continue;
      }
      if (!hostAllowedIn(a.host, req.country)) {
        drop("region_host", a.host);
        continue;
      }
      const shown = displayOf(a, offer.wire);
      const regionIds = [shown, offer.wire, ...(offer.sovereignIds[0] ? [offer.sovereignIds[0]] : [])];
      const blocked = regionIds.find((id) => !modelAllowedIn(id, req.country));
      if (blocked) {
        drop("region_model", blocked);
        continue;
      }
      // Tarif: same-model — max(katalog tarifi, offer tarifi) (sameModelTier); o'rinbosar/rescue —
      // offer tarifi, chegara min(planTier, substituteTier).
      const need = same ? sameModelTier(offer, t.tier) : offerMinTier(offer);
      const limit = same ? plan : subPlan;
      if ((TIER_RANK[need] ?? 99) > limit) {
        drop("plan_tier", `${need}>${same ? req.planTier : minTier(req.planTier, req.substituteTier ?? req.planTier)}`);
        continue;
      }
      const h = healthView(a, offer, deps.health, now);
      if (h.state === "open") {
        drop("health_open", h.until ? `until=${new Date(h.until).toISOString()}` : undefined);
        continue;
      }

      seen.add(dedupeKey);
      const factors = factorsFor(a, offer, same, req, reqClass, h);
      const group: 0 | 1 | 2 = a.rescue ? 2 : same ? 0 : 1;
      kept.push({ a, offer, sameModel: same, group, score: product(factors), factors });
    }
  }
  return { kept, dropped };
}

/** Guruh ichida: birinchisi band ichidan skorga proporsional tasodifiy, qolgani skor bo'yicha. */
function spread(group: Scored[], rand: () => number): { order: Scored[]; band: Set<Scored> } {
  const sorted = [...group].sort((x, y) => y.score - x.score);
  const band = new Set<Scored>();
  if (sorted.length === 0) return { order: sorted, band };
  const best = sorted[0].score;
  for (const s of sorted) if (s.score >= best * MESH_TUNING.spreadBand && s.score > 0) band.add(s);
  if (band.size <= 1) return { order: sorted, band };
  const members = sorted.filter((s) => band.has(s));
  const total = members.reduce((sum, s) => sum + s.score, 0);
  let r = Math.min(Math.max(rand(), 0), 1 - Number.EPSILON) * total;
  let pick = members[members.length - 1];
  for (const s of members) {
    r -= s.score;
    if (r < 0) {
      pick = s;
      break;
    }
  }
  return { order: [pick, ...sorted.filter((s) => s !== pick)], band };
}

function ordered(kept: Scored[], rand: () => number): { order: Scored[]; band: Set<Scored> } {
  const order: Scored[] = [];
  const band = new Set<Scored>();
  for (const g of [0, 1, 2] as const) {
    const r = spread(
      kept.filter((s) => s.group === g),
      rand,
    );
    order.push(...r.order);
    r.band.forEach((s) => band.add(s));
  }
  return { order, band };
}

/* ------------------------------------------------------------------ */
/* Ommaviy API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tartiblangan nomzodlar: [...G0 (aynan model), ...G1 (o'rinbosar), ...G2 (rescue)].
 * Bo'sh — bu so'rovga xizmat qiladigan provayder yo'q (kalit yo'q / hammasi yopiq / mintaqa).
 * Half-open nomzod ro'yxatda qoladi — probe lock'ini (acquireProbe) execute oladi.
 */
export function plan(req: RouteRequest, deps: PlanDeps): Candidate[] {
  const { kept } = evaluate(req, deps);
  const { order } = ordered(kept, deps.rand ?? Math.random);
  return order.map((s) => ({ provider: s.a.id, offer: s.offer, sameModel: s.sameModel, score: s.score }));
}

/** docs/MESH.md §1 dagi nom — plan() ning muqobil imzosi. */
export function planCandidates(
  req: RouteRequest,
  adapters: readonly ProviderAdapter[],
  health: HealthSnapshot,
  opts: { now?: number; rng?: () => number } = {},
): Candidate[] {
  return plan(req, { adapters, health, now: opts.now, rand: opts.rng });
}

/**
 * Har taklif bo'yicha qaror: tashlangan (sabab bilan) yoki saqlangan (guruh, skor, omillar,
 * o'rin). PURE — server logi uchun. `deps.rand` berilsa, `rank` plan() bilan bir xil bo'ladi
 * (bir xil seed bilan). Tartib: avval saqlanganlar (rank bo'yicha), keyin tashlanganlar.
 */
export function explain(req: RouteRequest, deps: PlanDeps): ExplainEntry[] {
  const { kept, dropped } = evaluate(req, deps);
  const { order, band } = ordered(kept, deps.rand ?? Math.random);
  const keptEntries: ExplainEntry[] = order.map((s, i) => ({
    provider: s.a.id,
    wire: s.offer.wire,
    verdict: "kept",
    group: s.group,
    sameModel: s.sameModel,
    score: round(s.score),
    factors: mapFactors(s.factors, round),
    rank: i,
    inBand: band.has(s),
  }));
  return [...keptEntries, ...dropped];
}

/** explain() natijasini qisqa log qatorlariga aylantirish (kalit/sir yo'q — faqat id va sonlar). */
export function formatExplain(entries: readonly ExplainEntry[]): string[] {
  return entries.map((e) =>
    e.verdict === "kept"
      ? `#${e.rank} G${e.group} ${e.provider}:${e.wire} score=${e.score}${e.inBand ? " band" : ""}`
      : `- ${e.provider}${e.wire ? `:${e.wire}` : ""} ${e.reason}${e.detail ? ` (${e.detail})` : ""}`,
  );
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function mapFactors(f: ScoreFactors, fn: (n: number) => number): ScoreFactors {
  return { Q: fn(f.Q), F: fn(f.F), H: fn(f.H), L: fn(f.L), R: fn(f.R), C: fn(f.C), S: fn(f.S), X: fn(f.X) };
}
