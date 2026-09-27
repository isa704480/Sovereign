"use client";

import { Activity, ArrowUpRight, BookOpen, Mail } from "lucide-react";
import { FadeIn } from "@/components/motion/FadeIn";
import { useT } from "@/store/chat";
import { CONTACT_EMAIL, DOCS_URL, STATUS_URL } from "./company";
import { ctaPrimary, ctaSecondarySm } from "./cta";
import { SectionHeading } from "./SectionHeading";

export function Contact() {
  const t = useT();
  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 pb-28 md:px-8"
    >
      <div className="rounded-2xl border border-border bg-bg-elevated px-6 py-12 text-center md:px-12 md:py-16">
        <SectionHeading
          id="contact-title"
          eyebrow={t("p4dNavContact")}
          title={t("p4dContactTitle")}
          sub={t("p4dContactBody")}
        />

        <FadeIn inView>
          <a href={`mailto:${CONTACT_EMAIL}`} className={`mt-8 ${ctaPrimary}`}>
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{CONTACT_EMAIL}</span>
          </a>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <a href={DOCS_URL} className={ctaSecondarySm}>
              <BookOpen className="size-4" aria-hidden="true" /> {t("p4dNavDocs")}
              <ArrowUpRight className="size-3.5 text-text-muted" aria-hidden="true" />
            </a>
            <a href={STATUS_URL} className={ctaSecondarySm}>
              <Activity className="size-4" aria-hidden="true" /> {t("p4dContactStatus")}
              <ArrowUpRight className="size-3.5 text-text-muted" aria-hidden="true" />
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
