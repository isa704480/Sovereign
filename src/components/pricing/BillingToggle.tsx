"use client";

import type { BillingPeriod, Plan } from "@/config/plans";
import { formatPrice, planPrice } from "@/config/plans";
import { fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";

/** Oylik / Yillik almashtirgich — landing va tarif oynasida bir xil. */
export function BillingToggle({
  value,
  onChange,
  className,
}: {
  value: BillingPeriod;
  onChange: (v: BillingPeriod) => void;
  className?: string;
}) {
  const t = useT();
  const opts: { id: BillingPeriod; label: string }[] = [
    { id: "month", label: t("ldMonthly") },
    { id: "year", label: t("ldYearly") },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("ldBillingPeriod")}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-full p-1", className)}
      style={{ border: "1px solid var(--t-border, rgba(255,255,255,0.1))", background: "rgba(255,255,255,0.03)" }}
    >
      {opts.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              // Tor ekranda (375px, ruscha) ixchamroq — nishon ikki qatorga bo'linmaydi.
              "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors sm:gap-2 sm:px-4",
              on ? "text-white" : "hover:bg-white/5",
            )}
            style={{
              // Landing'da --t-primary yo'q: to'q brend rangi (#5B50F0, oq matn bilan ~5.5:1, WCAG AA).
              background: on ? "var(--t-primary, #5B50F0)" : "transparent",
              color: on ? "#fff" : "var(--t-text-muted, #9BA3CC)",
            }}
          >
            {o.label}
            {o.id === "year" && (
              <span
                className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-normal sm:px-2 sm:tracking-wide"
                // Faol holatda oq ustida oq emas — to'qroq fon (kontrast AA).
                style={{ background: on ? "rgba(0,0,0,0.28)" : "rgba(34,197,94,0.15)", color: on ? "#fff" : "#22C55E" }}
              >
                {t("ldTwoMonthsFree")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Narx ostidagi qator: oylikda "kuniga ~$0.20", yillikda "oyiga $4.99 · yiliga bir marta". */
export function usePriceHint(): (plan: Plan, period: BillingPeriod) => string {
  const t = useT();
  return (plan, period) =>
    period === "year"
      ? fmt(t("ldBilledYearly"), { price: (planPrice(plan, "year") / 12).toFixed(2) })
      : fmt(t("ldPerDay"), { price: (plan.price / 30).toFixed(2) });
}

/**
 * Narx shrifti karta kengligiga moslanadi (karta `[container-type:inline-size]`).
 * "$1099.90" kabi uzun narxlar kichikroq — kartadan chiqib ketmaydi.
 */
export function priceFontSize(label: string, maxRem: number): string {
  return `min(${maxRem}rem, ${label.length >= 8 ? 11.5 : 13.5}cqw)`;
}

/** "$59.90" / "$5.99" */
export function priceLabel(plan: Plan, period: BillingPeriod): string {
  return `$${formatPrice(planPrice(plan, period))}`;
}
