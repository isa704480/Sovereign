"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { FadeIn } from "@/components/motion/FadeIn";
import { useT } from "@/store/chat";
import { ctaPrimary } from "./cta";
import { SectionHeading } from "./SectionHeading";

export function PrivacyBand() {
  const t = useT();
  return (
    <section
      id="privacy"
      aria-labelledby="privacy-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 pb-28 md:px-8"
    >
      <div className="rounded-2xl border border-border bg-bg-elevated p-7 md:p-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <SectionHeading
              id="privacy-title"
              align="left"
              eyebrow={t("p8cPrivacyEyebrow")}
              title={`${t("ldPrivacyTitle1")} ${t("ldPrivacyTitle2")}`}
              sub={t("ldPrivacyBody")}
            />
            <FadeIn inView className="mt-8">
              <Link href="/register" className={`group ${ctaPrimary}`}>
                {t("ldCreateAccount")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </FadeIn>
          </div>

          {/* Misol: nima yozildi → modelga nima ketadi. */}
          <FadeIn inView className="space-y-3 font-mono text-[13px]">
            <div className="rounded-lg border border-border bg-bg-base p-4">
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-text-muted">{t("ldYouWrote")}</div>
              <div className="text-text-primary">{t("ldPrivacyExampleFrom")}</div>
            </div>
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-accent)] bg-accent-bg px-3 py-1 font-sans text-xs text-accent-text">
                <ArrowDown className="size-3.5" aria-hidden="true" />
                {t("ldTokenization")}
              </span>
            </div>
            <div className="rounded-lg border border-[var(--border-accent)] bg-bg-base p-4">
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-accent-text">{t("ldAiSees")}</div>
              <div className="text-text-primary">{t("ldPrivacyExampleTo")}</div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
