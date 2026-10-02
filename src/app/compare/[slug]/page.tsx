import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { SlugCompareView } from "./SlugCompareView";

/**
 * /compare/[slug] — SEO-yo'naltirilgan taqqoslash sahifalari.
 *
 * Slug formati: {model-a}-vs-{model-b}
 * Misol: /compare/chatgpt-vs-claude
 *        /compare/gemini-vs-chatgpt
 *        /compare/deepseek-vs-claude
 *
 * Sovereign javobini har doim "birinchi o'rinda" ko'rsatish uchun emas —
 * balki foydalanuvchi qidiruv natijasida kelib, modellarni solishtira olishi
 * va Sovereign da ishlata olishi uchun.
 *
 * i18n: URL inglizcha (SEO), tarkib foydalanuvchi tiliga qarab (client component).
 */

// ── Taqqoslanishi mumkin bo'lgan modellar ────────────────────────────────────

export interface ModelSlug {
  id: string;
  /** URL segmentida ishlatiladigan slug (kichik harf, tire) */
  slug: string;
  /** Ko'rinadigan nom */
  name: string;
  /** Qisqa tavsif (meta description uchun) */
  tagline: string;
  /** Sovereign da sovereign model ID */
  sovereignId?: string;
  /** Brend rangi */
  color: string;
  /** Brend (OpenAI, Anthropic, ...) */
  provider: string;
}

export const COMPARE_MODELS: ModelSlug[] = [
  { id: "chatgpt",   slug: "chatgpt",   name: "ChatGPT (GPT-4o)",        tagline: "OpenAI's flagship multimodal model",        sovereignId: "gpt-4o",              color: "#10A37F", provider: "OpenAI"    },
  { id: "claude",    slug: "claude",    name: "Claude Sonnet",            tagline: "Anthropic's balanced reasoning model",       sovereignId: "claude-sonnet-4-5",    color: "#D97757", provider: "Anthropic" },
  { id: "gemini",    slug: "gemini",    name: "Gemini 2.5 Flash",         tagline: "Google's fast multimodal model",             sovereignId: "gemini-3-5-flash",     color: "#4285F4", provider: "Google"    },
  { id: "deepseek",  slug: "deepseek",  name: "DeepSeek V4",              tagline: "Fast and affordable Chinese AI model",       sovereignId: "deepseek-v4-flash",    color: "#5786FE", provider: "DeepSeek"  },
  { id: "llama",     slug: "llama",     name: "LLaMA 3.3 70B",            tagline: "Meta's open-source powerhouse",              sovereignId: "llama-3-3-70b",        color: "#7C3AED", provider: "Meta"      },
  { id: "mistral",   slug: "mistral",   name: "Mistral Large",            tagline: "European open-weight model",                 sovereignId: "mistral-large-2",      color: "#FF7000", provider: "Mistral"   },
  { id: "grok",      slug: "grok",      name: "Grok 4",                   tagline: "xAI's conversational model with web access", sovereignId: "grok-4-3",             color: "#8E8E93", provider: "xAI"       },
  { id: "perplexity",slug: "perplexity",name: "Perplexity Sonar",         tagline: "AI search with cited sources",               sovereignId: "sonar-online",         color: "#1FB8CD", provider: "Perplexity"},
  { id: "qwen",      slug: "qwen",      name: "Qwen 3.7",                 tagline: "Alibaba's multilingual model",               sovereignId: "qwen3-7-flash",        color: "#6950EF", provider: "Alibaba"   },
  { id: "kimi",      slug: "kimi",      name: "Kimi K2",                  tagline: "Moonshot's long-context model",              sovereignId: "mars-kimi-k2-6",       color: "#00C4CC", provider: "Moonshot"  },
];

// ── Ruxsat etilgan juftliklar ─────────────────────────────────────────────────

/** Juft: kichik → katta slug tartibida (URL canonical uchun) */
function canonical(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function parseSlug(slug: string): { modelA: ModelSlug; modelB: ModelSlug } | null {
  // "chatgpt-vs-claude" formatini ajratish
  const vsIndex = slug.indexOf("-vs-");
  if (vsIndex === -1) return null;
  const slugA = slug.slice(0, vsIndex);
  const slugB = slug.slice(vsIndex + 4);
  const modelA = COMPARE_MODELS.find((m) => m.slug === slugA);
  const modelB = COMPARE_MODELS.find((m) => m.slug === slugB);
  if (!modelA || !modelB || modelA.id === modelB.id) return null;
  return { modelA, modelB };
}

// ── Static params (build vaqtida) ─────────────────────────────────────────────

export function generateStaticParams() {
  const pairs: { slug: string }[] = [];
  for (let i = 0; i < COMPARE_MODELS.length; i++) {
    for (let j = i + 1; j < COMPARE_MODELS.length; j++) {
      const [a, b] = canonical(COMPARE_MODELS[i].slug, COMPARE_MODELS[j].slug);
      pairs.push({ slug: `${a}-vs-${b}` });
    }
  }
  return pairs;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return { title: "Model Comparison — SOVEREIGN AI" };

  const { modelA, modelB } = parsed;
  const [first, second] = slug.indexOf(modelA.slug) < slug.indexOf(modelB.slug)
    ? [modelA, modelB] : [modelB, modelA];

  const title = `${first.name} vs ${second.name} — Which AI is better? | SOVEREIGN`;
  const description =
    `Compare ${first.name} and ${second.name} side by side: speed, quality, price, and use cases. ` +
    `Try both models instantly in SOVEREIGN — no separate subscriptions.`;

  return {
    title,
    description,
    alternates: { canonical: `/compare/${slug}` },
    openGraph: {
      title,
      description,
      url: `/compare/${slug}`,
      siteName: "SOVEREIGN AI",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CompareSlugPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();

  return (
    <>
      <Navbar />
      <main id="main-content" className="flex-1">
        <SlugCompareView modelA={parsed.modelA} modelB={parsed.modelB} slug={slug} />
      </main>
      <Footer />
    </>
  );
}
