"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { OrbitField } from "./OrbitField";
import { ProductPreview } from "./ProductPreview";
import { DOCS_URL } from "./company";
import { ctaGlow, ctaPrimary, ctaSecondary } from "./cta";
import { useSignedIn } from "./use-signed-in";
import { TOTAL_MODELS_CLAIM } from "@/config/models";
import { fmt } from "@/lib/i18n";
import { useT } from "@/store/chat";

export function Hero({ signedIn: signedInProp = false }: { signedIn?: boolean }) {
  const t = useT();
  // Landing statik: kirgan foydalanuvchi brauzerdagi sessiya cookie'sidan aniqlanadi.
  const signedIn = useSignedIn() || signedInProp;

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
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
              className="font-display text-balance text-[clamp(44px,8vw,80px)] font-extrabold leading-[1.03] tracking-[-0.03em] text-text-primary"
            >
              {t("ldHeroTitle1")}
              <br />
              <span className="text-gradient-brand">{t("ldHeroTitle2")}</span>
            </h1>
          </div>

          <div className="hero-in" style={{ animationDelay: "0.20s" }}>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-text-secondary">
              {fmt(t("p7cHeroSub"), { n: TOTAL_MODELS_CLAIM })}
            </p>
          </div>

          <div className="hero-in" style={{ animationDelay: "0.30s" }}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <MagneticButton>
                {/* Sahifadagi yagona "nurli" tugma — asosiy harakat. */}
                <Link href={signedIn ? "/app" : "/register"} className={`group ${ctaPrimary} ${ctaGlow}`}>
                  {signedIn ? t("backToChat") : t("startFree")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </MagneticButton>
              <a href={DOCS_URL} className={ctaSecondary}>
                <BookOpen className="size-4" aria-hidden="true" />
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
