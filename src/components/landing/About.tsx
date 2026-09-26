"use client";

import { Building2, Globe, Mail, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion/FadeIn";
import { pick } from "@/lib/i18n";
import { useLang, useT } from "@/store/chat";
import { SectionHeading } from "./SectionHeading";
// Asoschi ismi, lavozimi, joylashuv, pochta va yuridik shaxs — ./company.ts da tahrirlanadi.
import { CONTACT_EMAIL, FOUNDER_NAME, FOUNDER_TITLE, LEGAL_ENTITY, LOCATION, SITE_HOST } from "./company";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function Fact({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-text-primary">{children}</dd>
      </div>
    </div>
  );
}

export function About() {
  const t = useT();
  const lang = useLang();
  return (
    <section
      id="about"
      aria-labelledby="about-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading id="about-title" eyebrow={t("p4dNavAbout")} title={t("p4dAboutTitle")} />

      <FadeIn inView className="mt-14 grid grid-cols-1 gap-3 lg:grid-cols-[1.25fr_1fr]">
        {/* Missiya */}
        <div className="border-gradient-brand relative overflow-hidden rounded-3xl bg-bg-elevated/70 p-7 md:p-10">
          <div className="noise absolute inset-0" />
          <p className="relative text-pretty text-lg leading-relaxed text-text-primary/90 md:text-xl">
            {t("p4dAboutMission")}
          </p>
          <dl className="relative mt-8 grid grid-cols-1 gap-5 border-t border-white/[0.08] pt-6 sm:grid-cols-2">
            <Fact icon={Building2} label={LEGAL_ENTITY ? t("p4dAboutLegal") : t("p4dAboutCompany")}>
              {LEGAL_ENTITY || "SOVEREIGN AI"}
            </Fact>
            <Fact icon={MapPin} label={t("p4dAboutLocation")}>
              {pick(lang, LOCATION)}
            </Fact>
            <Fact icon={Mail} label={t("p4dAboutEmail")}>
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-4 hover:underline">
                {CONTACT_EMAIL}
              </a>
            </Fact>
            <Fact icon={Globe} label={t("p4dAboutWebsite")}>
              {SITE_HOST}
            </Fact>
          </dl>
        </div>

        {/* Asoschi */}
        <div className="flex flex-col rounded-3xl border border-border bg-white/[0.015] p-7 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("p4dAboutTeam")}</p>
          <div className="mt-6 flex items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-brand font-display text-2xl font-extrabold text-white shadow-glow"
            >
              {initials(FOUNDER_NAME)}
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-xl font-bold text-text-primary">{FOUNDER_NAME}</h3>
              <p className="text-sm text-text-secondary">{pick(lang, FOUNDER_TITLE)}</p>
            </div>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t("p4dAboutFounderBio")}</p>
          <p className="mt-auto flex items-center gap-2 pt-6 text-sm text-text-muted">
            <MapPin className="size-3.5" aria-hidden="true" /> {pick(lang, LOCATION)}
          </p>
        </div>
      </FadeIn>
    </section>
  );
}
