import type { Metadata } from "next";
import { DocsContent, type DocsData } from "@/components/docs/DocsContent";
import { isModelVisible, MODELS } from "@/config/models";
import { formatPrice, formatRub, PLANS, planPrice, planPriceRub, TIER_ORDER, type ModelTier } from "@/config/plans";

/*
 * docs.soveregn.xyz — static documentation (src/proxy.ts rewrites the docs host
 * to /docs). Must stay STATIC: no cookies / headers / searchParams. Text is
 * rendered by the client component in the visitor's language (4 languages,
 * src/lib/locales/p7-b.ts); prices, limits and model lists come from src/config
 * at build time so they never drift.
 */

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "SOVEREIGN AI documentation: getting started, models and plans, features, the sov CLI, the desktop app, billing, privacy and FAQ.",
  alternates: { canonical: "https://docs.soveregn.xyz" },
  openGraph: {
    title: "SOVEREIGN AI Documentation",
    description: "Guides for the SOVEREIGN multi-model AI chat, CLI and desktop app.",
    url: "https://docs.soveregn.xyz",
    siteName: "SOVEREIGN",
    type: "website",
  },
};

/** Daily image limits — mirrors IMAGES_PER_DAY in src/app/api/image/route.ts. */
const IMAGES_PER_DAY: Record<string, number> = { free: 3, starter: 15, pro: 60, ultra: 200 };
/** Relative monthly allowance (plans.ts: 150k / 450k / 1.5M / 3M tokens). */
const ALLOWANCE: Record<string, string> = { free: "1×", starter: "3×", pro: "10×", ultra: "20×" };
const TIER_NAME: Record<ModelTier, string> = { free: "Free", starter: "Basic", pro: "Pro", ultra: "Ultra" };

function buildDocsData(): DocsData {
  const visible = MODELS.filter(isModelVisible);
  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    name: TIER_NAME[tier],
    models: visible.filter((m) => m.tier === tier).map((m) => m.name),
  }));
  return {
    modelCountRounded: Math.floor(visible.length / 10) * 10,
    freeModelCount: tiers.find((x) => x.tier === "free")?.models.length ?? 0,
    tiers,
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      paid: p.price > 0,
      monthly: p.price ? `$${formatPrice(planPrice(p, "month"))}` : "$0",
      yearly: p.price ? `$${formatPrice(planPrice(p, "year"))}` : "—",
      sbpMonthly: planPriceRub(p, "month") ? formatRub(planPriceRub(p, "month")) : "—",
      allowance: ALLOWANCE[p.id] ?? "—",
      messagesPerDay: p.limits.messagesPerDay.toLocaleString("en-US"),
      maxTokensK: Math.round(p.limits.maxTokens / 1024),
      imagesPerDay: IMAGES_PER_DAY[p.id] ?? 0,
      fullCode: Boolean(p.limits.fullCode),
      research: Boolean(p.limits.research),
      deepResearch: Boolean(p.limits.deepResearch),
      priority: Boolean(p.limits.priority),
    })),
  };
}

export default function DocsPage() {
  return <DocsContent data={buildDocsData()} />;
}
