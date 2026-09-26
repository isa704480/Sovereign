"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { OrbitField } from "./OrbitField";
import { ProductPreview } from "./ProductPreview";
import { DOCS_URL } from "./company";
import { useT } from "@/store/chat";

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();

  return (
    <section id="main-content" tabIndex={-1} aria-labelledby="hero-title" className="relative isolate overflow-hidden outline-none focus-visible:outline-none">
      {/* fon */}
      <div className="absolute inset-0 -z-30 bg-bg-base" />
      <div
        className="absolute inset-0 -z-20"
        style={{ background: "radial-gradient(55% 35% at 50% 22%, rgba(91,80,240,0.16) 0%, transparent 70%)" }}
      />

      {/* Kirish animatsiyasi CSS'da (.hero-in): JS yuklanmasa ham matn ko'rinadi,
          prefers-reduced-motion / "animatsiyani kamaytirish" da o'chadi. */}
      <div className="relative flex min-h-[86svh] flex-col items-center justify-center px-5 pb-14 pt-32 text-center">
        <div className="grid-fade absolute inset-0 -z-10 opacity-60" />
        {/* aylanuvchi AI logolari */}
        <OrbitField />

        {/* Kam so'z: sarlavha, bitta qisqa jumla va ikki tugma. Batafsil — pastdagi bo'limlarda. */}
        <div className="relative flex max-w-3xl flex-col items-center">
          <div className="hero-in" style={{ animationDelay: "0.10s" }}>
            <h1
              id="hero-title"
              className="font-display text-[2.75rem] font-extrabold sm:text-5xl leading-[1.03] tracking-tight text-text-primary md:text-7xl"
            >
              {t("ldHeroTitle1")}
              <br />
              <span className="text-gradient-brand">{t("ldHeroTitle2")}</span>
            </h1>
          </div>

          <div className="hero-in" style={{ animationDelay: "0.20s" }}>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-text-secondary">
              {t("p7cHeroSub")}
            </p>
          </div>

          <div className="hero-in" style={{ animationDelay: "0.30s" }}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <MagneticButton>
                <Link
                  href={signedIn ? "/app" : "/register"}
                  className="group inline-flex h-12 items-center gap-2 rounded-full bg-text-primary px-7 text-base font-semibold text-bg-base transition-transform hover:-translate-y-0.5"
                >
                  {signedIn ? t("backToChat") : t("startFree")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </MagneticButton>
              <a
                href={DOCS_URL}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-white/[0.02] px-6 text-base font-medium text-text-secondary backdrop-blur-md transition-colors hover:border-white/20 hover:text-text-primary"
              >
                <BookOpen className="size-4" />
                {t("p4dHeroDocs")}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Haqiqiy mahsulot ko'rinishi */}
      <div className="hero-in relative px-4 pb-20 md:px-8 md:pb-28" style={{ animationDelay: "0.40s" }}>
        <ProductPreview />
      </div>
    </section>
  );
}
