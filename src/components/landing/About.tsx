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

/** Kompaniya va jamoa — BITTA panel: chapda missiya va faktlar, o'ngda asoschi. */
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

      <FadeIn inView className="mt-14 overflow-hidden rounded-2xl border border-border bg-border">
        <div className="grid grid-cols-1 gap-px lg:grid-cols-[1.25fr_1fr]">
          {/* Missiya */}
          <div className="bg-bg-elevated p-7 md:p-10">
            <p className="text-pretty text-lg leading-relaxed text-text-primary md:text-xl">{t("p4dAboutMission")}</p>
            <dl className="mt-8 grid grid-cols-1 gap-5 border-t border-border pt-6 sm:grid-cols-2">
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

          {/* Jamoa */}
          <div className="flex flex-col bg-bg-elevated p-7 md:p-10">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("p4dAboutTeam")}</h3>
            <div className="mt-6 flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-full bg-bg-hover font-display text-xl font-extrabold text-text-primary"
              >
                {initials(FOUNDER_NAME)}
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-bold text-text-primary">{FOUNDER_NAME}</p>
                <p className="text-sm text-text-secondary">{pick(lang, FOUNDER_TITLE)}</p>
              </div>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t("p4dAboutFounderBio")}</p>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
