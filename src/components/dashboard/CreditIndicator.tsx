"use client";

import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { creditLevel, CREDIT_COLOR, CREDIT_LABEL, PLAN_BY_ID, type Plan } from "@/config/plans";

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
  const color = CREDIT_COLOR[level];
  const label = CREDIT_LABEL[level];

  return (
    <div
      className="tt flex items-center gap-3 rounded-full border px-3.5 py-1.5"
      style={{
        borderColor: `${color}33`,
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      <Zap className="size-3.5" style={{ color }} />
      <div className="hidden text-xs font-medium sm:block" style={{ color }}>
        {label}
      </div>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full" style={{ background: `${color}22` }}>
        <div
          className="tt absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(4, remainingRatio * 100)}%`,
            background: color,
          }}
        />
      </div>
      {(level === "low" || level === "empty") && (
        <button
          type="button"
          onClick={onUpgrade}
          className="text-xs font-medium hover:underline"
          style={{ color }}
        >
          Yangilash →
        </button>
      )}
    </div>
  );
}
