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

export function Pricing() {
  const t = useT();
  const lang = useLang();
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const hint = usePriceHint();
  return (
    <section id="pricing" className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-28">
      <FadeIn inView>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("navPricing")}</p>
        <h2 className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-extrabold tracking-tight text-text-primary md:text-5xl">
          {t("ldPricingTitle1")} <span className="text-gradient-brand">{t("ldPricingTitle2")}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-base text-text-secondary">{t("ldPricingSub")}</p>
        <div className="mt-8 flex justify-center">
          <BillingToggle value={period} onChange={setPeriod} />
        </div>
      </FadeIn>

      <Stagger inView stagger={0.06} className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => {
          const tx = planText(lang, p);
          return (
            <StaggerItem key={p.id} className="h-full">
              <div
                className={cn(
                  "relative flex h-full min-w-0 flex-col rounded-2xl border bg-white/[0.015] p-6 transition-colors duration-300 [container-type:inline-size]",
                  p.highlight ? "border-[color-mix(in_srgb,var(--color-primary)_55%,transparent)] bg-white/[0.03]" : "border-border hover:border-white/15",
                )}
                style={p.highlight ? { borderWidth: 2 } : undefined}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    {t("planPopular")}
                  </span>
                )}
                <div className="text-sm font-semibold text-text-primary">{p.name}</div>
                <div
                  className="font-display nums mt-2 whitespace-nowrap font-extrabold leading-tight tracking-tight text-text-primary"
                  style={{ fontSize: priceFontSize(priceLabel(p, period), 2.25) }}
                >
                  {p.price === 0 ? "0" : priceLabel(p, period)}
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
                      <Check className="mt-0.5 size-4 shrink-0 text-primary-soft" strokeWidth={2} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
  
                <Link
                  href="/register"
                  className={cn(
                    "mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5",
                    p.highlight ? "bg-primary text-white" : "border border-border text-text-primary hover:border-white/20",
                  )}
                >
                  {p.price === 0 ? t("startFree") : fmt(t("ldSelectPlan"), { plan: p.name })}
                </Link>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}
