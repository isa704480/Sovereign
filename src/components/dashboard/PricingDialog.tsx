"use client";

import { ArrowLeft, Bitcoin, Check, CreditCard, Loader2, QrCode, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatRub, PLAN_BY_ID, PLANS, planPriceRub, type BillingPeriod, type PlanId } from "@/config/plans";
import { BillingToggle, priceFontSize, priceLabel, usePriceHint } from "@/components/pricing/BillingToggle";
import { EASE, EASE_OUT_EXPO } from "@/lib/motion";
import { useLang, useT } from "@/store/chat";
import type { TKey } from "@/lib/i18n";
import { planText } from "@/lib/locales/plans";
import { cn } from "@/lib/utils";

interface PricingDialogProps {
  open: boolean;
  onClose: () => void;
  currentPlan: PlanId;
  /** Why the dialog opened (e.g. locked model). */
  reason?: string | null;
  /** Highlight this plan as the one that unlocks the requested feature. */
  suggestedPlan?: PlanId | null;
}

type Method = "card" | "crypto" | "sbp";

const METHODS: { id: Method; titleKey: TKey; sub: string; noteKey: TKey; endpoint: string; Icon: typeof CreditCard }[] = [
  {
    id: "card",
    titleKey: "payByCard",
    sub: "Visa · Mastercard · Apple Pay · Google Pay",
    noteKey: "payByCardNote",
    endpoint: "/api/checkout/dodo",
    Icon: CreditCard,
  },
  {
    id: "crypto",
    titleKey: "payByCrypto",
    sub: "USDT · USDC · BTC",
    noteKey: "payByCryptoNote",
    endpoint: "/api/checkout",
    Icon: Bitcoin,
  },
  {
    id: "sbp",
    titleKey: "chPayBySbp",
    sub: "СБП · QR · Сбер · Т-Банк · Альфа",
    noteKey: "chPayBySbpNote",
    endpoint: "/api/checkout/rollypay",
    Icon: QrCode,
  },
];

