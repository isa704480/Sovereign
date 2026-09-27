"use client";

import type { ReactNode } from "react";
import { ArrowRight, Briefcase, Code2, CreditCard, GraduationCap, Languages } from "lucide-react";
import { FadeIn } from "@/components/motion/FadeIn";
import { LANGS, type TKey } from "@/lib/i18n";
import { useT } from "@/store/chat";
import { SectionHeading } from "./SectionHeading";

const GROUPS: { icon: typeof GraduationCap; title: TKey; body: TKey }[] = [
  { icon: GraduationCap, title: "p4dAudStudentsTitle", body: "p4dAudStudentsBody" },
  { icon: Code2, title: "p4dAudDevsTitle", body: "p4dAudDevsBody" },
  { icon: Briefcase, title: "p4dAudBizTitle", body: "p4dAudBizBody" },
];

/** Bosilsa — to'g'ridan-to'g'ri shu usul bilan tarif oynasi (login bo'lmasa login → qaytadi). */
const PAYMENTS: { key: TKey; href: string }[] = [
  { key: "p4dPayCard", href: "/app?checkout=card" }, // Dodo
  { key: "p4dPayCrypto", href: "/app?checkout=crypto" }, // RollyPay
  { key: "p4dPaySbp", href: "/app?checkout=sbp" }, // RollyPay
];

function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="rounded-full border border-border px-3 py-1 text-sm text-text-secondary">{children}</li>
  );
}

export function Audience() {
  const t = useT();
  return (
    <section
      id="audience"
      aria-labelledby="audience-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading id="audience-title" eyebrow={t("p4dAudEyebrow")} title={t("p4dAudTitle")} sub={t("p4dAudSub")} />

      {/* Kimlar uchun + tillar/to'lov — bitta panel, hairline bilan bo'lingan. */}
      <FadeIn inView className="mt-14 overflow-hidden rounded-2xl border border-border bg-border">
        <div className="grid grid-cols-1 gap-px md:grid-cols-3">
          {GROUPS.map((g) => (
            <article key={g.title} className="h-full bg-bg-base p-6 md:p-8">
              <g.icon className="size-5 text-text-secondary" strokeWidth={1.6} aria-hidden="true" />
              <h3 className="font-display mt-5 text-lg font-bold text-text-primary">{t(g.title)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{t(g.body)}</p>
            </article>
          ))}
        </div>
        <div className="mt-px grid grid-cols-1 gap-6 bg-bg-base p-6 md:grid-cols-2 md:gap-10 md:p-8">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Languages className="size-4 text-text-muted" aria-hidden="true" /> {t("p4dAudLangs")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <Chip key={l.id}>
                  <span lang={l.htmlLang}>{l.label}</span>
                </Chip>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <CreditCard className="size-4 text-text-muted" aria-hidden="true" /> {t("p4dAudPay")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {PAYMENTS.map((p) => (
                <li key={p.key}>
                  <a
                    href={p.href}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  >
                    {t(p.key)} <ArrowRight className="size-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-text-muted">{t("p5aPayNote")}</p>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
