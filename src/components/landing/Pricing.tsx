"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS } from "@/config/plans";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/utils";

export function Pricing() {
  return (
    <section id="pricing" className="relative mx-auto max-w-6xl px-5 pb-28 md:px-8">
      <FadeIn inView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-soft">Narxlar</p>
        <h2 className="font-display mt-3 max-w-2xl text-3xl font-extrabold text-text-primary md:text-4xl">
          Tekin boshlang. Kerak bo&apos;lganda oshiring.
        </h2>
        <p className="mt-4 max-w-xl text-text-secondary">
          Tekin rejimda 3 ta ochiq model. Pullik tariflar flagman modellar, to&apos;liq kod yozish va internet
          tadqiqotni ochadi.
        </p>
      </FadeIn>

      <Stagger inView stagger={0.08} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <StaggerItem key={p.id} className="h-full">
            <div
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-bg-elevated/70 p-6 transition-all duration-300 hover:-translate-y-1",
                p.highlight ? "shadow-glow" : "border-border",
              )}
              style={p.highlight ? { borderColor: `${p.color}88` } : undefined}
            >
              {p.highlight && (
                <span
                  className="absolute -top-3 left-5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                  style={{ background: p.color }}
                >
                  Mashhur
                </span>
              )}
              <div className="text-sm font-semibold" style={{ color: p.color }}>{p.name}</div>
              <div className="font-display mt-2 text-4xl font-extrabold text-text-primary">
                {p.price === 0 ? "0" : `$${p.price}`}
                <span className="text-sm font-normal text-text-muted">/oy</span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{p.tagline}</p>
              <p className="mt-3 text-xs text-text-muted">{p.description}</p>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-text-secondary">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0" style={{ color: p.color }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-opacity hover:opacity-90",
                  p.highlight ? "text-white" : "border border-border text-text-primary hover:bg-bg-hover",
                )}
                style={p.highlight ? { background: p.color } : undefined}
              >
                {p.price === 0 ? "Bepul boshlash" : `${p.name} bilan boshlash`}
              </Link>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
