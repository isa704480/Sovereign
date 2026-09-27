/**
 * Provider Mesh — o'rganilgan imkoniyatlar (faqat instansiya xotirasida, Upstash'ga yozilmaydi).
 *
 * Upstream "does not support tools" (OmniRoute) / "No endpoints found that support tool use"
 * (OpenRouter) desa — bu model yo'q emas, faqat imkoniyat mos kelmadi: sog'liq (hamma uchun blok)
 * o'zgarmaydi, lekin shu instansiyada scheduler shu wire'ni tool'li so'rovga boshqa tanlamaydi.
 * PURE (tarmoq/env yo'q); holat — modul darajasidagi Map (TTL + o'lcham chegarasi bilan).
 */
import type { Capabilities, ModelOffer } from "./types";

type Cap = "tools" | "vision";

/** O'rganilgan "yo'q" muddati — upstream model yangilanishi mumkin. */
const LEARN_TTL_MS = 6 * 60 * 60_000;
/** Foydalanuvchi id'lari bilan cheksiz o'smasin. */
const MAX_ENTRIES = 500;

const learned = new Map<string, { tools?: number; vision?: number }>();

const keyOf = (provider: string, wire: string) => `${provider}|${wire}`;

/** Shu provayder/wire `cap` ni qo'llamasligini eslab qolish (TTL 6 soat). */
export function learnMissingCapability(provider: string, wire: string, cap: Cap, now: number = Date.now()): void {
  const k = keyOf(provider, wire);
  if (!learned.has(k) && learned.size >= MAX_ENTRIES) {
    const oldest = learned.keys().next().value;
    if (oldest !== undefined) learned.delete(oldest);
  }
  learned.set(k, { ...learned.get(k), [cap]: now + LEARN_TTL_MS });
}

/** Offer imkoniyatlari + o'rganilgan cheklovlar (muddati o'tganlari hisobga olinmaydi). */
export function effectiveCaps(provider: string, offer: ModelOffer, now: number = Date.now()): Capabilities {
  const e = learned.get(keyOf(provider, offer.wire));
  if (!e) return offer.caps;
  const tools = e.tools !== undefined && e.tools > now ? false : offer.caps.tools;
  const vision = e.vision !== undefined && e.vision > now ? false : offer.caps.vision;
  if (tools === offer.caps.tools && vision === offer.caps.vision) return offer.caps;
  return { ...offer.caps, tools, vision };
}

/** Faqat testlar uchun. */
export function __resetLearnedCaps(): void {
  learned.clear();
}
