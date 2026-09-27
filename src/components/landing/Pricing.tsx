"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, type BillingPeriod } from "@/config/plans";
import { BillingToggle, priceFontSize, priceLabel, usePriceHint } from "@/components/pricing/BillingToggle";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/i18n";
import { planText } from "@/lib/locales/plans";
import { useLang, useT } from "@/store/chat";
import { ctaPrimarySm, ctaSecondarySm } from "./cta";
import { SectionHeading } from "./SectionHeading";
import { useSignedIn } from "./use-signed-in";

/** Free tarifning kunlik xabar chegarasi — matndagi {n}. */
const FREE_DAILY = PLANS.find((p) => p.id === "free")?.limits.messagesPerDay ?? 0;

/** Tanlangan tarif — Dashboard shu kalitni o'qib to'lov oynasini ochadi (RegisterForm ham yozadi). */
const PENDING_PLAN_KEY = "sov-pending-plan";

function rememberPlan(plan: string, period: BillingPeriod) {
  try {
    localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan, period, at: Date.now() }));
  } catch {
    /* saqlab bo'lmadi — oddiy o'tish davom etadi */
  }
}

export function Pricing() {
  const t = useT();
  const lang = useLang();
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const hint = usePriceHint();
  // Kirgan foydalanuvchi /register'ga borsa proxy uni /app ga query'siz yo'naltiradi va
  // tanlangan tarif yo'qolardi — shuning uchun to'g'ridan-to'g'ri /app + tarifni eslab qolamiz.
  const signedIn = useSignedIn();
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading
        id="pricing-title"
        eyebrow={t("navPricing")}
        title={`${t("ldPricingTitle1")} ${t("ldPricingTitle2")}`}
        sub={fmt(t("ldPricingSub"), { n: FREE_DAILY })}
      />
      <FadeIn inView>
        <div className="mt-8 flex justify-center">
          <BillingToggle value={period} onChange={setPeriod} />
        </div>
        <p className="mt-3 text-center text-xs text-text-muted">{t("p7cPricingMethods")}</p>
      </FadeIn>

      <Stagger inView stagger={0.06} className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => {
          const tx = planText(lang, p);
          return (
            <StaggerItem key={p.id} className="h-full">
              <div
                className={cn(
                  "relative flex h-full min-w-0 flex-col rounded-2xl border bg-bg-base p-6 [container-type:inline-size]",
                  p.highlight ? "border-[color-mix(in_srgb,var(--color-primary)_55%,transparent)] bg-bg-elevated" : "border-border",
                )}
                style={p.highlight ? { borderWidth: 2 } : undefined}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                    {t("planPopular")}
                  </span>
                )}
                <div className="text-sm font-semibold text-text-primary">{p.name}</div>
                <div
                  className="font-display nums mt-2 whitespace-nowrap font-extrabold leading-tight tracking-tight text-text-primary"
                  style={{ fontSize: priceFontSize(priceLabel(p, period), 2.25) }}
                >
                  {priceLabel(p, period)}
                  <span className="text-sm font-normal text-text-muted">
                    /{p.price > 0 && period === "year" ? t("ldPerYear") : t("perMonth")}
                  </span>
                </div>
                {p.price > 0 && <p className="mt-1 text-xs text-text-muted">{hint(p, period)}</p>}
                <p className="mt-1 text-sm text-text-secondary">{tx.tagline}</p>
                <p className="mt-3 text-xs text-text-muted">{tx.description}</p>
  
                <ul className="mt-5 flex-1 space-y-2 text-sm text-text-secondary">
                  {tx.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-text-muted" strokeWidth={2} aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
  
                <Link
                  href={
                    p.price === 0
                      ? signedIn
                        ? "/app"
                        : "/register"
                      : `${signedIn ? "/app" : "/register"}?plan=${p.id}&period=${period}`
                  }
                  onClick={p.price > 0 ? () => rememberPlan(p.id, period) : undefined}
                  className={cn("mt-6 w-full", p.highlight ? ctaPrimarySm : ctaSecondarySm)}
                >
                  {p.price > 0
                    ? fmt(t("ldSelectPlan"), { plan: p.name })
                    : signedIn
                      ? t("backToChat")
                      : t("startFree")}
                </Link>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}