export function PricingDialog({ open, onClose, currentPlan, reason, suggestedPlan }: PricingDialogProps) {
  const t = useT();
  const lang = useLang();
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const hint = usePriceHint();
  const [loading, setLoading] = useState<Method | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [promo, setPromo] = useState("");

  function close() {
    if (loading) return;
    setSelected(null);
    setMessage(null);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || loading) return;
      if (selected) setSelected(null);
      else {
        setMessage(null);
        onClose();
      }
    };
    // Back button from the checkout page restores this page from bfcache with the spinner still on.
    const onShow = (e: PageTransitionEvent) => e.persisted && setLoading(null);
    document.addEventListener("keydown", onKey);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("pageshow", onShow);
    };
  }, [open, onClose, selected, loading]);

  async function pay(method: Method) {
    if (!selected || loading) return;
    setLoading(method);
    setMessage(null);
    try {
      const res = await fetch(METHODS.find((m) => m.id === method)!.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Karta: kod Dodo chegirmasi sifatida qo'llanadi; kripto: sayt PROMO_CODES.
        body: JSON.stringify({ plan: selected, period, ...(promo.trim() ? { promo: promo.trim() } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
      if (data.checkoutUrl) {
        setMessage(t("redirectingToPayment"));
        window.location.assign(data.checkoutUrl);
        return; // keep the spinner while the browser navigates away
      }
      setMessage(data.error ?? t("paymentNotCreated"));
    } catch {
      setMessage(t("serverUnreachable"));
    }
    setLoading(null);
  }

  const plan = selected ? PLAN_BY_ID[selected] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={close}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "tt relative max-h-[92vh] w-full overflow-y-auto rounded-[22px] border p-6 transition-[max-width] duration-300 md:p-8",
              plan ? "max-w-xl" : "max-w-6xl",
            )}
            style={{
              background: "var(--t-surface, #0D1033)",
              borderColor: "var(--t-border, rgba(255,255,255,0.1))",
              color: "var(--t-text, #F0F2FF)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.55)",
            }}
          >
            <button
              type="button"
              onClick={close}
              disabled={!!loading}
              className="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-white/10 disabled:opacity-40"
              aria-label={t("close")}
              style={{ color: "var(--t-text-muted, #9BA3CC)" }}
            >
              <X className="size-5" />
            </button>

            <AnimatePresence mode="wait" initial={false}>
              {!plan ? (
                <motion.div
                  key="plans"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <div className="mb-6 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "var(--t-accent, #7C6FF7)" }}>
                      {t("pricingPlans")}
                    </p>
                    <h2 className="t-display mt-2 text-2xl font-extrabold tracking-[-0.03em] md:text-3xl">
                      {t("pricingHeadline")}
                    </h2>
                    {reason && (
                      <p className="mx-auto mt-3 max-w-xl rounded-xl px-4 py-2 text-sm" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>
                        {reason}
                      </p>
                    )}
                    <div className="mt-5 flex justify-center">
                      <BillingToggle value={period} onChange={setPeriod} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {PLANS.map((p) => {
                      const current = p.id === currentPlan;
                      const suggested = p.id === suggestedPlan;
                      const tx = planText(lang, p);
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "tt relative flex min-w-0 flex-col rounded-2xl border p-5 transition-colors [container-type:inline-size]",
                            (p.highlight || suggested) && "shadow-glow",
                          )}
                          style={{
                            borderColor: suggested ? p.color : p.highlight ? `${p.color}66` : "var(--t-border, rgba(255,255,255,0.1))",
                            background: suggested ? `color-mix(in srgb, ${p.color} 10%, transparent)` : "transparent",
                          }}
                        >
                          {(p.highlight || suggested) && (
                            <span
                              className="absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                              style={{ background: p.color }}
                            >
                              {suggested ? t("planNeeded") : t("planPopular")}
                            </span>
                          )}
                          <div className="text-sm font-semibold" style={{ color: p.color }}>{p.name}</div>
                          {/* Narx karta kengligiga moslanadi — $1099.90/yil ham sig'adi. */}
                          <div
                            className="t-display nums mt-1 whitespace-nowrap font-extrabold leading-tight tracking-[-0.02em]"
                            style={{ fontSize: priceFontSize(priceLabel(p, period), 1.875) }}
                          >
                            {p.price === 0 ? "0" : priceLabel(p, period)}
                            <span className="text-sm font-normal" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                              /{p.price > 0 && period === "year" ? t("ldPerYear") : t("perMonth")}
                            </span>
                          </div>
                          {p.price > 0 && (
                            <p className="mt-1 text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                              {hint(p, period)}
                            </p>
                          )}
                          <p className="mt-1 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{tx.tagline}</p>

                          <ul className="mt-4 flex-1 space-y-2 text-[13px]">
                            {tx.features.map((f) => (
                              <li key={f} className="flex items-start gap-2">
                                <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: p.color }} />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>

                          <button
                            type="button"
                            disabled={current || p.price === 0}
                            onClick={() => {
                              setMessage(null);
                              setSelected(p.id);
                            }}
                            className={cn(
                              "mt-5 h-10 w-full rounded-xl text-sm font-semibold transition-opacity disabled:cursor-default",
                              current || p.price === 0 ? "opacity-60" : "hover:opacity-90",
                            )}
                            style={
                              current || p.price === 0
                                ? { border: "1px solid var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text-muted, #9BA3CC)" }
                                : { background: p.color, color: "#fff" }
                            }
                          >
                            {current ? t("currentPlan") : p.price === 0 ? "Free" : `${priceLabel(p, period)} — ${t("selectSuffix")}`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="method"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    disabled={!!loading}
                    className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-white/10 disabled:opacity-40"
                    style={{ color: "var(--t-text-muted, #9BA3CC)" }}
                  >
                    <ArrowLeft className="size-4" /> {t("pricingPlans")}
                  </button>

                  <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: plan.color }}>
                    {plan.name} · {priceLabel(plan, period)}/{period === "year" ? t("ldPerYear") : t("perMonth")}
                  </p>
                  <h2 className="t-display mt-2 text-2xl font-extrabold tracking-[-0.03em]">{t("choosePayment")}</h2>

                  {/* Two siblings → one panel, hairline between them. */}
                  <div
                    role="radiogroup"
                    aria-label={t("paymentMethod")}
                    className="tt mt-6 overflow-hidden"
                    style={{ border: "1px solid var(--t-border)", borderRadius: 18 }}
                  >
                    {(lang === "ru" ? [...METHODS.filter((m) => m.id === "sbp"), ...METHODS.filter((m) => m.id !== "sbp")] : METHODS)
                      .filter((m) => m.id !== "sbp" || planPriceRub(plan, period) > 0)
                      .map(({ id, titleKey, sub, noteKey, Icon }, idx) => {
                      const busy = loading === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={busy}
                          disabled={!!loading}
                          onClick={() => pay(id)}
                          className={cn(
                            "group flex w-full items-center gap-4 p-4 text-left transition-colors",
                            "hover:bg-white/5 disabled:cursor-default",
                            loading && !busy && "opacity-40",
                          )}
                          style={{
                            borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
                            background: busy ? "color-mix(in srgb, var(--t-primary) 10%, transparent)" : undefined,
                          }}
                        >
                          <span
                            className="grid size-12 shrink-0 place-items-center rounded-xl"
                            style={{ background: `color-mix(in srgb, ${plan.color} 18%, transparent)`, color: plan.color }}
                          >
                            {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{t(titleKey)}</span>
                            <span className="block text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{sub}</span>
                            <span className="mt-1 block text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{t(noteKey)}</span>
                          </span>
                          <span className="nums shrink-0 text-sm font-semibold" style={{ color: plan.color }}>
                            {id === "sbp" ? formatRub(planPriceRub(plan, period)) : priceLabel(plan, period)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-4 block">
                    <span className="sr-only">{t("chPromoLabel")}</span>
                    <input
                      value={promo}
                      onChange={(e) => setPromo(e.target.value.toUpperCase())}
                      disabled={!!loading}
                      maxLength={32}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t("chPromoPlaceholder")}
                      className="tt h-11 w-full rounded-xl bg-transparent px-4 text-sm tracking-wider outline-none transition-colors focus:border-[var(--t-accent,#7C6FF7)] disabled:opacity-40"
                      style={{ border: "1px solid var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
                    />
                    <span className="mt-1.5 block text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                      {t("chPromoHint")}
                    </span>
                  </label>

                  <p className="mt-5 text-center text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                    {t("pricingSecureNote")}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {message && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  role="status"
                  className="mt-4 text-center text-sm"
                  style={{ color: "var(--t-text-muted, #9BA3CC)" }}
                >
                  {message}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
