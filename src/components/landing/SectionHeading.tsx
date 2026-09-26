"use client";

import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion/FadeIn";
import { cn } from "@/lib/utils";

/** Landing bo'limlari uchun yagona sarlavha: eyebrow + h2 + izoh. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  /** h2 id — section aria-labelledby uchun. */
  id: string;
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "left";
}) {
  const center = align === "center";
  return (
    <FadeIn inView className={cn(center && "text-center")}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
      <h2
        id={id}
        className={cn(
          "font-display mt-3 max-w-2xl text-balance text-[1.85rem] font-extrabold [overflow-wrap:anywhere] sm:text-3xl tracking-tight text-text-primary md:text-5xl",
          center && "mx-auto",
        )}
      >
        {title}
      </h2>
      {sub && (
        <p className={cn("mt-4 max-w-xl text-pretty text-base text-text-secondary", center && "mx-auto")}>{sub}</p>
      )}
    </FadeIn>
  );
}
