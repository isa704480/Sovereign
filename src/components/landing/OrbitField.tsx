"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import {
  siClaude,
  siDatabricks,
  siDeepmind,
  siDeepseek,
  siGooglegemini,
  siHuggingface,
  siKimi,
  siMeta,
  siMinimax,
  siMistralai,
  siNvidia,
  siPerplexity,
  siQwen,
  siZdotai,
  type SimpleIcon,
} from "simple-icons";

/* AI provayderlarining logolari (simple-icons, CC0) sekin aylanib yuradi — faqat belgi,
   nomsiz, bir rangli va xira: sarlavha bilan raqobatlashmaydi. Logosi mavjud bo'lmagan
   brendlar uchun toza harf-belgi. Butun maydon bezak (aria-hidden). */

type P = { id: string; icon?: SimpleIcon; mark?: string };
const ic = (id: string, icon: SimpleIcon): P => ({ id, icon });
const ch = (id: string, mark: string): P => ({ id, mark });

const RING_1: P[] = [ic("claude", siClaude), ch("gpt", "◆"), ic("gemini", siGooglegemini), ic("mistral", siMistralai), ic("deepseek", siDeepseek)];
const RING_2: P[] = [ic("llama", siMeta), ch("grok", "×"), ic("qwen", siQwen), ic("kimi", siKimi), ic("glm", siZdotai), ic("nvidia", siNvidia)];
const RING_3: P[] = [ic("minimax", siMinimax), ic("gemma", siDeepmind), ch("command", "⌘"), ch("cohere", "◎"), ch("phi", "φ"), ch("nova", "★"), ic("sonar", siPerplexity)];
const RING_4: P[] = [ic("nemotron", siNvidia), ch("yi", "Y"), ch("hermes", "H"), ic("dbrx", siDatabricks), ch("gpt-oss", "◆"), ch("wizardlm", "W"), ch("phind", "P"), ic("zephyr", siHuggingface)];

function Mark({ p }: { p: P }) {
  return (
    <span className="grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/[0.06] bg-white/[0.02] text-text-primary/30 backdrop-blur-sm">
      {p.icon ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" focusable="false">
          <path d={p.icon.path} />
        </svg>
      ) : (
        <span className="text-[13px] font-bold leading-none">{p.mark}</span>
      )}
    </span>
  );
}

function Ring({ radius, duration, reverse, items, still }: { radius: number; duration: number; reverse?: boolean; items: P[]; still: boolean }) {
  // Harakatni kamaytirish (OS yoki Sozlamalar) yoqilsa — halqa umuman aylanmaydi.
  const spin = still ? undefined : { rotate: reverse ? -360 : 360 };
  const counter = still ? undefined : { rotate: reverse ? 360 : -360 };
  const transition = { duration, repeat: Infinity, ease: "linear" } as const;
  return (
    <motion.div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }} animate={spin} transition={transition}>
      {items.map((p, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div key={p.id} className="absolute" style={{ transform: `rotate(${angle}deg) translateY(-${radius}px)` }}>
            <motion.div animate={counter} transition={transition}>
              <Mark p={p} />
            </motion.div>
          </div>
        );
      })}
    </motion.div>
  );
}

export function OrbitField() {
  const still = useReducedMotionConfig() === true;
  return (
    // Bezak — ekran o'quvchilar uchun yashirin. Kichik ekranda tashqi halqalar matn ustiga
    // tushib qolmasligi uchun faqat ichki ikkitasi ko'rinadi. Aylanish juda sekin (3–6 daqiqa).
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
      <Ring radius={150} duration={180} items={RING_1} still={still} />
      <Ring radius={258} duration={240} reverse items={RING_2} still={still} />
      <div className="hidden md:contents">
        <Ring radius={372} duration={300} items={RING_3} still={still} />
        <Ring radius={488} duration={360} reverse items={RING_4} still={still} />
      </div>
    </div>
  );
}
