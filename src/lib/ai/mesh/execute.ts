import "server-only";
/**
 * Provider Mesh — bajaruvchi (executor). Web chat (`meshStream`, SSE → StreamEvent) va
 * CLI/Cowork (`meshComplete`, bitta JSON, tool-calling) BIR XIL algoritm bilan ishlaydi:
 *
 *   1. health.snapshot → scheduler.plan → tartiblangan nomzodlar (docs/MESH.md §4–5);
 *   2. har nomzod: adapter.endpoint + transformBody → fetch;
 *   3. xato → adapter.classifyError → health.record (+ onFailure) → qoida bo'yicha (§7):
 *        transient        — shu nomzod bir marta 250–750 ms jitter bilan (taymaut — qayta urinilmaydi), keyin keyingisi;
 *        affordTokens     — shu nomzod bir marta kamroq max_tokens bilan;
 *        bad_request      — provayderga xos bo'lishi mumkin: sog'liq o'zgarmaydi, KEYINGI provayder;
 *                           ikkinchi, boshqa provayder ham bad_request desa — zanjir TO'XTAYDI;
 *        context_length   — zanjir TO'XTAYDI (so'rovning o'zi yaroqsiz; scope "model" — faqat shu nomzod);
 *        unsupported      — imkoniyat yo'q (tools): shu nomzod o'tkaziladi, sog'liq o'zgarmaydi, xotirada o'rganiladi;
 *        boshqalar        — darhol keyingi nomzod (scope "provider" bo'lsa — shu provayderning
 *                           qolgan nomzodlari ham shu so'rovda o'tkazib yuboriladi; pool — shu hovuz takliflari);
 *   4. failover faqat birinchi mazmunli bayt (matn/reasoning) chiqquncha — keyin xato hodisasi;
 *      umumiy muddat (web ~100 s, CLI 55 s): har urinish taymauti = min(taymaut, qolgan vaqt);
 *   5. halol "served" (§8): readServedModel(birinchi bo'lak) ?? displayId(wire);
 *   6. muvaffaqiyat/latency — birinchi mazmunli baytda; kunlik birlik (Limits.unit) — javob oxirida;
 *   7. foydalanuvchi to'xtatsa (AbortSignal) — xato emas: sog'liq yozilmaydi, abort qayta otiladi.
 *
 * Tarmoqdan boshqa hamma narsa `deps` orqali almashtiriladi (testda soxta fetch/health/plan).
 * health.ts / scheduler.ts / registry.ts kechiktirib (dinamik) yuklanadi — testlar ularsiz ham ishlaydi.
 * Test: npx tsx --conditions=react-server src/lib/ai/mesh/execute.test.ts
 */
import { DEFAULT_LANG, translate, type Lang, type TKey } from "@/lib/i18n";
import type { StreamEvent } from "../providers";
import { jsonCompletionToChunk } from "../cloudflare";
import { modelAllowedIn } from "../region";
import { isSubstitution } from "../served";
import { learnMissingCapability } from "./caps";
import { keyFingerprint } from "./fingerprint";
import {
  MESH_TUNING,
  type Attempt,
  type Candidate,
  type ChatBody,
  type ClassifiedError,
  type ErrorKind,
  type HealthSnapshot,
  type ModelOffer,
  type ProviderAdapter,
  type ProviderId,
  type RouteRequest,
  type ServedInfo,
} from "./types";

/* ------------------------------------------------------------------ */
/* Taymautlar (providers.ts bilan bir xil qiymatlar)                    */
/* ------------------------------------------------------------------ */

/** Javob sarlavhalari (birinchi bayt) kelguncha. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Rescue shlyuzlar — zanjir maxDuration ichida tugashi uchun qisqaroq. */
const RESCUE_CONNECT_TIMEOUT_MS = 20_000;
/** Oqimsiz so'rov: sarlavhalar butun javob tayyor bo'lgach keladi. */
const NON_STREAM_TIMEOUT_MS = 90_000;
/** Oqim bo'laklari orasidagi eng uzun jimlik. */
const IDLE_TIMEOUT_MS = 45_000;
/** Uzilgan (finish_reason: "length") javobni avtomatik davom ettirish soni. */
const MAX_CONTINUATIONS = 4;
/** "can only afford N" → max_tokens = max(AFFORD_MIN, N - AFFORD_MARGIN). */
const AFFORD_MIN = 256;
const AFFORD_MARGIN = 64;

const CONTINUE_PROMPT =
  "Javobing token chegarasiga yetib yarim uzilib qoldi. AYNAN uzilgan belgidan davom ettir. " +
  "Salomlashma, oldingi qismni takrorlama, izoh yozma — to'g'ridan-to'g'ri davomini yoz. " +
  "Kod blokining o'rtasida uzilgan bo'lsang, yangi ``` ochma — kodning davomini yoz.";

class UpstreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

/* ------------------------------------------------------------------ */
/* Bog'liqliklar (testda almashtiriladi)                                */
/* ------------------------------------------------------------------ */

export interface MeshDeps {
  /** Yoqilgan adapterlar (standart: registry.enabledAdapters). */
  adapters(): ProviderAdapter[];
  /** Sog'liq surati (standart: health.snapshot — MGET + 5 s kesh). */
  snapshot(adapters: ProviderAdapter[]): Promise<HealthSnapshot>;
  /** Tartiblangan nomzodlar (standart: scheduler.planCandidates). */
  plan(req: RouteRequest, adapters: ProviderAdapter[], health: HealthSnapshot): Candidate[];
  /**
   * Urinish natijasini yozish (standart: health.record, fire-and-forget). `units` — Limits.unit bo'yicha;
   * `perModel` — Limits.perModel (usage kaliti mesh:usage:<provider>:<wire>:<day>).
   */
  record(attempt: Attempt, units?: number, opts?: { perModel?: boolean }): Promise<void> | void;
  /**
   * Faqat kunlik birlik (oqim oxirida; muvaffaqiyat birinchi baytda `record` bilan yozilgan).
   * Standart: health.recordUsage. Berilmasa — birlik yozilmaydi.
   */
  recordUsage?(provider: ProviderId, wire: string, units: number, opts: { perModel: boolean; ephemeral: boolean }): Promise<void> | void;
  /**
   * half_open nomzod uchun yagona sinov (probe) lock'i. false — boshqa instansiya sinayapti,
   * nomzod o'tkazib yuboriladi. Berilmasa — hamma nomzodga ruxsat.
   */
  claim?(c: Candidate, adapter: ProviderAdapter, health: HealthSnapshot): Promise<boolean>;
  fetch: typeof fetch;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  rng(): number;
  now(): number;
}

