"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS } from "@/config/plans";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/utils";

export function Pricing() {
  return (
    <section id="pricing" className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-28">
      <FadeIn inView>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Narxlar</p>
        <h2 className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-extrabold tracking-tight text-text-primary md:text-5xl">
          Tekin boshlang. <span className="text-gradient-brand">Kerak bo&apos;lganda oshiring.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-base text-text-secondary">
          Tekin rejimda saxiy modellar. Pullik tariflar flagman modellar, to&apos;liq kod yozish va internet tadqiqotni ochadi.
        </p>
      </FadeIn>

      <Stagger inView stagger={0.06} className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <StaggerItem key={p.id} className="h-full">
            <div
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-white/[0.015] p-6 transition-colors duration-300",
                p.highlight ? "border-[color-mix(in_srgb,var(--color-primary)_55%,transparent)] bg-white/[0.03]" : "border-border hover:border-white/15",
              )}
              style={p.highlight ? { borderWidth: 2 } : undefined}
            >
              {p.highlight && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Mashhur
                </span>
              )}
              <div className="text-sm font-semibold text-text-primary">{p.name}</div>
              <div className="font-display nums mt-2 text-4xl font-extrabold tracking-tight text-text-primary">
                {p.price === 0 ? "0" : `$${p.price}`}
                <span className="text-sm font-normal text-text-muted">/oy</span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{p.tagline}</p>
              <p className="mt-3 text-xs text-text-muted">{p.description}</p>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-text-secondary">
                {p.features.map((f) => (
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
                {p.price === 0 ? "Bepul boshlash" : `${p.name} tanlash`}
              </Link>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
