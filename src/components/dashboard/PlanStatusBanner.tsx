"use client";

import { AlertCircle, Clock, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { EASE } from "@/lib/motion";
import { useT } from "@/store/chat";

interface PlanStatusBannerProps {
  planState: "free" | "active" | "expiring_soon" | "expired";
  daysLeft: number | null;
  planName?: string;
  onUpgrade: () => void;
}

/**
 * Tarif holati banneri — Apple-style unified panel. Faqat expired yoki
 * expiring_soon holatida ko'rinadi. Free/active — hech narsa chiqarmaydi.
 */
export function PlanStatusBanner({ planState, daysLeft, planName, onUpgrade }: PlanStatusBannerProps) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (planState !== "expired" && planState !== "expiring_soon") return null;

  const isExpired = planState === "expired";
  const color = isExpired ? "#EB5A64" : "#F5AA3C";

  const label = isExpired
    ? `${planName || t("yourPlan")} ${t("planExpiredSuffix")}`
    : daysLeft === 0
      ? t("planExpiresToday")
      : `${t("planExpiresInPrefix")} ${daysLeft} ${t("planExpiresInSuffix")}`;

  const cta = isExpired ? t("reactivate") : t("refresh");

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="tt mx-4 mt-4 md:mx-6"
    >
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur"
        style={{
          borderColor: `${color}33`,
          background: `color-mix(in srgb, ${color} 8%, transparent)`,
          color: "var(--t-text)",
        }}
      >
        {isExpired ? (
          <AlertCircle className="size-5 shrink-0" style={{ color }} />
        ) : (
          <Clock className="size-5 shrink-0" style={{ color }} />
        )}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium" style={{ color }}>
            {label}
          </div>
          <div className="text-xs" style={{ color: "var(--t-text-muted)" }}>
            {isExpired ? t("planExpiredDesc") : t("planExpiringDesc")}
          </div>
        </div>

        <button
          type="button"
          onClick={onUpgrade}
          className="rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: color,
            color: "#0A0A0F",
          }}
        >
          {cta}
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full p-1.5 opacity-60 hover:opacity-100"
          aria-label={t("close")}
          style={{ color: "var(--t-text-muted)" }}
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}