type CoreDeps = Pick<MeshDeps, "adapters" | "snapshot" | "plan" | "record" | "recordUsage" | "claim">;

let defaultsPromise: Promise<CoreDeps> | null = null;

/** health/scheduler/registry — faqat kerak bo'lganda (testda soxta deps bo'lsa umuman yuklanmaydi). */
function loadDefaults(): Promise<CoreDeps> {
  defaultsPromise ??= (async () => {
    const [health, scheduler, registry] = await Promise.all([
      import("./health"),
      import("./scheduler"),
      import("./registry"),
    ]);
    const core: CoreDeps = {
      adapters: () => registry.enabledAdapters(),
      snapshot: (adapters) => health.snapshot(adapters),
      plan: (req, adapters, snap) => scheduler.planCandidates(req, adapters, snap),
      record: (attempt, units, opts) => health.record(attempt, units, opts),
      recordUsage: (provider, wire, units, opts) => health.recordUsage(provider, units, { wire, ...opts }),
      claim: async (c, adapter, snap) => {
        // Provayder kaliti va (perModel yoki model scope) model kaliti — qaysi biri half_open bo'lsa, o'shaning lock'i.
        const now = Date.now();
        const keys = [health.healthKey(adapter.id), health.healthKey(adapter.id, c.offer.wire)];
        for (const key of keys) {
          const h = snap.get(key);
          if (h && health.effectiveState(h, now) === "half_open" && !(await health.acquireProbe(key))) return false;
        }
        return true;
      },
    };
    return core;
  })();
  return defaultsPromise;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

async function resolveDeps(partial?: Partial<MeshDeps>): Promise<MeshDeps> {
  const p = partial ?? {};
  const needCore = !p.adapters || !p.snapshot || !p.plan || !p.record;
  const core = needCore ? await loadDefaults() : null;
  return {
    adapters: p.adapters ?? core!.adapters,
    snapshot: p.snapshot ?? core!.snapshot,
    plan: p.plan ?? core!.plan,
    record: p.record ?? core!.record,
    // Soxta record berilgan bo'lsa standart usage yozuvi ishlatilmaydi (aralash deps).
    recordUsage: p.recordUsage ?? (needCore && !p.record ? core!.recordUsage : undefined),
    // Soxta plan berilgan bo'lsa standart probe lock ishlatilmaydi (aralash deps — kutilmagan holat).
    claim: p.claim ?? (needCore ? core!.claim : undefined),
    fetch: p.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)),
    sleep: p.sleep ?? defaultSleep,
    rng: p.rng ?? Math.random,
    now: p.now ?? Date.now,
  };
}

/* ------------------------------------------------------------------ */
/* Kirish / chiqish tiplari                                            */
/* ------------------------------------------------------------------ */

/**
 * model'siz tana. `Omit<ChatBody, "model">` indeks imzosi tufayli nomli maydonlarni yo'qotadi —
 * shuning uchun ular qayta e'lon qilinadi (ChatBody bilan mos).
 */
export type MeshBody = Omit<ChatBody, "model"> & {
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
};

interface CommonInput {
  req: RouteRequest;
  /** model'siz tana: messages, temperature, max_tokens, tools, tool_choice ... (model = offer.wire). */
  body: MeshBody;
  signal?: AbortSignal;
  /** Nomzodlar (birinchi baytgacha). Standart: web 5, CLI 7 (MESH_TUNING). */
  maxAttempts?: number;
  /** Har urinish yozuvi (server logi / shadow rejim solishtiruvi uchun). */
  onAttempt?(attempt: Attempt): void;
  /**
   * Umumiy muddat (epoch ms, deps.now() shkalasida). Standart: web now+100 s, CLI now+55 s.
   * Muddat tugagach yangi urinish boshlanmaydi; har urinish taymauti = min(taymaut, qolgan vaqt).
   */
  deadline?: number;
  deps?: Partial<MeshDeps>;
}

export interface MeshStreamInput extends CommonInput {
  lang?: Lang;
  /** finish_reason "length" bo'lsa avtomatik davom ettirish soni (standart 4; 0 — o'chiq). */
  maxContinuations?: number;
}

export type MeshCompleteInput = CommonInput;

export interface MeshUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

export type MeshCompleteResult =
  | {
      ok: true;
      /** Upstream JSON (Cloudflare `result` o'rami ochilgan). */
      json: unknown;
      /** choices[0].message — tool_calls bilan birga, o'zgartirilmagan. */
      message: unknown;
      finishReason: string | null;
      usage?: MeshUsage;
      provider: ProviderId;
      /** Halol served model (readServedModel ?? displayId(wire)). */
      model: string;
      /** Aynan so'ralgan model javob berdi. */
      sameModel: boolean;
      served: ServedInfo;
      attempts: Attempt[];
    }
  | {
      ok: false;
      /** Tavsiya etilgan HTTP status (400 so'rov aybi, 429 band, 502 provayderlar, 503 nomzod yo'q). */
      status: number;
      error: ClassifiedError | null;
      attempts: Attempt[];
    };

/* ------------------------------------------------------------------ */
/* Yordamchilar                                                        */
/* ------------------------------------------------------------------ */

type Chunk = {
  model?: unknown;
  usage?: unknown;
  choices?: {
    delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown };
    finish_reason?: string | null;
  }[];
  error?: { message?: string; code?: number | string } | string;
};

/** So'rov aybi yoki imkoniyat mos kelmasligi — sog'liq o'zgarmaydi, onFailure chaqirilmaydi. */
const NO_HEALTH_KINDS: ReadonlySet<ErrorKind> = new Set(["bad_request", "context_length", "unsupported"]);

const errText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 300);

function displayIdOf(adapter: ProviderAdapter, wire: string): string {
  try {
    return adapter.displayId?.(wire) ?? wire;
  } catch {
    return wire;
  }
}

