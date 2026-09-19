"use client";

import { ArrowLeft, Bitcoin, Check, CreditCard, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { PLAN_BY_ID, PLANS, type PlanId } from "@/config/plans";
import { EASE, EASE_OUT_EXPO } from "@/lib/motion";
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

type Method = "card" | "crypto";

const METHODS: { id: Method; title: string; sub: string; note: string; endpoint: string; Icon: typeof CreditCard }[] = [
  {
    id: "card",
    title: "Karta orqali",
    sub: "Visa · Mastercard · Apple Pay · Google Pay",
    note: "Har oy avtomatik yangilanadi, istalgan vaqt bekor qilish mumkin.",
    endpoint: "/api/checkout/dodo",
    Icon: CreditCard,
  },
  {
    id: "crypto",
    title: "Kripto orqali",
    sub: "USDT · USDC · BTC",
    note: "Bir martalik to'lov — 30 kunga faollashadi.",
    endpoint: "/api/checkout",
    Icon: Bitcoin,
  },
];

export function PricingDialog({ open, onClose, currentPlan, reason, suggestedPlan }: PricingDialogProps) {
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState<Method | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        body: JSON.stringify({ plan: selected }),
      });
      const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
      if (data.checkoutUrl) {
        setMessage("To'lov sahifasiga o'tilmoqda...");
        window.location.assign(data.checkoutUrl);
        return; // keep the spinner while the browser navigates away
      }
      setMessage(data.error ?? "To'lov yaratilmadi");
    } catch {
      setMessage("Serverga ulanib bo'lmadi");
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
              "tt relative max-h-[92vh] w-full overflow-y-auto rounded-3xl border p-6 shadow-lg transition-[max-width] duration-300 md:p-8",
              plan ? "max-w-xl" : "max-w-5xl",
            )}
            style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
          >
            <button
              type="button"
              onClick={close}
              disabled={!!loading}
              className="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-white/10 disabled:opacity-40"
              aria-label="Yopish"
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
                      Tariflar
                    </p>
                    <h2 className="t-display mt-2 text-2xl font-extrabold md:text-3xl">O&apos;zingizga mos rejani tanlang</h2>
                    {reason && (
                      <p className="mx-auto mt-3 max-w-xl rounded-xl px-4 py-2 text-sm" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>
                        {reason}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {PLANS.map((p) => {
                      const current = p.id === currentPlan;
                      const suggested = p.id === suggestedPlan;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "tt relative flex flex-col rounded-2xl border p-5 transition-colors",
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
                              {suggested ? "Kerakli tarif" : "Mashhur"}
                            </span>
                          )}
                          <div className="text-sm font-semibold" style={{ color: p.color }}>{p.name}</div>
                          <div className="t-display mt-1 text-3xl font-extrabold">
                            {p.price === 0 ? "0" : `$${p.price}`}
                            <span className="text-sm font-normal" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>/oy</span>
                          </div>
                          <p className="mt-1 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{p.tagline}</p>

                          <ul className="mt-4 flex-1 space-y-2 text-[13px]">
                            {p.features.map((f) => (
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
                            {current ? "Joriy tarif" : p.price === 0 ? "Free" : `$${p.price} — tanlash`}
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
                    <ArrowLeft className="size-4" /> Tariflar
                  </button>

                  <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: plan.color }}>
                    {plan.name} · ${plan.price}/oy
                  </p>
                  <h2 className="t-display mt-2 text-2xl font-extrabold">To&apos;lov usulini tanlang</h2>

                  <div role="radiogroup" aria-label="To'lov usuli" className="mt-6 space-y-3">
                    {METHODS.map(({ id, title, sub, note, Icon }) => {
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
                            "group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all",
                            "hover:-translate-y-0.5 hover:bg-white/5 disabled:cursor-default disabled:hover:translate-y-0",
                            loading && !busy && "opacity-40",
                          )}
                          style={{ borderColor: busy ? plan.color : "var(--t-border, rgba(255,255,255,0.1))" }}
                        >
                          <span
                            className="grid size-12 shrink-0 place-items-center rounded-xl"
                            style={{ background: `color-mix(in srgb, ${plan.color} 18%, transparent)`, color: plan.color }}
                          >
                            {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{title}</span>
                            <span className="block text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{sub}</span>
                            <span className="mt-1 block text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{note}</span>
                          </span>
                          <span className="text-sm font-semibold" style={{ color: plan.color }}>${plan.price}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-5 text-center text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                    Xavfsiz to&apos;lov sahifasiga o&apos;tasiz. Karta ma&apos;lumotlari SOVEREIGN&apos;da saqlanmaydi.
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
