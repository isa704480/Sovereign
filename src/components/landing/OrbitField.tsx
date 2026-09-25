"use client";

import { motion } from "motion/react";

/* AI provayder nomlari + original monogram belgi aylanib yuradi (brend logolari
   emas — o'ziga xos harf-belgi, savdo belgisi muammosisiz). */

type P = { name: string; mark: string; hue: number };
const mk = (name: string, mark: string, hue: number): P => ({ name, mark, hue });

const RING_1: P[] = [mk("Claude", "C", 255), mk("GPT", "◆", 200), mk("Gemini", "✦", 220), mk("Mistral", "M", 30), mk("DeepSeek", "D", 210)];
const RING_2: P[] = [mk("Llama", "L", 265), mk("Grok", "×", 0), mk("Qwen", "Q", 25), mk("Kimi", "K", 280), mk("GLM", "G", 190), mk("NVIDIA", "N", 100)];
const RING_3: P[] = [mk("MiniMax", "M", 320), mk("Gemma", "g", 220), mk("Command", "⌘", 300), mk("Cohere", "◎", 160), mk("Phi", "φ", 210), mk("Nova", "★", 40), mk("Sonar", "S", 275)];
const RING_4: P[] = [mk("Nemotron", "N", 95), mk("Yi", "Y", 15), mk("Hermes", "H", 250), mk("DBRX", "B", 340), mk("GPT-OSS", "◆", 200), mk("WizardLM", "W", 285), mk("Phind", "P", 190), mk("Zephyr", "Z", 230)];

function Pill({ p }: { p: P }) {
  return (
    <span className="inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.06] bg-white/[0.02] py-1 pl-1 pr-2.5 text-[11px] font-medium text-text-primary/35 backdrop-blur-sm">
      <span
        className="grid size-5 place-items-center rounded-full text-[10px] font-bold"
        style={{ background: `hsl(${p.hue} 45% 55% / 0.18)`, color: `hsl(${p.hue} 55% 72%)` }}
      >
        {p.mark}
      </span>
      {p.name}
    </span>
  );
}

function Ring({ radius, duration, reverse, items }: { radius: number; duration: number; reverse?: boolean; items: P[] }) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: 0, height: 0 }}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      {items.map((p, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div key={p.name + i} className="absolute" style={{ transform: `rotate(${angle}deg) translateY(-${radius}px)` }}>
            <motion.div animate={{ rotate: reverse ? 360 : -360 }} transition={{ duration, repeat: Infinity, ease: "linear" }}>
              <Pill p={p} />
            </motion.div>
          </div>
        );
      })}
    </motion.div>
  );
}

export function OrbitField() {
  return (
    // Bezak — ekran o'quvchilar uchun yashirin. Kichik ekranda tashqi halqalar matn ustiga
    // tushib qolmasligi uchun faqat ichki ikkitasi ko'rinadi.
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
      <Ring radius={150} duration={50} items={RING_1} />
      <Ring radius={258} duration={68} reverse items={RING_2} />
      <div className="hidden md:contents">
        <Ring radius={372} duration={86} items={RING_3} />
        <Ring radius={488} duration={108} reverse items={RING_4} />
      </div>
    </div>
  );
}