/** §2.1 jadvalining minimal nusxasi — adapter.classifyError otib yuborsa (hech qachon yiqilmasin). */
function fallbackClassify(status: number, body: string): ClassifiedError {
  const message = `${status} ${body}`.slice(0, 500);
  if (status === 0 || status >= 500) return { kind: "transient", message };
  if (status === 402 || /can only afford|insufficient|credits|billing|balance/i.test(body)) {
    const m = /can only afford (\d+)/i.exec(body);
    return { kind: "no_credit", message, ...(m ? { affordTokens: Number(m[1]) } : {}) };
  }
  if (status === 429) return { kind: /per day|daily|4006|neurons/i.test(body) ? "quota_exhausted" : "rate_limited", message };
  if (status === 401 || status === 403) return { kind: "auth", message };
  if (status === 404) return { kind: "unavailable", scope: "model", message };
  if (status === 413 || /context length|maximum context|too many tokens/i.test(body)) return { kind: "context_length", message };
  if (status === 400 || status === 422) return { kind: "bad_request", message };
  return { kind: "transient", message };
}

function classify(adapter: ProviderAdapter, status: number, body: string, headers: Headers): ClassifiedError {
  try {
    return adapter.classifyError(status, body, headers);
  } catch (err) {
    console.error(`[mesh] ${adapter.id} classifyError otdi:`, errText(err));
    return fallbackClassify(status, body);
  }
}

function isTimeout(err: unknown): boolean {
  return err instanceof UpstreamTimeoutError || (err instanceof Error && (err.name === "UpstreamTimeoutError" || err.name === "TimeoutError"));
}

/** Tarmoq xatosi / taymaut — execute o'zi "transient" deb oladi (types.ts classifyError izohi). Taymaut qayta urinilmaydi. */
const networkError = (err: unknown): ClassifiedError => ({
  kind: "transient",
  message: errText(err),
  ...(isTimeout(err) ? { timeout: true } : {}),
});

/** Umumiy muddat tugadi — yangi urinish yo'q. */
const deadlineError = (): ClassifiedError => ({ kind: "transient", timeout: true, message: "umumiy muddat tugadi" });

/** Oxirgi xato turi → foydalanuvchi tilidagi umumiy xabar (xom matn faqat logda). */
function friendlyKey(kind: ErrorKind | undefined): TKey {
  switch (kind) {
    case "rate_limited":
    case "quota_exhausted":
      return "chErrModelBusy";
    case "no_credit":
    case "auth":
      return "chErrServerConfig";
    case "bad_request":
    case "context_length":
    case "unsupported":
      return "chErrRequestFailed";
    default:
      return "chErrProviderTemporary";
  }
}

function completeStatus(kind: ErrorKind | undefined): number {
  switch (kind) {
    case "bad_request":
      return 400;
    case "context_length":
      return 413;
    case "rate_limited":
    case "quota_exhausted":
      return 429;
    default:
      return 502;
  }
}

function jitter(rng: () => number): number {
  const [lo, hi] = MESH_TUNING.retryBackoffMs;
  return Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, rng())));
}

/**
 * fetch + taymaut. `holdTimer` = false — taymaut faqat sarlavhalar kelguncha (oqimni idle taymer
 * kuzatadi); true — tana o'qilguncha ham (oqimsiz JSON), qaytgan `done()` bilan tozalanadi.
 */
async function timedFetch(
  deps: MeshDeps,
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ res: Response; signal: AbortSignal; done(): void }> {
  const ctl = new AbortController();
  const timer = setTimeout(
    () => ctl.abort(new UpstreamTimeoutError(`upstream ${timeoutMs}ms ichida javob bermadi`)),
    timeoutMs,
  );
  const merged = signal ? AbortSignal.any([signal, ctl.signal]) : ctl.signal;
  try {
    const res = await deps.fetch(url, { ...init, signal: merged });
    return { res, signal: merged, done: () => clearTimeout(timer) };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** SSE tanasi → `data:` JSON obyektlari (providers.ts readSse porti, idle taymaut bilan). */
async function* readSse(body: ReadableStream<Uint8Array>, idleMs: number): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UpstreamTimeoutError(`oqim ${idleMs}ms jim qoldi`)), idleMs);
      });
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([reader.read(), idle]);
      } finally {
        clearTimeout(timer);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as Record<string, unknown>;
        } catch {
          // qisman / keep-alive qator
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Javob: SSE yoki (oqimsiz model) bitta JSON → bitta SSE bo'lagi shakli (providers.ts readChunks porti). */
async function* readChunks(res: Response, idleMs = IDLE_TIMEOUT_MS): AsyncGenerator<Record<string, unknown>> {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json") && !type.includes("event-stream")) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error("upstream JSON javobi o'qilmadi");
    }
    const errorChunk = body && typeof body === "object" && "error" in body ? (body as Record<string, unknown>) : null;
    const chunk = jsonCompletionToChunk(body);
    if (chunk) yield chunk as unknown as Record<string, unknown>;
    else if (errorChunk) yield errorChunk;
    return;
  }
  if (!res.body) return;
  yield* readSse(res.body, idleMs);
}

/** `<think>...</think>` → reasoning (teg ikki bo'lak orasida bo'linsa ham — providers.ts splitThink porti). */
class ThinkSplitter {
  private thinking = false;
  private pending = "";

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  push(text: string, flush = false): StreamEvent[] {
    this.pending += text;
    const out: StreamEvent[] = [];
    for (;;) {
      if (!this.thinking) {
        const i = this.pending.indexOf("<think>");
        if (i === -1) {
          const keep = flush ? 0 : 7;
          const safe = this.pending.length > keep ? this.pending.slice(0, this.pending.length - keep) : "";
          if (safe) {
            out.push({ type: "text", text: safe });
            this.pending = this.pending.slice(safe.length);
          }
          break;
        }
        if (i > 0) out.push({ type: "text", text: this.pending.slice(0, i) });
        this.pending = this.pending.slice(i + 7);
        this.thinking = true;
      } else {
        const j = this.pending.indexOf("</think>");
        if (j === -1) {
          const keep = flush ? 0 : 8;
          const safe = this.pending.length > keep ? this.pending.slice(0, this.pending.length - keep) : "";
          if (safe) {
            out.push({ type: "reasoning", text: safe });
            this.pending = this.pending.slice(safe.length);
          }
          break;
        }
        if (j > 0) out.push({ type: "reasoning", text: this.pending.slice(0, j) });
        this.pending = this.pending.slice(j + 8);
        this.thinking = false;
      }
    }
    return out;
  }

  flush(): StreamEvent[] {
    return this.push("", true);
  }
}

