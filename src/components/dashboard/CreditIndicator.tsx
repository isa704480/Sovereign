"use client";

import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { creditLevel, CREDIT_LABEL, type CreditLevel, type Plan } from "@/config/plans";
import { pick } from "@/lib/i18n";
import { CREDIT_TEXT } from "@/lib/locales/plans";
import { useLang, useT } from "@/store/chat";

/** Daraja ranglari — holat tokenlari (reja ranglari emas). */
const LEVEL_COLOR: Record<CreditLevel, string> = {
  full: "var(--t-success, #10D4A0)",
  high: "var(--t-success, #10D4A0)",
  mid: "var(--t-warning, #F59E0B)",
  low: "var(--t-warning, #F59E0B)",
  empty: "var(--t-danger, #EF4444)",
};

interface CreditIndicatorProps {
  plan: Plan;
  onUpgrade: () => void;
}

/**
 * Kredit ko'rsatkichi — Claude uslubida:
 * - Aniq TOKEN sonini KO'RSATMAYDI
 * - Faqat progress bar + "Ko'p / O'rtacha / Kam / Tugadi" so'zli daraja
 * - Foydalanuvchi qancha token qolganini bila olmaydi (business decision)
 */
export function CreditIndicator({ plan, onUpgrade }: CreditIndicatorProps) {
  const t = useT();
  const lang = useLang();
  const [ratio, setRatio] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/credits", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { ratio: number };
        if (!alive) return;
        setRatio(typeof j.ratio === "number" ? j.ratio : 0);
        setLoaded(true);
      } catch {
        /* ignore */
      }
    }
    load();
    const t = setInterval(load, 45000); // har 45 sekundda yangilash
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!loaded) return null;
  if (plan.id === "ultra") return null; // Ultra da limit juda katta, indikator kerak emas

  // Ratio = used/limit, remaining = 1 - ratio
  const remainingRatio = Math.max(0, 1 - ratio);
  const used = Math.round(ratio * plan.limits.tokensPerMonth); // faqat funktsiyaga uzatish uchun
  const level = creditLevel(used, plan);
  const color = LEVEL_COLOR[level];
  const label = pick(lang, CREDIT_TEXT[level]) || CREDIT_LABEL[level];

  const pct = Math.round(remainingRatio * 100);
  return (
    <div
      className="tt flex items-center gap-2 rounded-full border px-2 py-1.5 sm:gap-3 sm:px-3.5"
      style={{ borderColor: "var(--t-border)" }}
    >
      <Zap className="size-3.5 shrink-0" style={{ color }} aria-hidden />
      <div className="hidden text-xs font-medium sm:block" style={{ color: "var(--t-text)" }}>
        {label}
      </div>
      <div
        role="meter"
        aria-label={t("p21CreditsLeft")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={label}
        className="relative h-1.5 w-10 overflow-hidden rounded-full sm:w-20"
        style={{ background: "color-mix(in srgb, var(--t-text) 12%, transparent)" }}
      >
        <div
          className="tt absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(4, pct)}%`,
            background: color,
          }}
        />
      </div>
      {(level === "low" || level === "empty") && (
        <button
          type="button"
          onClick={onUpgrade}
          className="hidden min-h-8 items-center text-xs font-medium hover:underline sm:inline-flex"
          style={{ color: "var(--t-accent-text)" }}
        >
          {t("upgrade")}
        </button>
      )}
    </div>
  );
}
