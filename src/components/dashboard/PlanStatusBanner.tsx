"use client";

import { AlertCircle, Clock, RefreshCw, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PLAN_BY_ID, type PlanId } from "@/config/plans";
import { EASE } from "@/lib/motion";
import { fmt, LANGS } from "@/lib/i18n";
import { useLang, useT } from "@/store/chat";

interface PlanStatusBannerProps {
  planState: "free" | "active" | "expiring_soon" | "expired";
  /** Server hisoblagan qolgan kunlar (expiresAt bo'lmasa zaxira). */
  daysLeft: number | null;
  /** plan_expires_at (ISO). Dodo obunasida = keyingi to'lov kuni + 1 kun. */
  expiresAt?: string | null;
  /** Profildagi pullik tarif — muddati o'tgan bo'lsa ham (matn va "Yangilash" uchun). */
  paidPlan?: PlanId;
  /** Karta (Dodo) obunasi — o'zi yangilanadi, ogohlantirish kerak emas. */
  renews?: boolean;
  /** Narxlar oynasini shu tarif bilan ochadi (uzaytirish / qayta yoqish). */
  onRenew: (plan: PlanId) => void;
}

const DAY_MS = 24 * 3600 * 1000;
/** Shuncha kun (kalendar) qolganda ogohlantirish chiqadi. */
const WARN_DAYS = 7;
const STORE_KEY = "sov-plan-banner";

// ── "Hozir" — faqat klientda (SSR/hydration'da 0 → banner chizilmaydi, mismatch yo'q).
let nowCache = 0;
function subscribeNow(cb: () => void) {
  const id = setInterval(() => {
    nowCache = Date.now();
    cb();
  }, 60_000);
  return () => clearInterval(id);
}
const getNow = () => nowCache || (nowCache = Date.now());
const getServerNow = () => 0;

function readSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function markSeen(key: string) {
  try {
    const cutoff = Date.now() - 400 * DAY_MS;
    const next: Record<string, number> = {};
    for (const [k, at] of Object.entries(readSeen())) if (typeof at === "number" && at > cutoff) next[k] = at;
    next[key] = Date.now();
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* private rejim / bloklangan storage — banner shunchaki qayta chiqadi */
  }
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** Kalendar kunlar farqi: 0 = bugun, 1 = ertaga (DST uchun round). */
const calendarDaysUntil = (target: number, now: number) => Math.round((startOfDay(target) - startOfDay(now)) / DAY_MS);
/** Mahalliy kalendar kuni — "bugunga yashirish" ertasi kuni o'z-o'zidan tugaydi. */
const dayKey = (now: number) => String(startOfDay(now));

type View =
  | { kind: "warn"; days: number; exp: number }
  | { kind: "renews"; renewAt: number }
  | { kind: "expired" };

/**
 * Tarif muddati banneri.
 *  - Bir martalik to'lov (RollyPay/kripto/SBP/promo): ≤7 kun qolganda ogohlantirish
 *    (≤3 kun — kuchliroq, ≤1 kun / bugun — qizil) + "Uzaytirish". Kunlik yashiriladi.
 *  - Karta (Dodo) obunasi: "{sana} kuni yangilanadi" — faqat ma'lumot, har davrda bir marta.
 *  - Muddat tugagach: "Free tarifdasiz" — bir marta ko'rsatiladi.
 */
export function PlanStatusBanner({ planState, daysLeft, expiresAt = null, paidPlan = "free", renews = false, onRenew }: PlanStatusBannerProps) {
  const t = useT();
  const lang = useLang();
  const now = useSyncExternalStore(subscribeNow, getNow, getServerNow);
  // Mount paytidagi yashirilganlar (sessiya davomida "bir marta" ko'rsatish uchun o'zgarmaydi).
  const [seenAtMount] = useState(() => (typeof window === "undefined" ? {} : readSeen()));
  const [dismissed, setDismissed] = useState<string | null>(null);

  const planName = paidPlan !== "free" ? PLAN_BY_ID[paidPlan].name : "";
  const exp = expiresAt ? new Date(expiresAt).getTime() : NaN;

  let view: View | null = null;
  let key = "";
  if (now && paidPlan !== "free" && planState !== "free") {
    if (Number.isFinite(exp)) {
      if (exp <= now) {
        view = { kind: "expired" };
        key = `expired:${expiresAt}`;
      } else if (renews && exp - DAY_MS > now) {
        // Dodo: plan_expires_at = keyingi to'lov + 1 kun zaxira.
        const renewAt = exp - DAY_MS;
        if (calendarDaysUntil(renewAt, now) <= WARN_DAYS) {
          view = { kind: "renews", renewAt };
          key = `renews:${expiresAt}`;
        }
      } else {
        // To'lov kuni o'tib ketgan obuna (yechilmadi/bekor) ham shu yerga tushadi.
        const days = calendarDaysUntil(exp, now);
        if (days <= WARN_DAYS) {
          view = { kind: "warn", days, exp };
          key = `warn:${expiresAt}:${dayKey(now)}`;
        }
      }
    } else if (planState === "expired") {
      view = { kind: "expired" };
      key = "expired:unknown";
    } else if (planState === "expiring_soon" && !renews && daysLeft != null) {
      view = { kind: "warn", days: daysLeft, exp: NaN };
      key = `warn:unknown:${dayKey(now)}`;
    }
  }

  const hidden = !view || key === dismissed || key in seenAtMount;

  // "Tugadi" xabari bir marta: ko'rsatilgan zahoti eslab qolinadi (shu sahifada ko'rinib turadi).
  const expiredKey = !hidden && view?.kind === "expired" ? key : null;
  useEffect(() => {
    if (expiredKey) markSeen(expiredKey);
  }, [expiredKey]);

  if (hidden || !view) return null;

  const locale = LANGS.find((l) => l.id === lang)?.htmlLang ?? "en";
  const fmtDate = (ms: number) => {
    try {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(ms);
    } catch {
      return new Date(ms).toLocaleDateString();
    }
  };

  let color: string;
  let title: string;
  let desc: string;
  let cta: string | null;
  let Icon = Clock;
  if (view.kind === "expired") {
    color = "#EB5A64";
    Icon = AlertCircle;
    title = fmt(t("subEndedTitle"), { plan: planName });
    desc = fmt(t("subEndedDesc"), { plan: planName });
    cta = t("subRenew");
  } else if (view.kind === "renews") {
    color = "var(--t-accent, #7C6FF7)";
    Icon = RefreshCw;
    title = fmt(t("subRenewsOn"), { plan: planName, date: fmtDate(view.renewAt) });
    desc = t("subRenewsDesc");
    cta = null;
  } else {
    const d = view.days;
    color = d <= 1 ? "#EB5A64" : d <= 3 ? "#F5873C" : "#F5AA3C";
    if (d <= 1) Icon = AlertCircle;
    title =
      d <= 0
        ? fmt(t("subEndsToday"), { plan: planName })
        : d === 1
          ? fmt(t("subEndsTomorrow"), { plan: planName })
          : fmt(t("subEndsInDays"), { plan: planName, n: d, date: Number.isFinite(view.exp) ? fmtDate(view.exp) : "" }).replace(" ()", "");
    desc = t("subEndsDesc");
    cta = t("subExtend");
  }

  const dismiss = () => {
    markSeen(key);
    setDismissed(key);
  };
  const urgent = view.kind === "expired" || (view.kind === "warn" && view.days <= 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="tt mx-4 mt-4 md:mx-6"
      role={urgent ? "alert" : "status"}
    >
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur"
        style={{
          borderColor: `color-mix(in srgb, ${color} 20%, transparent)`,
          background: `color-mix(in srgb, ${color} 8%, transparent)`,
          color: "var(--t-text)",
        }}
      >
        <Icon className="size-5 shrink-0" style={{ color }} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium" style={{ color }}>
            {title}
          </div>
          <div className="text-xs" style={{ color: "var(--t-text-muted)" }}>
            {desc}
          </div>
        </div>

        {cta && (
          <button
            type="button"
            onClick={() => onRenew(paidPlan)}
            className="shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            style={{ background: color, color: "#0A0A0F" }}
          >
            {cta}
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full p-1.5 opacity-60 hover:opacity-100"
          aria-label={view.kind === "warn" ? t("subHideToday") : t("close")}
          title={view.kind === "warn" ? t("subHideToday") : undefined}
          style={{ color: "var(--t-text-muted)" }}
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}