function chunkError(c: Chunk): { message: string; code: number } | null {
  if (!c.error) return null;
  if (typeof c.error === "string") return { message: c.error, code: 0 };
  if (!c.error.message) return null;
  const code = typeof c.error.code === "number" ? c.error.code : Number(c.error.code) || 0;
  return { message: c.error.message, code };
}

function parseUsage(u: unknown): MeshUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const o = u as Record<string, unknown>;
  const p = Number(o.prompt_tokens ?? o.input_tokens);
  const c = Number(o.completion_tokens ?? o.output_tokens);
  if (!Number.isFinite(p) && !Number.isFinite(c)) return undefined;
  const prompt = Number.isFinite(p) ? p : 0;
  const completion = Number.isFinite(c) ? c : 0;
  const t = Number(o.total_tokens);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: Number.isFinite(t) ? t : prompt + completion };
}

/** Token taxmini (usage kelmasa): ~4 belgi = 1 token. */
const estTokens = (chars: number) => Math.ceil(chars / 4);

function messagesChars(messages: unknown[]): number {
  let n = 0;
  for (const m of messages) {
    const content = (m as { content?: unknown })?.content;
    n += typeof content === "string" ? content.length : JSON.stringify(content ?? "").length;
  }
  return n;
}

/** Kunlik kvota birligi (Limits.unit, docs/MESH.md §6): requests 1, tokens jami, neurons offer narxi, credits hisoblanmaydi. */
function unitsFor(adapter: ProviderAdapter, offer: ModelOffer, usage: MeshUsage): number | undefined {
  switch (adapter.limits.unit) {
    case "requests":
      return 1;
    case "tokens":
      return usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens;
    case "neurons": {
      const n = offer.neuronsPerM;
      if (!n) return undefined;
      return Math.ceil((usage.prompt_tokens * n.in + usage.completion_tokens * n.out) / 1_000_000);
    }
    default:
      return undefined;
  }
}

/**
 * Upstream haqiqatda qaysi model bilan javob berdi (§8): readServedModel(bo'lak/JSON) →
 * readServedFromHeaders (OmniRoute X-OmniRoute-*) → aggregator'ning `model` maydoni → displayId(wire).
 * Upstream aynan biz yuborgan wire id'ni qaytarsa — displayId shakli ("@cf/..." → "cloudflare/@cf/..."),
 * shunda badge va region tekshiruvi har doim bir xil (provayder prefiksli) id bilan ishlaydi.
 */
function servedModelOf(adapter: ProviderAdapter, wire: string, chunkOrJson: unknown, headers?: Headers): string {
  let reported: string | null = null;
  try {
    reported = adapter.readServedModel?.(chunkOrJson) ?? null;
  } catch {
    reported = null;
  }
  if (!reported && headers && adapter.readServedFromHeaders) {
    try {
      reported = adapter.readServedFromHeaders(headers);
    } catch {
      reported = null;
    }
  }
  // readServedModel yozilmagan aggregator — hech bo'lmasa javobdagi `model` maydoni (halollik uchun).
  if (!reported && !adapter.readServedModel && adapter.aggregator) {
    const m = (chunkOrJson as { model?: unknown } | null)?.model;
    if (typeof m === "string" && m.trim()) reported = m.trim().slice(0, 120);
  }
  if (!reported || reported.toLowerCase() === wire.toLowerCase()) return displayIdOf(adapter, wire);
  return reported;
}

/**
 * Xato butun zanjirni DARHOL to'xtatadimi: faqat context_length (so'rov aybi). Istisno: scope
 * "model" context_length (Groq tekin TPM "Request too large") — faqat shu nomzodning cheklovi.
 * bad_request bu yerda emas: u provayderga xos bo'lishi mumkin (BadRequestGate).
 */
function stopsChain(error: ClassifiedError): boolean {
  return error.kind === "context_length" && error.scope !== "model";
}

/** So'rov aybi / imkoniyat mos kelmasligi (sog'liq o'zgarmaydi, onFailure chaqirilmaydi). */
const requestFault = (error: ClassifiedError) => NO_HEALTH_KINDS.has(error.kind);

/**
 * bad_request qoidasi: birinchisi — provayderga xos deb olinadi (keyingi provayder, sog'liq
 * o'zgarmaydi); ikkinchi, BOSHQA provayder ham bad_request desa — so'rovning o'zi yaroqsiz, to'xtaydi.
 */
class BadRequestGate {
  private first: ProviderId | null = null;
  /** true — zanjirni to'xtatish kerak. */
  hit(provider: ProviderId): boolean {
    if (this.first && this.first !== provider) return true;
    this.first ??= provider;
    return false;
  }
}

/**
 * Xato butun provayderga tegishlimi (web chat route keyingi nomzodlarda uni `exclude` qiladi):
 * so'rov aybi, model/hovuz scope va unavailable — yo'q.
 */
export function providerWideFailure(error: ClassifiedError): boolean {
  if (requestFault(error) || error.pool || error.kind === "unavailable") return false;
  if (error.kind === "auth") return true;
  return (error.scope ?? "provider") === "provider";
}

/**
 * Hovuz xatosi taklifning o'z hovuziga mos kelmasa:
 *  - tekin (:free) modelga "kredit yo'q" ($paid) — hisob butunlay bloklangan: butun provayder;
 *  - pullik modelga "kunlik tekin limit" ($free) — upstream'ning shu modeldagi limiti: faqat shu model.
 */
function normalizePool(c: Candidate, error: ClassifiedError): ClassifiedError {
  if (!error.pool) return error;
  const own = c.offer.cost === "free" ? "free" : "paid";
  if (error.pool === own) return error;
  const out: ClassifiedError = { ...error, scope: error.pool === "paid" ? "provider" : "model" };
  delete out.pool;
  return out;
}

/** Statik offers'da yo'q (resolve) wire — model-scope sog'liq faqat instansiya xotirasida. */
function isEphemeral(adapter: ProviderAdapter, offer: ModelOffer): boolean {
  try {
    return !adapter.offers.some((o) => o.wire === offer.wire);
  } catch {
    return true;
  }
}

/** Kalit barmoq izi — faqat auth xatosida (blokni shu kalitga bog'lash uchun). */
function keyFpOf(ep: Endpoint): string | undefined {
  try {
    return keyFingerprint(ep.headers);
  } catch {
    return undefined;
  }
}

