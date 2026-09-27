/**
 * Provider Mesh — so'rovni (web chat / CLI) mesh RouteRequest'ga aylantirish va rejim bayrog'i.
 * PURE (faqat `meshMode` env o'qiydi): tarmoq, Redis yo'q — testda xavfsiz.
 *
 * Rejim (`SOVEREIGN_MESH`, docs/MESH.md §11):
 *   on     (standart) — web chat va CLI mesh orqali ishlaydi;
 *   shadow — eski zanjir ishlaydi, mesh rejasi faqat server logiga yoziladi (solishtirish);
 *   off    — eski zanjir (favqulodda qaytarish uchun).
 *
 * Test: npx tsx --conditions=react-server src/lib/ai/mesh/request.test.ts
 */
import { minTier, modelTierFor } from "./tier";
import type { PlanTier, ProviderAdapter, RouteRequest } from "./types";

export { modelTierFor, requiredPlanTier } from "./tier";

export type MeshMode = "on" | "shadow" | "off";

export function meshMode(): MeshMode {
  const v = (process.env.SOVEREIGN_MESH ?? "").trim().toLowerCase();
  if (v === "off" || v === "0" || v === "false" || v === "legacy") return "off";
  if (v === "shadow") return "shadow";
  return "on";
}

/** Xabarlarda rasm (image_url qismi) bormi — `needs.vision`. */
export function hasImageInput(messages: readonly unknown[]): boolean {
  return messages.some((m) => {
    const content = (m as { content?: unknown } | null)?.content;
    return (
      Array.isArray(content) &&
      content.some((p) => !!p && typeof p === "object" && (p as { type?: unknown }).type === "image_url")
    );
  });
}

/**
 * Web chat (providers.ts streamCompletion) so'rovi.
 *
 * Tarif: `planTier` — foydalanuvchining haqiqiy tarifi (chat route uzatadi; berilmasa — model
 * tarifi yoki "free"). Aynan so'ralgan model (G0): max(model tarifi, offer tarifi) ≤ planTier
 * (upstream nomi bilan so'ralgan Ultra model Pro'ga, ":free" modelning pullik varianti Free'ga
 * berilmaydi). O'rinbosarlar (G1) narxi so'ralgan modelning o'z tarifidan oshmaydi (eski
 * `cloudflareRoute({ tier })` narx nazorati); katalogga mos kelmaydigan id — o'rinbosarlar faqat tekin.
 *
 * O'z modelimiz (Tella): faqat o'zi — o'rinbosar ham, rescue ham yo'q.
 */
export function webRouteRequest(opts: {
  modelId: string;
  messages: readonly unknown[];
  country: string | null | undefined;
  freeRescue?: boolean;
  ownModel?: boolean;
  /** Foydalanuvchi tarifi (chat route: plan.id). */
  planTier?: PlanTier;
  /** Shu so'rovda (oldingi nomzodlarda) yiqilgan provayderlar. */
  exclude?: RouteRequest["exclude"];
}): RouteRequest {
  const tier = modelTierFor(opts.modelId);
  const own = opts.ownModel === true;
  const plan = opts.planTier ?? tier ?? "free";
  return {
    sovereignModelId: opts.modelId,
    ...(tier ? { modelTier: tier } : {}),
    planTier: plan,
    substituteTier: minTier(plan, tier ?? "free"),
    ...(opts.exclude?.length ? { exclude: [...opts.exclude] } : {}),
    needs: { stream: true, vision: hasImageInput(opts.messages) },
    country: opts.country ?? null,
    ...(own ? { sameModelOnly: true } : {}),
    allowRescue: !own && opts.freeRescue !== false,
  };
}

/**
 * CLI/Cowork (api/cli/chat) so'rovi. `chosen` — foydalanuvchi tanlagan model (route Pro+ yoki
 * "auto/*" darvozasidan o'tkazgan); bo'lmasa kod-agent uchun "code" sinfi. Tool'li so'rovda
 * rescue (LLM7 va h.k. — tool qo'llamaydi) ishlatilmaydi.
 */
export function cliRouteRequest(opts: {
  chosen?: string;
  planTier: PlanTier;
  country: string | null;
  tools: boolean;
  messages: readonly unknown[];
}): RouteRequest {
  const base: RouteRequest = {
    planTier: opts.planTier,
    needs: { tools: opts.tools, stream: false, vision: hasImageInput(opts.messages) },
    country: opts.country,
    allowRescue: !opts.tools,
  };
  if (!opts.chosen) return { ...base, class: "code" };
  const tier = modelTierFor(opts.chosen);
  return { ...base, sovereignModelId: opts.chosen, ...(tier ? { modelTier: tier } : {}) };
}

/**
 * Umumiy chat uchun ishlatsa bo'ladigan adapter: rescue emas (oxirgi chora emas), OpenAI-mos
 * protokol va kamida bitta o'rinbosar bo'la oladigan taklifi bor (Tella/Perplexity — yo'q).
 */
export function isGeneralAdapter(a: ProviderAdapter): boolean {
  if (a.rescue || (a.protocol ?? "openai-chat") !== "openai-chat") return false;
  try {
    return a.offers.some((o) => o.substitutable !== false);
  } catch {
    return false;
  }
}
