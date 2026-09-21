"use client";

import { motion } from "motion/react";

/* Soddalashtirilgan AI provayder belgilari (aylanib yuradi). */
const LOGOS: Record<string, React.ReactNode> = {
  openai: <path d="M12 3.6a3 3 0 0 1 2.6 1.5 3 3 0 0 1 2.9 4.9 3 3 0 0 1-1.1 4.9 3 3 0 0 1-5.4.6 3 3 0 0 1-4.5-2.9 3 3 0 0 1 1.1-4.9A3 3 0 0 1 9.4 5 3 3 0 0 1 12 3.6zM12 8v4l3 1.7" />,
  claude: <g><path d="M12 3v18M5 7l14 10M19 7L5 17" /></g>,
  gemini: <path d="M12 2c.4 5.6 2.4 7.6 8 8-5.6.4-7.6 2.4-8 8-.4-5.6-2.4-7.6-8-8 5.6-.4 7.6-2.4 8-8z" />,
  meta: <path d="M4 15c0-4 2-7 4.5-7S12 15 15 15s3-7 5-7 1 10-2 10c-2.5 0-3.5-5-6-5s-3.5 5-6 5-2-2-2-6z" />,
  mistral: <g><rect x="4" y="4" width="4" height="4" /><rect x="10" y="4" width="4" height="4" /><rect x="16" y="4" width="4" height="4" /><rect x="4" y="10" width="4" height="4" /><rect x="16" y="10" width="4" height="4" /><rect x="7" y="16" width="4" height="4" /><rect x="13" y="16" width="4" height="4" /></g>,
  deepseek: <path d="M4 14c3 3 8 3 11 0 2-2 5-2 5 0M4 10c1-2 3-3 5-2M15 8l2-1" />,
  grok: <path d="M5 5l14 14M19 5L9 15M5 19l4-4" />,
  qwen: <g><circle cx="12" cy="12" r="8" /><path d="M8 12c1.5-3 6.5-3 8 0-1.5 3-6.5 3-8 0z" /></g>,
  nvidia: <path d="M4 12c3-4 9-5 13-2 3 2 3 4 0 4-4 0-7-4-11-2M4 12c0 3 5 5 9 3" />,
  cohere: <g><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></g>,
};
type LogoKey = keyof typeof LOGOS;

function Logo({ k }: { k: LogoKey }) {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {LOGOS[k]}
    </svg>
  );
}

function Ring({ radius, duration, reverse, items }: { radius: number; duration: number; reverse?: boolean; items: LogoKey[] }) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: 0, height: 0 }}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      {items.map((k, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div
            key={k + i}
            className="absolute"
            style={{ transform: `rotate(${angle}deg) translateY(-${radius}px)` }}
          >
            <motion.div
              className="grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-white/5 bg-white/[0.02] text-text-primary/25 backdrop-blur-sm"
              animate={{ rotate: reverse ? 360 : -360 }}
              transition={{ duration, repeat: Infinity, ease: "linear" }}
            >
              <Logo k={k} />
            </motion.div>
          </div>
        );
      })}
    </motion.div>
  );
}

export function OrbitField() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
      <Ring radius={150} duration={46} items={["openai", "claude", "gemini", "mistral"]} />
      <Ring radius={270} duration={64} reverse items={["meta", "deepseek", "grok", "qwen", "nvidia"]} />
      <Ring radius={400} duration={88} items={["cohere", "gemini", "claude", "openai", "mistral", "deepseek"]} />
    </div>
  );
}
