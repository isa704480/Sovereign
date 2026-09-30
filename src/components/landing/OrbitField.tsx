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
 * AI laboratoriyalarining rasmiy belgilari (simple-icons, CC0).
 * Har bir belgi o'z brend rangida ko'rsatiladi — rangli, yorqin, kattalashtirilgan.
 * Uch halqa: ichki sekin, o'rtacha teskari, tashqi juda sekin.
 */

// Brend ranglarini to'g'ridan-to'g'ri simple-icons.hex dan olamiz
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
  ollama:       "#A78BFA",   // custom — ollama.com purple
  kimi:         "#00C4CC",   // custom — Moonshot teal
  zdotai:       "#8B7DFF",   // custom — soft violet
  githubcopilot:"#6E40C9",   // custom — Copilot purple
};

function getBrandColor(slug: string): string {
  return BRAND_COLORS[slug] ?? "#6B7280";
}

// Halqa 1 — ichki (radius 160): yirik flagmanlar
const RING_1: SimpleIcon[] = [
  siClaude,
  siGooglegemini,
  siMistralai,
  siDeepseek,
  siMeta,
  siPerplexity,
];

// Halqa 2 — o'rtacha (radius 280): kuchli modellar
const RING_2: SimpleIcon[] = [
  siQwen,
  siNvidia,
  siHuggingface,
  siAnthropic,
  siKimi,
  siOllama,
  siZdotai,
];

// Halqa 3 — tashqi (radius 400): qo'shimcha ekotizim
const RING_3: SimpleIcon[] = [
  siGithubcopilot,
  siDeepseek,
  siGooglegemini,
  siMistralai,
  siQwen,
  siMeta,
  siPerplexity,
  siNvidia,
];

interface MarkProps {
  icon: SimpleIcon;
  size: "sm" | "md" | "lg";
}

function Mark({ icon, size }: MarkProps) {
  const color = getBrandColor(icon.slug);
  const sizeClass = size === "lg" ? "size-14" : size === "md" ? "size-11" : "size-9";
  const iconClass = size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4";

  return (
    <span
      className={`grid ${sizeClass} -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-bg-base shadow-lg transition-all`}
      style={{
        boxShadow: `0 0 16px 2px ${color}33, 0 0 4px 1px ${color}22`,
        borderColor: `${color}30`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className={iconClass}
        fill={color}
        focusable="false"
        style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
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
}

function Ring({ radius, duration, reverse, items, spin, size }: RingProps) {
  const style = { width: 0, height: 0, "--orbit-dur": `${duration}s` } as CSSProperties;
  return (
    <div
      className={spin ? "orbit-ring absolute left-1/2 top-1/2" : "absolute left-1/2 top-1/2"}
      data-reverse={reverse || undefined}
      style={style}
    >
      {items.map((icon, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div
            key={`${icon.slug}-${i}`}
            className="absolute"
            style={{ transform: `rotate(${angle}deg) translateY(-${radius}px)` }}
          >
            {/* Belgi har doim tik turadi */}
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
      {/* Ichki halqa — katta ikonkalar, sekin */}
      <Ring radius={170} duration={200} items={RING_1} spin={spin} size="lg" />
      {/* O'rtacha halqa — o'rta ikonkalar, teskari */}
      <Ring radius={295} duration={270} reverse items={RING_2} spin={spin} size="md" />
      {/* Tashqi halqa — kichik ikonkalar, juda sekin */}
      <Ring radius={415} duration={340} items={RING_3} spin={spin} size="sm" />
    </div>
  );
}
