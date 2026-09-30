"use client";

import { useInView, useReducedMotionConfig } from "motion/react";
import { useRef, type CSSProperties } from "react";
import {
  siAnthropic,
  siClaude,
  siDeepseek,
  siGithubcopilot,
  siGooglegemini,
  siHuggingface,
  siKimi,
  siMeta,
  siMistralai,
  siNvidia,
  siOllama,
  siPerplexity,
  siQwen,
  siZdotai,
  type SimpleIcon,
} from "simple-icons";

/**
 * AI ikonkalari uch halqada aylanadi.
 * - Har bir ikonka faqat BIR marta ishlatiladi (takror yo'q)
 * - Markazdan pastroqqa siljigan — yuqori ikonkalar nav ostida ko'rinadi
 * - Radiuslar viewport ichida qoladi
 */

const BRAND_COLORS: Record<string, string> = {
  claude:       "#D97757",
  googlegemini: "#8E75B2",
  mistralai:    "#FA520F",
  deepseek:     "#5786FE",
  meta:         "#0467DF",
  qwen:         "#6950EF",
  perplexity:   "#1FB8CD",
  nvidia:       "#76B900",
  huggingface:  "#FFD21E",
  anthropic:    "#D97757",
  ollama:       "#A78BFA",
  kimi:         "#00C4CC",
  zdotai:       "#8B7DFF",
  githubcopilot:"#6E40C9",
};

function getBrandColor(slug: string): string {
  return BRAND_COLORS[slug] ?? "#6B7280";
}

// Halqa 1 — ichki (5 ta, barchasi UNIQUE)
const RING_1: SimpleIcon[] = [
  siClaude,
  siGooglegemini,
  siMistralai,
  siDeepseek,
  siMeta,
];

// Halqa 2 — o'rtacha (7 ta, RING_1 da yo'qlar)
const RING_2: SimpleIcon[] = [
  siPerplexity,
  siQwen,
  siNvidia,
  siAnthropic,
  siKimi,
  siOllama,
  siZdotai,
];

// Halqa 3 — tashqi (2 ta qolgan, UNIQUE)
const RING_3: SimpleIcon[] = [
  siHuggingface,
  siGithubcopilot,
];

interface MarkProps {
  icon: SimpleIcon;
  size: "sm" | "md" | "lg";
}

function Mark({ icon, size }: MarkProps) {
  const color = getBrandColor(icon.slug);
  const sizeClass =
    size === "lg" ? "size-14" : size === "md" ? "size-11" : "size-9";
  const iconClass =
    size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4";

  return (
    <span
      className={`grid ${sizeClass} -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-bg-base`}
      style={{
        borderColor: `${color}35`,
        boxShadow: `0 0 14px 2px ${color}30, 0 0 4px 1px ${color}20`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className={iconClass}
        fill={color}
        focusable="false"
        style={{ filter: `drop-shadow(0 0 3px ${color}80)` }}
      >
        <path d={icon.path} />
      </svg>
    </span>
  );
}

interface RingProps {
  radius: number;
  duration: number;
  reverse?: boolean;
  items: SimpleIcon[];
  spin: boolean;
  size: "sm" | "md" | "lg";
  /**
   * startAngle — halqadagi birinchi ikonka burchagi (deg).
   * Ikonkalar tepaga/pastga yig'ilib qolmasligi uchun har halqa
   * boshlanish burchagi o'zgartiriladi.
   */
  startAngle?: number;
}

function Ring({
  radius,
  duration,
  reverse,
  items,
  spin,
  size,
  startAngle = 0,
}: RingProps) {
  const style = {
    width: 0,
    height: 0,
    "--orbit-dur": `${duration}s`,
  } as CSSProperties;

  return (
    <div
      className={
        spin
          ? "orbit-ring absolute left-1/2 top-1/2"
          : "absolute left-1/2 top-1/2"
      }
      data-reverse={reverse || undefined}
      style={style}
    >
      {items.map((icon, i) => {
        // Ikonkalarni halqa bo'ylab tekis taqsimlaymiz, startAngle dan boshlab
        const angle = startAngle + (i / items.length) * 360;
        return (
          <div
            key={icon.slug}
            className="absolute"
            style={{
              transform: `rotate(${angle}deg) translateY(-${radius}px)`,
            }}
          >
            {/* Ikonka har doim tik turadi: halqa burishi qaytariladi */}
            <div style={{ transform: `rotate(${-angle}deg)` }}>
              <div className={spin ? "orbit-counter" : undefined}>
                <Mark icon={icon} size={size} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OrbitField() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const still = useReducedMotionConfig() === true;
  const spin = !still;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden ${inView ? "" : "orbit-paused"}`}
    >
      {/*
        translateY(+15%) — markaz biroz pastga siljiydi:
        yuqori ikonkalar nav ostidan ko'rinadi,
        pastki ikonkalar product preview'ga botmaydi.
      */}
      <div style={{ transform: "translateY(15%)" }}>
        {/* Ichki halqa — yirik, 5 ta ikonka, 0° dan boshlanadi */}
        <Ring
          radius={155}
          duration={200}
          items={RING_1}
          spin={spin}
          size="lg"
          startAngle={18}
        />
        {/* O'rtacha halqa — teskari, 7 ta ikonka, 26° dan boshlanadi */}
        <Ring
          radius={255}
          duration={260}
          reverse
          items={RING_2}
          spin={spin}
          size="md"
          startAngle={26}
        />
        {/* Tashqi halqa — kichik, 2 ta ikonka, 90° dan boshlanadi (yon tomonda) */}
        <Ring
          radius={345}
          duration={320}
          items={RING_3}
          spin={spin}
          size="sm"
          startAngle={90}
        />
      </div>
    </div>
  );
}
