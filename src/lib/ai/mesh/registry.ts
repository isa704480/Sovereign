/**
 * Provider Mesh registri — barcha adapterlar bitta ro'yxatda. Scheduler va execute
 * provayderlarni faqat shu yerdan oladi (providers.ts / CLI route o'z ro'yxatini tutmaydi).
 * Har adapter o'z faylida: ./providers/<id>.ts, eksport nomi `<id>Adapter`.
 * Env o'qiladi (enabled/endpoint), lekin import paytida hech narsa chaqirilmaydi — testda xavfsiz.
 */
import { PROVIDER_IDS, type ProviderAdapter, type ProviderId } from "./types";
import { groqAdapter } from "./providers/groq";
import { cloudflareAdapter } from "./providers/cloudflare";
import { openrouterAdapter } from "./providers/openrouter";
import { omnirouteAdapter } from "./providers/omniroute";
import { llm7Adapter } from "./providers/llm7";
import { mistralAdapter } from "./providers/mistral";
import { nvidiaAdapter } from "./providers/nvidia";
import { cerebrasAdapter } from "./providers/cerebras";
import { sambanovaAdapter } from "./providers/sambanova";
import { rsiAdapter } from "./providers/rsi";
import { gatewayAdapter } from "./providers/gateway";
import { experientialAdapter } from "./providers/experiential";
import { openaiAdapter } from "./providers/openai";
import { tellaAdapter } from "./providers/tella";
import { perplexityAdapter } from "./providers/perplexity";

/** id → adapter. Record tipi har ProviderId uchun adapter borligini kompilyatsiyada tekshiradi. */
export const ADAPTER_BY_ID: Record<ProviderId, ProviderAdapter> = {
  groq: groqAdapter,
  cloudflare: cloudflareAdapter,
  openrouter: openrouterAdapter,
  omniroute: omnirouteAdapter,
  llm7: llm7Adapter,
  mistral: mistralAdapter,
  nvidia: nvidiaAdapter,
  cerebras: cerebrasAdapter,
  sambanova: sambanovaAdapter,
  rsi: rsiAdapter,
  gateway: gatewayAdapter,
  experiential: experientialAdapter,
  openai: openaiAdapter,
  tella: tellaAdapter,
  perplexity: perplexityAdapter,
};

export const ADAPTERS: readonly ProviderAdapter[] = PROVIDER_IDS.map((id) => ADAPTER_BY_ID[id]);

/** Kaliti sozlangan (enabled) adapterlar. Har chaqiruvda env qayta o'qiladi (env testda o'zgarishi mumkin). */
export function enabledAdapters(): ProviderAdapter[] {
  return ADAPTERS.filter((a) => {
    try {
      return a.enabled();
    } catch {
      // Adapter env'ni noto'g'ri o'qisa ham butun mesh yiqilmasin.
      return false;
    }
  });
}

export function adapterFor(id: ProviderId): ProviderAdapter {
  return ADAPTER_BY_ID[id];
}
