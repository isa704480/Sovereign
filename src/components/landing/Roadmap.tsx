"use client";

import { CircleCheck, CircleDashed } from "lucide-react";
import { FadeIn } from "@/components/motion/FadeIn";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";
import { SectionHeading } from "./SectionHeading";

/** Halol holat: faqat kod bazasida mavjud narsa "Shipped" ga yoziladi. */
const SHIPPED: TKey[] = [
  "p4dRoadWeb",
  "p4dRoadCli",
  "p4dRoadDesktop",
  "p4dRoadImages",
  "p4dRoadBlind",
  "p4dRoadLangs",
  "p4dRoadPay",
];
const NEXT: TKey[] = ["p4dRoadVideo", "p4dRoadMusic", "p4dRoadTella", "p4dRoadMobile"];

function Column({ title, badge, items, done }: { title: string; badge: string; items: TKey[]; done: boolean }) {
  const t = useT();
  const Icon = done ? CircleCheck : CircleDashed;
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-2xl border p-6 md:p-7",
        done ? "border-border bg-white/[0.02]" : "border-dashed border-white/15 bg-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold text-text-primary">{title}</h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
            done ? "bg-success/15 text-success" : "bg-white/[0.05] text-text-secondary",
          )}
        >
          {badge}
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((k) => (
          <li key={k} className="flex items-start gap-3 text-sm text-text-secondary">
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", done ? "text-success" : "text-text-muted")}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className={cn(done && "text-text-primary")}>{t(k)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Roadmap() {
  const t = useT();
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading id="roadmap-title" eyebrow={t("p4dNavRoadmap")} title={t("p4dRoadTitle")} sub={t("p4dRoadSub")} />
      <FadeIn inView className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2">
        <Column title={t("p4dRoadShipped")} badge={t("p4dRoadLive")} items={SHIPPED} done />
        <Column title={t("p4dRoadNext")} badge={t("p4dRoadPlanned")} items={NEXT} done={false} />
      </FadeIn>
    </section>
  );
}