/**
 * Halol "substituted": nomzod aynan so'ralgan model bo'lsa ham, upstream (aggregator) boshqa
 * modelga yo'naltirgan bo'lishi mumkin — served id offer'ning biror id'siga mos kelishi shart.
 */
function servedInfo(c: Candidate, adapter: ProviderAdapter, req: RouteRequest, model: string): ServedInfo {
  const rescue = adapter.rescue === true;
  let substituted: boolean;
  if (!req.sovereignModelId) substituted = rescue;
  else if (!c.sameModel || rescue) substituted = true;
  else {
    const known = [req.sovereignModelId, c.offer.wire, displayIdOf(adapter, c.offer.wire), ...c.offer.sovereignIds];
    substituted = !known.some((id) => id === model || !isSubstitution(id, model));
  }
  return { provider: adapter.id, model, substituted, ...(rescue ? { rescue: true } : {}) };
}

function buildBody(
  adapter: ProviderAdapter,
  offer: ModelOffer,
  base: MeshBody,
  stream: boolean,
  maxTokens: number | undefined,
): ChatBody {
  const body: ChatBody = { ...base, model: offer.wire, stream };
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (!stream) delete body.stream_options;
  if (!adapter.transformBody) return body;
  try {
    return adapter.transformBody(body, offer);
  } catch (err) {
    console.error(`[mesh] ${adapter.id} transformBody otdi:`, errText(err));
    return body;
  }
}

type Endpoint = { url: string; headers: Record<string, string> };

function endpointOf(adapter: ProviderAdapter): Endpoint | null {
  try {
    return adapter.endpoint();
  } catch (err) {
    // Kalit/URL noto'g'ri sozlangan — sog'liq yozilmaydi (bu provayder aybi emas), nomzod o'tkaziladi.
    console.error(`[mesh] ${adapter.id} endpoint() otdi:`, errText(err));
    return null;
  }
}

function notifyFailure(adapter: ProviderAdapter, status: number, error: ClassifiedError): void {
  try {
    adapter.onFailure?.(status, error);
  } catch {
    /* onFailure hech qachon so'rovni yiqitmaydi */
  }
}

