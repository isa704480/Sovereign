"use client";

import { Lightbulb, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { TIP_INDEX_KEY, TIP_LAST_AT_KEY, tipAt, tipDue, type Tip } from "@/content/tips";
import { hasUnseenUpdates } from "@/content/updates";
import { pick } from "@/lib/i18n";
import { EASE } from "@/lib/motion";
import { useChat, useLang, useT } from "@/store/chat";

type TipPanel = Extract<NonNullable<Tip["action"]>, { kind: "open" }>["panel"];

interface TipCardProps {
  /** Dashboard'dagi mavjud panelni ochadi (Xotira, Bilimlar bazasi, Skills, Connectorlar, Cowork). */
  onOpenPanel: (panel: TipPanel) => void;
  /** Research'ni yoqadi (tarif tekshiruvi Dashboard'da — kerak bo'lsa tarif oynasi ochiladi). */
  onResearch: () => void;
  /** Yozish maydoniga namunaviy so'rov qo'yadi (yubormaydi). */
  onDraft: (text: string) => void;
}

const SHOW_DELAY_MS = 2500;

function readNumber(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Har 30 soatda bitta "platformani shunday ishlatib ko'ring" maslahati (src/content/tips.ts).
 * Birinchi tashrifda faqat soat boshlanadi (karta chiqmaydi). "Nima yangi" ko'rinayotganda
 * chiqmaydi — ikkita karta ustma-ust bo'lmasin. localStorage yopiq bo'lsa hech qachon chiqmaydi.
 */
export function TipCard({ onOpenPanel, onResearch, onDraft }: TipCardProps) {
  const t = useT();
  const lang = useLang();
  const [tip, setTip] = useState<Tip | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const now = Date.now();
        const last = readNumber(TIP_LAST_AT_KEY);
        if (last == null || last > now) {
          // Birinchi tashrif yoki soat orqaga surilgan — hisob shu paytdan boshlanadi.
          localStorage.setItem(TIP_LAST_AT_KEY, String(now));
          return;
        }
        if (!tipDue(last, now) || hasUnseenUpdates()) return;
        const idx = readNumber(TIP_INDEX_KEY) ?? 0;
        // Ko'rsatilgan zahoti hisoblanadi: reload qilinsa ham 30 soat ichida qayta chiqmaydi.
        localStorage.setItem(TIP_LAST_AT_KEY, String(now));
        localStorage.setItem(TIP_INDEX_KEY, String(idx + 1));
        setTip(tipAt(idx));
      } catch {
        /* localStorage yopiq — maslahat ko'rsatilmaydi */
      }
    }, SHOW_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  const close = () => {
    setTip(null);
    setDone(null);
  };
  /** Natijani qisqa ko'rsatib, kartani yopadi. */
  const finish = (msg: string) => {
    setDone(msg);
    setTimeout(close, 1200);
  };

  const run = () => {
    const a = tip?.action;
    if (!a) return;
    if (a.kind === "copy") {
      if (!navigator.clipboard) {
        window.prompt(t("tipCopy"), a.text);
        return;
      }
      navigator.clipboard.writeText(a.text).then(
        () => finish(t("copied")),
        () => window.prompt(t("tipCopy"), a.text),
      );
      return;
    }
    if (a.kind === "blind") {
      useChat.getState().setBlindPrompting(true);
      finish(t("tipBlindOn"));
      return;
    }
    if (a.kind === "open") onOpenPanel(a.panel);
    else if (a.kind === "research") onResearch();
    else if (a.kind === "model") window.dispatchEvent(new Event("sovereign:open-model"));
    else if (a.kind === "draft") onDraft(pick(lang, a.text));
    close();
  };

  return (
    <AnimatePresence>
      {tip && (
        <motion.section
          key={tip.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: EASE }}
          aria-labelledby="tip-card-title"
          className="tt fixed right-3 top-16 z-40 w-[min(calc(100vw-24px),340px)] border p-4 text-sm shadow-lg md:right-5"
          style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", borderRadius: 16, color: "var(--t-text)" }}
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 size-4 shrink-0" style={{ color: "var(--t-accent)" }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
                {t("tipEyebrow")}
              </p>
              <h2 id="tip-card-title" className="mt-0.5 font-semibold">
                {pick(lang, tip.title)}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: "var(--t-text-muted)" }}
              aria-label={t("tipDismiss")}
              title={t("tipDismiss")}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-2 break-words text-xs leading-relaxed" style={{ color: "var(--t-text-muted)" }}>
            {pick(lang, tip.body)}
          </p>
          {tip.action && (
            <div className="mt-3 flex justify-end" aria-live="polite">
              <button
                type="button"
                onClick={run}
                className="min-h-8 rounded-lg px-3 text-xs font-semibold text-white"
                style={{ background: "var(--t-primary)" }}
              >
                {done ?? (tip.action.kind === "copy" ? t("tipCopy") : t("tipTry"))}
              </button>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
