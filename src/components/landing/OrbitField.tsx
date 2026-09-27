"use client";

import { useInView, useReducedMotionConfig } from "motion/react";
import { useRef, type CSSProperties } from "react";
import {
  siClaude,
  siDeepseek,
  siGooglegemini,
  siKimi,
  siMeta,
  siMistralai,
  siNvidia,
  siPerplexity,
  siQwen,
  siZdotai,
  type SimpleIcon,
} from "simple-icons";

/* Katalogdagi AI laboratoriyalarining HAQIQIY belgilari (simple-icons, CC0) sekin aylanadi:
   bir rangli, xira, nomsiz — sarlavha bilan raqobatlashmaydi. Belgisi yo'q brendlar uchun
   o'ylab topilgan "logo" chizilmaydi. Butun maydon bezak (aria-hidden). */

const RING_1: SimpleIcon[] = [siClaude, siGooglegemini, siMistralai, siDeepseek, siMeta];
const RING_2: SimpleIcon[] = [siQwen, siKimi, siZdotai, siNvidia, siPerplexity];

function Mark({ icon }: { icon: SimpleIcon }) {
  return (
    <span className="grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/[0.06] bg-bg-base text-text-primary/25">
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" focusable="false">
        <path d={icon.path} />
      </svg>
    </span>
  );
}

function Ring({ radius, duration, reverse, items, spin }: { radius: number; duration: number; reverse?: boolean; items: SimpleIcon[]; spin: boolean }) {
  const style = { width: 0, height: 0, "--orbit-dur": `${duration}s` } as CSSProperties;
  return (
    <div className={spin ? "orbit-ring absolute left-1/2 top-1/2" : "absolute left-1/2 top-1/2"} data-reverse={reverse || undefined} style={style}>
      {items.map((icon, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div key={icon.slug} className="absolute" style={{ transform: `rotate(${angle}deg) translateY(-${radius}px)` }}>
            {/* Belgi har doim tik turadi: statik burchak + halqa aylanishi qaytariladi. */}
            <div style={{ transform: `rotate(${-angle}deg)` }}>
              <div className={spin ? "orbit-counter" : undefined}>
                <Mark icon={icon} />
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
  // Ekrandan tashqarida — to'xtaydi (CPU/GPU ishlamaydi).
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const still = useReducedMotionConfig() === true;
  const spin = !still;
  return (
    // Bezak — ekran o'quvchilar uchun yashirin. Aylanish juda sekin (3–4 daqiqa).
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden ${inView ? "" : "orbit-paused"}`}
    >
      <Ring radius={150} duration={180} items={RING_1} spin={spin} />
      <Ring radius={258} duration={240} reverse items={RING_2} spin={spin} />
    </div>
  );
}