/** Fire-and-forget — sog'liq yozuvi javobni kutdirmaydi va hech qachon otmaydi. */
function safeRecord(deps: MeshDeps, adapter: ProviderAdapter, attempt: Attempt, units?: number): void {
  try {
    const p = deps.record(attempt, units, { perModel: adapter.limits.perModel === true });
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Kunlik birlik (oqim oxirida) — fire-and-forget. */
function safeUsage(deps: MeshDeps, adapter: ProviderAdapter, c: Candidate, units: number | undefined, ephemeral: boolean): void {
  if (!deps.recordUsage || !units || !(units > 0)) return;
  try {
    const p = deps.recordUsage(c.provider, c.offer.wire, units, { perModel: adapter.limits.perModel === true, ephemeral });
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Yiqilgan urinish yozuvi: dinamik wire va (auth bo'lsa) kalit barmoq izi bilan. */
function failedAttempt(c: Candidate, error: ClassifiedError, ephemeral: boolean, ep: Endpoint): Attempt {
  const fp = error.kind === "auth" ? keyFpOf(ep) : undefined;
  return {
    provider: c.provider,
    wire: c.offer.wire,
    ok: false,
    error,
    ...(ephemeral ? { ephemeral: true } : {}),
    ...(fp ? { keyFp: fp } : {}),
  };
}

/** unsupported → shu instansiyada o'rganiladi (scheduler keyingi so'rovda tanlamaydi). */
function learnFrom(c: Candidate, error: ClassifiedError): void {
  if (error.kind !== "unsupported") return;
  try {
    learnMissingCapability(c.provider, c.offer.wire, error.capability ?? "tools");
  } catch {
    /* ignore */
  }
}

/**
 * Nomzodlar oqimi: plan tartibida, shu so'rovda yiqilgan provayder/model o'tkazib yuboriladi,
 * protokoli qo'llanmaydigan va probe lock'ini ololmagan nomzodlar ham.
 */
class Chain {
  private readonly failedProviders = new Set<ProviderId>();
  private readonly failedKeys = new Set<string>();
  private readonly failedPools = new Set<string>();
  private readonly seen = new Set<string>();

  constructor(
    private readonly deps: MeshDeps,
    private readonly candidates: Candidate[],
    private readonly byId: Map<ProviderId, ProviderAdapter>,
    private readonly health: HealthSnapshot,
  ) {}

  private blocked(c: Candidate): boolean {
    const pool = c.offer.cost === "free" ? "free" : "paid";
    return (
      this.failedProviders.has(c.provider) ||
      this.failedKeys.has(`${c.provider}|${c.offer.wire}`) ||
      this.failedPools.has(`${c.provider}|${pool}`)
    );
  }

  async *iterate(): AsyncGenerator<{ c: Candidate; adapter: ProviderAdapter; ep: Endpoint }> {
    let yielded = 0;
    /** half_open probe lock'ini ololmagan nomzodlar (plan tartibida). */
    const locked: { c: Candidate; adapter: ProviderAdapter }[] = [];
    for (const c of this.candidates) {
      const adapter = this.byId.get(c.provider);
      if (!adapter) continue;
      const key = `${c.provider}|${c.offer.wire}`;
      if (this.seen.has(key) || this.blocked(c)) continue;
      this.seen.add(key);
      if ((adapter.protocol ?? "openai-chat") !== "openai-chat") {
        // Perplexity /v1/responses — mesh executor hali qo'llamaydi (providers.ts streamPerplexity).
        continue;
      }
      if (this.deps.claim) {
        let ok = true;
        try {
          ok = await this.deps.claim(c, adapter, this.health);
        } catch {
          ok = true;
        }
        if (!ok) {
          locked.push({ c, adapter });
          continue;
        }
      }
      const ep = endpointOf(adapter);
      if (!ep) continue;
      yielded++;
      yield { c, adapter, ep };
    }
    // Hech narsa sinalmadi, chunki hamma nomzodning probe lock'i band (boshqa instansiyalar sinayapti) —
    // foydalanuvchini javobsiz qoldirmaslik uchun eng yaxshisi baribir sinaladi.
    if (yielded === 0) {
      for (const { c, adapter } of locked) {
        if (this.blocked(c)) continue;
        const ep = endpointOf(adapter);
        if (!ep) continue;
        yield { c, adapter, ep };
        return;
      }
    }
  }

  fail(c: Candidate, error: ClassifiedError): void {
    if (error.pool) this.failedPools.add(`${c.provider}|${error.pool}`);
    else if ((error.scope ?? "provider") === "provider" && error.kind !== "unsupported") this.failedProviders.add(c.provider);
    else this.failedKeys.add(`${c.provider}|${c.offer.wire}`);
  }
}

async function prepare(input: CommonInput, deps: MeshDeps) {
  const adapters = deps.adapters();
  let health: HealthSnapshot = new Map();
  try {
    health = await deps.snapshot(adapters);
  } catch (err) {
    console.error("[mesh] sog'liq surati o'qilmadi:", errText(err));
  }
  const exclude = input.req.exclude ?? [];
  const candidates = deps.plan(input.req, adapters, health).filter((c) => !exclude.includes(c.provider));
  const byId = new Map(adapters.map((a) => [a.id, a] as const));
  return { adapters, health, candidates, chain: new Chain(deps, candidates, byId, health) };
}

function logAttempt(input: CommonInput, attempt: Attempt, attempts: Attempt[]): void {
  attempts.push(attempt);
  try {
    input.onAttempt?.(attempt);
  } catch {
    /* ignore */
  }
  if (!attempt.ok && attempt.error) {
    const e = attempt.error;
    const log = e.kind === "auth" ? console.error : console.warn;
    log(`[mesh] ${attempt.provider} (${attempt.wire}) ${e.kind}: ${e.message.slice(0, 300)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Web: oqim (StreamEvent)                                             */
/* ------------------------------------------------------------------ */

type StreamOutcome =
  | { ok: true; finish: string | null; text: string; usage: MeshUsage; ttfbMs: number }
  | { ok: false; status: number; error: ClassifiedError; emitted: boolean; text: string };

/**
 * Bitta nomzodga bitta so'rov: oqim hodisalarini chiqaradi, natijani qaytaradi. "served" faqat
 * birinchi MAZMUNLI hodisadan oldin (va faqat `announce` bo'lsa) — yiqilgan nomzodning served'i
 * foydalanuvchiga yetib bormaydi. `onFirstByte` — birinchi mazmunli baytda (muvaffaqiyat shu
 * paytda yoziladi: uzun oqim tugashini kutmasdan yarim-ochiq provayder yopiladi).
 */
async function* streamOnce(
  deps: MeshDeps,
  input: MeshStreamInput,
  c: Candidate,
  adapter: ProviderAdapter,
  ep: Endpoint,
  messages: unknown[],
  maxTokens: number | undefined,
  announce: boolean,
  remainingMs: number,
  onFirstByte: (ttfbMs: number) => void,
): AsyncGenerator<StreamEvent, StreamOutcome> {
  const wantStream = input.req.needs.stream !== false && c.offer.caps.stream;
  const body = buildBody(adapter, c.offer, { ...input.body, messages }, wantStream, maxTokens);
  const streaming = body.stream === true;
  const base = !streaming ? NON_STREAM_TIMEOUT_MS : adapter.rescue ? RESCUE_CONNECT_TIMEOUT_MS : CONNECT_TIMEOUT_MS;
  const timeout = Math.max(1, Math.min(base, remainingMs));
  const started = deps.now();

  let res: Response;
  let done: () => void;
  try {
    ({ res, done } = await timedFetch(
      deps,
      ep.url,
      { method: "POST", headers: { "Content-Type": "application/json", ...ep.headers }, body: JSON.stringify(body) },
      input.signal,
      timeout,
    ));
  } catch (err) {
    if (input.signal?.aborted) throw err;
    return { ok: false, status: 0, error: networkError(err), emitted: false, text: "" };
  }
  done();

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: classify(adapter, res.status, text, res.headers), emitted: false, text: "" };
  }

  const think = new ThinkSplitter();
  let emitted = false;
  let text = "";
  let finish: string | null = null;
  let usage: MeshUsage | undefined;
  let served: ServedInfo | null = null;
  let ttfbMs = 0;

  const emit = function* (events: StreamEvent[]): Generator<StreamEvent> {
    for (const ev of events) {
      if (!emitted) {
        emitted = true;
        ttfbMs = deps.now() - started;
        try {
          onFirstByte(ttfbMs);
        } catch {
          /* sog'liq yozuvi hech qachon oqimni yiqitmaydi */
        }
        if (announce && served) {
          if (!modelAllowedIn(served.model, input.req.country)) {
            console.warn(
              `[region] upstream cheklangan modelga yo'naltirdi: ${c.offer.wire} → ${served.model} (${input.req.country})`,
            );
          }
          yield { type: "served", model: served.model, substituted: served.substituted, ...(served.rescue ? { rescue: true } : {}) };
        }
      }
      if (ev.type === "text") text += ev.text;
      yield ev;
    }
  };

  try {
    for await (const raw of readChunks(res)) {
      const chunk = raw as Chunk;
      const cerr = chunkError(chunk);
      if (cerr) {
        // Oqim ichidagi xato (status 200 + tana) — adapter tasniflaydi; HTTP kodi tanada bo'lsa o'sha.
        const status = cerr.code >= 400 && cerr.code < 600 ? cerr.code : res.status;
        const error = classify(adapter, status, JSON.stringify(raw), res.headers);
        if (think.hasPending && emitted) yield* emit(think.flush());
        return { ok: false, status, error, emitted, text };
      }
      if (!served && chunk.choices?.length) {
        served = servedInfo(c, adapter, input.req, servedModelOf(adapter, c.offer.wire, raw, res.headers));
      }
      const u = parseUsage(chunk.usage);
      if (u) usage = u;
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      const reason = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
      if (typeof reason === "string" && reason) yield* emit([{ type: "reasoning", text: reason }]);
      const content = choice?.delta?.content;
      if (typeof content === "string" && content) yield* emit(think.push(content));
    }
  } catch (err) {
    if (input.signal?.aborted) throw err;
    if (emitted && think.hasPending) yield* emit(think.flush());
    return { ok: false, status: 0, error: networkError(err), emitted, text };
  }
  if (think.hasPending) yield* emit(think.flush());

  if (!emitted) {
    // 200, lekin hech qanday mazmun yo'q — provayder nosozligi (keyingi nomzod).
    return { ok: false, status: res.status, error: { kind: "transient", message: "bo'sh javob" }, emitted: false, text };
  }
  const promptTokens = estTokens(messagesChars(messages));
  return {
    ok: true,
    finish,
    text,
    ttfbMs,
    usage: usage ?? { prompt_tokens: promptTokens, completion_tokens: estTokens(text.length), total_tokens: promptTokens + estTokens(text.length) },
  };
}

/**
 * Web chat: mesh orqali oqim. Hodisalar providers.ts StreamEvent bilan bir xil
 * (served → reasoning/text ... → done | error). Foydalanuvchi to'xtatsa — abort xatosi qayta otiladi
 * (providers.ts kabi; chat route jim yopadi).
 */
export async function* meshStream(input: MeshStreamInput): AsyncGenerator<StreamEvent> {
  const deps = await resolveDeps(input.deps);
  const lang = input.lang ?? DEFAULT_LANG;
  const maxAttempts = input.maxAttempts ?? MESH_TUNING.maxAttemptsWeb;
  const maxContinuations = input.maxContinuations ?? MAX_CONTINUATIONS;
  const deadline = input.deadline ?? deps.now() + MESH_TUNING.webDeadlineMs;
  const remaining = () => deadline - deps.now();
  const attempts: Attempt[] = [];
  const { adapters, candidates, chain } = await prepare(input, deps);

  if (!candidates.length) {
    yield { type: "error", message: translate(lang, adapters.length ? "chErrModelBusy" : "chErrServerConfig") };
    return;
  }

  const badRequest = new BadRequestGate();
  let lastKind: ErrorKind | undefined;
  let tried = 0;
  for await (const { c, adapter, ep } of chain.iterate()) {
    if (tried >= maxAttempts) break;
    if (remaining() <= 0) {
      lastKind = lastKind ?? deadlineError().kind;
      break;
    }
    tried++;
    const ephemeral = isEphemeral(adapter, c.offer);
    let messages = input.body.messages;
    let maxTokens = input.body.max_tokens;
    let transientLeft: number = MESH_TUNING.transientRetries;
    let affordUsed = false;
    let continuation = 0;
    let announced = false;
    let answer = "";
    const firstByte = (ttfbMs: number) => {
      const ok: Attempt = { provider: c.provider, wire: c.offer.wire, ok: true, ttfbMs, ...(ephemeral ? { ephemeral: true } : {}) };
      safeRecord(deps, adapter, ok);
    };

    for (;;) {
      if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
      const out = yield* streamOnce(deps, input, c, adapter, ep, messages, maxTokens, !announced, remaining(), firstByte);

      if (out.ok) {
        announced = true;
        answer += out.text;
        const attempt: Attempt = { provider: c.provider, wire: c.offer.wire, ok: true, ttfbMs: out.ttfbMs, ...(ephemeral ? { ephemeral: true } : {}) };
        logAttempt(input, attempt, attempts);
        safeUsage(deps, adapter, c, unitsFor(adapter, c.offer, out.usage), ephemeral);
        // Uzilgan javob — O'SHA nomzodda davom ettiriladi (yarmi boshqa modeldan kelmasin); muddat qolgan bo'lsa.
        if (out.finish === "length" && answer.trim() && continuation < maxContinuations && remaining() > 0) {
          continuation++;
          messages = [...input.body.messages, { role: "assistant", content: answer }, { role: "user", content: CONTINUE_PROMPT }];
          transientLeft = MESH_TUNING.transientRetries;
          continue;
        }
        yield { type: "done" };
        return;
      }

      const { status } = out;
      const error = normalizePool(c, out.error);
      if (out.emitted) announced = true;
      // "can only afford N" — shu nomzod bir marta kamroq max_tokens bilan (sog'liq yozilmaydi).
      if (!out.emitted && error.affordTokens !== undefined && !affordUsed) {
        affordUsed = true;
        maxTokens = Math.max(AFFORD_MIN, error.affordTokens - AFFORD_MARGIN);
        continue;
      }
      lastKind = error.kind;
      const attempt = failedAttempt(c, error, ephemeral, ep);
      logAttempt(input, attempt, attempts);
      // bad_request / context_length / unsupported — so'rov aybi yoki imkoniyat: sog'liq o'zgarmaydi.
      if (!requestFault(error)) {
        safeRecord(deps, adapter, attempt);
        notifyFailure(adapter, status, error);
      }
      learnFrom(c, error);
      const retryable = error.kind === "transient" && !error.timeout && transientLeft > 0 && remaining() > 0;
      // Matn chiqa boshlagan (yoki davom ettirish) — boshqa provayderga o'tilmaydi.
      if (out.emitted || announced) {
        if (!out.emitted && retryable) {
          transientLeft--;
          await deps.sleep(jitter(deps.rng), input.signal);
          continue;
        }
        yield { type: "error", message: translate(lang, friendlyKey(error.kind)) };
        return;
      }
      if (stopsChain(error)) {
        yield { type: "error", message: translate(lang, friendlyKey(error.kind)) };
        return;
      }
      if (error.kind === "bad_request") {
        // Ikkinchi, boshqa provayder ham rad etdi — so'rovning o'zi yaroqsiz.
        if (badRequest.hit(c.provider)) {
          yield { type: "error", message: translate(lang, friendlyKey(error.kind)) };
          return;
        }
        chain.fail(c, { ...error, scope: "provider" });
        break;
      }
      if (retryable) {
        transientLeft--;
        await deps.sleep(jitter(deps.rng), input.signal);
        continue;
      }
      chain.fail(c, error);
      break;
    }
  }
  yield { type: "error", message: translate(lang, friendlyKey(lastKind)) };
}

/* ------------------------------------------------------------------ */
/* CLI: bitta JSON (tool-calling)                                       */
/* ------------------------------------------------------------------ */

type CompleteOutcome =
  | { ok: true; json: Record<string, unknown>; ttfbMs: number; headers: Headers }
  | { ok: false; status: number; error: ClassifiedError };

async function completeOnce(
  deps: MeshDeps,
  input: MeshCompleteInput,
  c: Candidate,
  adapter: ProviderAdapter,
  ep: Endpoint,
  maxTokens: number | undefined,
  remainingMs: number,
): Promise<CompleteOutcome> {
  const body = buildBody(adapter, c.offer, input.body, false, maxTokens);
  // Oqimsiz nomzod: transformBody stream'ni qaytadan yoqmasin.
  body.stream = false;
  const started = deps.now();
  let fetched: Awaited<ReturnType<typeof timedFetch>>;
  try {
    fetched = await timedFetch(
      deps,
      ep.url,
      { method: "POST", headers: { "Content-Type": "application/json", ...ep.headers }, body: JSON.stringify(body) },
      input.signal,
      Math.max(1, Math.min(NON_STREAM_TIMEOUT_MS, remainingMs)),
    );
  } catch (err) {
    if (input.signal?.aborted) throw err;
    return { ok: false, status: 0, error: networkError(err) };
  }
  const { res } = fetched;
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    fetched.done();
    if (input.signal?.aborted) throw err;
    return { ok: false, status: 0, error: networkError(err) };
  }
  fetched.done();
  if (!res.ok) return { ok: false, status: res.status, error: classify(adapter, res.status, text, res.headers) };

  let json: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    // Cloudflare native o'rami: { result: { choices ... } }.
    const inner = parsed.result && typeof parsed.result === "object" ? (parsed.result as Record<string, unknown>) : null;
    json = inner && Array.isArray(inner.choices) ? inner : parsed;
  } catch {
    return { ok: false, status: res.status, error: { kind: "transient", message: "upstream JSON o'qilmadi" } };
  }
  const cerr = chunkError(json as Chunk);
  if (cerr) {
    const status = cerr.code >= 400 && cerr.code < 600 ? cerr.code : res.status;
    return { ok: false, status, error: classify(adapter, status, text, res.headers) };
  }
  const choices = json.choices as { message?: unknown }[] | undefined;
  if (!Array.isArray(choices) || !choices[0]?.message) {
    return { ok: false, status: res.status, error: { kind: "transient", message: "javobda choices yo'q" } };
  }
  return { ok: true, json, ttfbMs: deps.now() - started, headers: res.headers };
}

