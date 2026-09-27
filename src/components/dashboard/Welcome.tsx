"use client";

import { MessageSquareHeart, Monitor, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState, type ReactNode } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { LogoMark } from "@/components/brand/Logo";
import { useLang, useT } from "@/store/chat";
import { welcomeSuggestions } from "@/lib/locales/chat-data";
import { CliInstall } from "./CliInstall";
import { DesktopPanel, useVisitorOs } from "@/components/landing/Download";
import { FeedbackDialog } from "./FeedbackDialog";

interface WelcomeProps {
  userName: string;
  onSuggestion: (text: string) => void;
  /** Rendered in the middle for themes with a centered empty-state input. */
  input?: ReactNode;
}

function Suggestions({ items, onPick }: { items: string[]; onPick: (t: string) => void }) {
  // Bitta panel + hairline ajratgichlar (alohida ramkali kartalar emas).
  return (
    <div
      className="tt grid w-full max-w-2xl grid-cols-1 gap-px overflow-hidden border sm:grid-cols-2"
      style={{ borderColor: "var(--t-border)", background: "var(--t-border)", borderRadius: "var(--t-radius)" }}
    >
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="tt min-h-11 px-4 py-3.5 text-left text-sm transition-colors hover:bg-[var(--t-surface)]"
          style={{ background: "var(--t-bg)", color: "var(--t-text-muted)" }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** Bo'sh ekran pastida: fikr bildirish va CLI o'rnatish (barcha mavzularda bir xil). */
function WelcomeExtras() {
  const tr = useT();
  // Bir vaqtda bitta panel: CLI o'rnatish yoki Cowork desktop yuklab olish.
  const [panel, setPanel] = useState<"cli" | "desktop" | null>(null);
  const cli = panel === "cli";
  const desktop = panel === "desktop";
  const os = useVisitorOs();
  const [feedback, setFeedback] = useState(false);
  // Barqaror onClose — dialog effekti har renderda qayta ishga tushib, fokusni tortmasin.
  const closeFeedback = useCallback(() => setFeedback(false), []);
  const pill =
    "tt inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium [@media(pointer:coarse)]:min-h-11 transition-colors hover:bg-[var(--surface-hover)]";
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => setPanel((p) => (p === "desktop" ? null : "desktop"))}
          aria-expanded={desktop}
          className={pill}
          style={{ borderColor: "var(--t-border)", color: desktop ? "var(--t-text)" : "var(--t-text-muted)" }}
        >
          <Monitor className="size-3.5" aria-hidden />
          {tr("dlChatButton")}
        </button>
        <button
          type="button"
          onClick={() => setPanel((p) => (p === "cli" ? null : "cli"))}
          aria-expanded={cli}
          className={pill}
          style={{ borderColor: "var(--t-border)", color: cli ? "var(--t-text)" : "var(--t-text-muted)" }}
        >
          <Terminal className="size-3.5" aria-hidden />
          {tr("cliButton")}
        </button>
        <button
          type="button"
          onClick={() => setFeedback(true)}
          className={pill}
          style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
        >
          <MessageSquareHeart className="size-3.5" aria-hidden />
          {tr("fbButton")}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {cli && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="flex w-full justify-center"
          >
            <CliInstall />
          </motion.div>
        )}
        {desktop && (
          <motion.div
            key="desktop"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="w-full max-w-3xl text-left"
          >
            <DesktopPanel os={os} />
          </motion.div>
        )}
      </AnimatePresence>
      <FeedbackDialog open={feedback} onClose={closeFeedback} />
    </div>
  );
}

/** Bo'sh holat ekrani — har model uchun bir xil SOVEREIGN ko'rinishi. */
export function Welcome({ onSuggestion, input }: WelcomeProps) {
  const tr = useT();
  const lang = useLang();
  const suggestions = welcomeSuggestions(lang);

  // Tashqi qatlam scroll qiladi (kichik telefonlarda kiritish maydoni pastga surilib
  // yashirinmasin); ichki blok my-auto bilan joy bo'lsa markazda turadi.
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto my-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-6 md:py-10">
        <div className="text-center">
          <LogoMark size={48} className="mx-auto" />
          <h1 className="t-display mt-5 text-balance text-3xl font-bold tracking-[-0.02em] md:text-4xl" style={{ color: "var(--t-text)" }}>
            {tr("greeting")}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--t-text-muted)" }}>{tr("subGreeting")}</p>
        </div>
        {input}
        <Suggestions items={suggestions} onPick={onSuggestion} />
        <WelcomeExtras />
      </div>
    </motion.div>
  );
}
