"use client";

import { Activity, ArrowUpRight, BookOpen, Mail } from "lucide-react";
import { FadeIn } from "@/components/motion/FadeIn";
import { useT } from "@/store/chat";
import { CONTACT_EMAIL, DOCS_URL, STATUS_URL } from "./company";

export function Contact() {
  const t = useT();
  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 pb-28 md:px-8"
    >
      <FadeIn inView>
        <div className="border-gradient-brand relative overflow-hidden rounded-3xl bg-bg-elevated/80 px-6 py-12 text-center md:px-12 md:py-16">
          <div className="noise absolute inset-0" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(91,80,240,0.35), transparent)" }}
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-soft">{t("p4dNavContact")}</p>
            <h2
              id="contact-title"
              className="font-display mx-auto mt-3 max-w-2xl text-balance text-[1.85rem] font-extrabold [overflow-wrap:anywhere] sm:text-3xl tracking-tight text-text-primary md:text-5xl"
            >
              {t("p4dContactTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-base text-text-secondary">{t("p4dContactBody")}</p>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="group mt-8 inline-flex h-12 max-w-full items-center gap-2 rounded-full bg-text-primary px-6 text-base font-semibold text-bg-base transition-transform hover:-translate-y-0.5"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{CONTACT_EMAIL}</span>
            </a>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <a
                href={DOCS_URL}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white/[0.02] px-4 text-sm text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary"
              >
                <BookOpen className="size-4" aria-hidden="true" /> {t("p4dNavDocs")}
                <ArrowUpRight className="size-3.5 opacity-60" aria-hidden="true" />
              </a>
              <a
                href={STATUS_URL}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white/[0.02] px-4 text-sm text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary"
              >
                <Activity className="size-4" aria-hidden="true" /> {t("p4dContactStatus")}
                <ArrowUpRight className="size-3.5 opacity-60" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
