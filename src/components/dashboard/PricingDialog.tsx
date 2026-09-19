"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { PLANS, type PlanId } from "@/config/plans";
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

export function PricingDialog({ open, onClose, currentPlan, reason, suggestedPlan }: PricingDialogProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<"card" | "crypto">("card");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function pick(planId: PlanId) {
    if (planId === "free") return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(method === "card" ? "/api/checkout/dodo" : "/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: planId }),
        });
        const data = (await res.json()) as { checkoutUrl?: string; error?: string };
        if (data.checkoutUrl) {
          setMessage("To'lov sahifasiga o'tilmoqda...");
          window.location.href = data.checkoutUrl;
        } else {
          setMessage(data.error ?? "To'lov yaratilmadi");
        }
      } catch {
        setMessage("Serverga ulanib bo'lmadi");
      }
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border p-6 shadow-lg md:p-8"
            style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-2 transition-colors hover:bg-white/10"
              aria-label="Yopish"
              style={{ color: "var(--t-text-muted, #9BA3CC)" }}
            >
              <X className="size-5" />
            </button>

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
              <div
                role="radiogroup"
                aria-label="To'lov usuli"
                className="mx-auto mt-5 inline-flex rounded-xl border p-1"
                style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}
              >
                {(
                  [
                    { id: "card", label: "Karta · Apple/Google Pay" },
                    { id: "crypto", label: "Kripto · USDT/BTC" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={method === m.id}
                    onClick={() => setMethod(m.id)}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                      background: method === m.id ? "var(--t-primary, #5B50F0)" : "transparent",
                      color: method === m.id ? "#fff" : "var(--t-text-muted, #9BA3CC)",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
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
                      disabled={current || pending}
                      onClick={() => pick(p.id)}
                      className={cn(
                        "mt-5 h-10 w-full rounded-xl text-sm font-semibold transition-opacity disabled:cursor-default",
                        current ? "opacity-60" : "hover:opacity-90",
                      )}
                      style={
                        current
                          ? { border: "1px solid var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text-muted, #9BA3CC)" }
                          : { background: p.color, color: "#fff" }
                      }
                    >
                      {current ? "Joriy tarif" : p.price === 0 ? "Free" : `$${p.price} — ${method === "card" ? "karta" : "kripto"}`}
                    </button>
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {message && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="mt-4 text-center text-sm"
                  style={{ color: "var(--t-text-muted, #9BA3CC)" }}
                >
                  {message}
                </motion.p>
              )}
            </AnimatePresence>

            <p className="mt-4 text-center text-[11px]" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
              {method === "card"
                ? "Karta obunasi — Dodo Payments xavfsiz checkout. 7 kun bepul sinov, istalgan vaqt bekor qilish."
                : "Kripto (USDT / USDC / BTC) — ZenoBank xavfsiz checkout. 30 kunlik bir martalik to'lov."}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
