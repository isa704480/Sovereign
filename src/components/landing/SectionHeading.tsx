"use client";

import type { ReactNode } from "react";
import { FadeIn } from "@/components/motion/FadeIn";
import { cn } from "@/lib/utils";

/**
 * Landing bo'limlari uchun YAGONA sarlavha: eyebrow + h2 + izoh.
 * H2 hero H1'dan (clamp 44–80px) aniq kichik: clamp(28px, 4vw, 44px).
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  sub,
  align = "center",
  className,
}: {
  /** h2 id — section aria-labelledby uchun. */
  id: string;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const center = align === "center";
  return (
    <FadeIn inView className={cn(center && "text-center", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
      <h2
        id={id}
        className={cn(
          "font-display mt-3 max-w-3xl text-balance break-words text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-text-primary [hyphens:manual]",
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