/**
 * CLI/Cowork: mesh orqali bitta (oqimsiz) completion. `tools`/`tool_choice` o'zgarmasdan uzatiladi,
 * javobdagi `message` (tool_calls bilan) ham. Failover qoidalari meshStream bilan bir xil.
 * Foydalanuvchi to'xtatsa — abort xatosi qayta otiladi.
 */
export async function meshComplete(input: MeshCompleteInput): Promise<MeshCompleteResult> {
  const deps = await resolveDeps(input.deps);
  const maxAttempts = input.maxAttempts ?? MESH_TUNING.maxAttemptsCli;
  const deadline = input.deadline ?? deps.now() + MESH_TUNING.cliDeadlineMs;
  const remaining = () => deadline - deps.now();
  const attempts: Attempt[] = [];
  const req: RouteRequest = { ...input.req, needs: { ...input.req.needs, stream: false } };
  const { candidates, chain } = await prepare({ ...input, req }, deps);
  if (!candidates.length) return { ok: false, status: 503, error: null, attempts };

  const badRequest = new BadRequestGate();
  let lastError: ClassifiedError | null = null;
  let tried = 0;
  for await (const { c, adapter, ep } of chain.iterate()) {
    if (tried >= maxAttempts) break;
    if (remaining() <= 0) {
      lastError ??= deadlineError();
      break;
    }
    tried++;
    const ephemeral = isEphemeral(adapter, c.offer);
    let maxTokens = input.body.max_tokens;
    let transientLeft: number = MESH_TUNING.transientRetries;
    let affordUsed = false;
    for (;;) {
      if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
      const out = await completeOnce(deps, { ...input, req }, c, adapter, ep, maxTokens, remaining());
      if (out.ok) {
        const usage = parseUsage(out.json.usage);
        const attempt: Attempt = { provider: c.provider, wire: c.offer.wire, ok: true, ttfbMs: out.ttfbMs, ...(ephemeral ? { ephemeral: true } : {}) };
        logAttempt(input, attempt, attempts);
        const promptTokens = estTokens(messagesChars(input.body.messages));
        safeRecord(deps, adapter, attempt);
        safeUsage(deps, adapter, c, unitsFor(adapter, c.offer, usage ?? { prompt_tokens: promptTokens, completion_tokens: 0 }), ephemeral);
        const served = servedInfo(c, adapter, req, servedModelOf(adapter, c.offer.wire, out.json, out.headers));
        if (!modelAllowedIn(served.model, req.country)) {
          console.warn(`[region] upstream cheklangan modelga yo'naltirdi: ${c.offer.wire} → ${served.model} (${req.country})`);
        }
        const choice = (out.json.choices as { message?: unknown; finish_reason?: unknown }[])[0];
        return {
          ok: true,
          json: out.json,
          message: choice.message,
          finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
          usage,
          provider: c.provider,
          model: served.model,
          sameModel: !served.substituted,
          served,
          attempts,
        };
      }
      const { status } = out;
      const error = normalizePool(c, out.error);
      if (error.affordTokens !== undefined && !affordUsed) {
        affordUsed = true;
        maxTokens = Math.max(AFFORD_MIN, error.affordTokens - AFFORD_MARGIN);
        continue;
      }
      lastError = error;
      const attempt = failedAttempt(c, error, ephemeral, ep);
      logAttempt(input, attempt, attempts);
      if (stopsChain(error)) return { ok: false, status: completeStatus(error.kind), error, attempts };
      if (!requestFault(error)) {
        safeRecord(deps, adapter, attempt);
        notifyFailure(adapter, status, error);
      }
      learnFrom(c, error);
      if (error.kind === "bad_request") {
        // Ikkinchi, boshqa provayder ham rad etdi — so'rovning o'zi yaroqsiz (400).
        if (badRequest.hit(c.provider)) return { ok: false, status: completeStatus(error.kind), error, attempts };
        chain.fail(c, { ...error, scope: "provider" });
        break;
      }
      if (error.kind === "transient" && !error.timeout && transientLeft > 0 && remaining() > 0) {
        transientLeft--;
        await deps.sleep(jitter(deps.rng), input.signal);
        continue;
      }
      chain.fail(c, error);
      break;
    }
  }
  return { ok: false, status: completeStatus(lastError?.kind), error: lastError, attempts };
}

/** Testlar uchun ichki yordamchilar (API emas). */
export const __test = { ThinkSplitter, fallbackClassify, servedInfo, servedModelOf, stopsChain, unitsFor, providerWideFailure, normalizePool };
