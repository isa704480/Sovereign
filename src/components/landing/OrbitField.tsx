"use client";

import { motion } from "motion/react";

/* AI provayder NOMLARI aylanib yuradi — qaysi AI'lar borligini aniq bildiradi
   (brend logolari emas, nomlar — toza va aniq). */

function Ring({ radius, duration, reverse, items }: { radius: number; duration: number; reverse?: boolean; items: string[] }) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: 0, height: 0 }}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      {items.map((name, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div key={name + i} className="absolute" style={{ transform: `rotate(${angle}deg) translateY(-${radius}px)` }}>
            <motion.div
              className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] font-medium tracking-wide text-text-primary/30 backdrop-blur-sm"
              animate={{ rotate: reverse ? 360 : -360 }}
              transition={{ duration, repeat: Infinity, ease: "linear" }}
            >
              {name}
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
      <Ring radius={160} duration={48} items={["Claude", "GPT", "Gemini", "Mistral"]} />
      <Ring radius={280} duration={66} reverse items={["DeepSeek", "Llama", "Grok", "Qwen", "Kimi"]} />
      <Ring radius={410} duration={90} items={["Cohere", "GLM", "NVIDIA", "MiniMax", "Gemma", "Phi"]} />
    </div>
  );
}
