"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { OrbitField } from "./OrbitField";
import { useT } from "@/store/chat";

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();

  return (
    <section className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 py-28 text-center">
      {/* fon */}
      <div className="absolute inset-0 -z-30 bg-bg-base" />
      <div
        className="absolute inset-0 -z-20"
        style={{ background: "radial-gradient(55% 45% at 50% 42%, rgba(91,80,240,0.16) 0%, transparent 70%)" }}
      />
      <div className="grid-fade absolute inset-0 -z-10 opacity-60" />

      {/* aylanuvchi AI logolari */}
      <OrbitField />

      <Stagger stagger={0.09} delay={0.1} className="relative flex max-w-3xl flex-col items-center">
        <StaggerItem>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium tracking-wide text-text-secondary">
            <span className="size-1.5 rounded-full bg-primary shadow-glow" />
            1700+ model · bitta hisob · shifrlangan xotira
          </span>
        </StaggerItem>

        <StaggerItem>
          <h1 className="font-display mt-7 text-5xl font-extrabold leading-[1.03] tracking-tight text-text-primary md:text-7xl">
            Barcha AI.
            <br />
            <span className="text-gradient-brand">Bitta oyna.</span>
          </h1>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-text-secondary">
            Claude, GPT, Gemini, DeepSeek — beshta ilovaga sakramang. Modelni bir zumda
            almashtiring; suhbat hech narsani unutmaydi. Xotira faqat sizda — shifrlangan.
          </p>
        </StaggerItem>

        <StaggerItem>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <MagneticButton>
              <Link
                href={signedIn ? "/app" : "/register"}
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-text-primary px-7 text-base font-semibold text-bg-base transition-transform hover:-translate-y-0.5"
              >
                {signedIn ? t("backToChat") : "Bepul boshlash"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </MagneticButton>
            <a
              href="#features"
              className="inline-flex h-12 items-center gap-1.5 rounded-full border border-border px-6 text-base font-medium text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary"
            >
              Nega SOVEREIGN?
            </a>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="mt-7 flex items-center gap-2 text-sm text-text-muted">
            <Lock className="size-3.5 text-success" /> Bank kartasi talab qilinmaydi
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
