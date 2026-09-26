"use client";

import { Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { LATEST_UPDATE_ID, UPDATES_SEEN_KEY, readSeenUpdate, unseenUpdates, type ProductUpdate, type UpdateTag } from "@/content/updates";
import { pick, type TKey } from "@/lib/i18n";
import { EASE } from "@/lib/motion";
import { useLang, useT } from "@/store/chat";

/** Sahifa ochilgach karta biroz kechikib chiqadi (birinchi render/animatsiyalarga xalaqit bermasin). */
const SHOW_DELAY_MS = 1200;

const TAG_KEY: Record<UpdateTag, TKey> = { new: "wnTagNew", improved: "wnTagImproved", fixed: "wnTagFixed" };

function markSeen() {
  if (!LATEST_UPDATE_ID) return;
  try {
    localStorage.setItem(UPDATES_SEEN_KEY, LATEST_UPDATE_ID);
  } catch {
    /* localStorage yopiq — keyingi safar yana ko'rsatiladi */
  }
}

/**
 * "Nima yangi" — foydalanuvchi oxirgi ko'rgan yozuvdan keyingi yangiliklar (src/content/updates.ts).
 * Yopilganda eng yangi id localStorage'ga yoziladi; yangi yozuv qo'shilmaguncha qayta chiqmaydi.
 */
export function WhatsNew() {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<ProductUpdate[]>([]);

  useEffect(() => {
    const id = setTimeout(() => {
      // localStorage ishlamasa (maxfiy oyna) — har safar chiqmasin: faqat o'qish mumkin bo'lsa ko'rsatamiz.
      try {
        localStorage.getItem(UPDATES_SEEN_KEY);
      } catch {
        return;
      }
      setItems(unseenUpdates(readSeenUpdate()));
    }, SHOW_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  const dismiss = () => {
    markSeen();
    setItems([]);
  };

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.section
          key="whats-new"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: EASE }}
          aria-labelledby="whats-new-title"
          className="tt fixed right-3 top-16 z-40 w-[min(calc(100vw-24px),360px)] border p-4 text-sm shadow-lg md:right-5"
          style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", borderRadius: 16, color: "var(--t-text)" }}
        >
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0" style={{ color: "var(--t-accent)" }} aria-hidden />
            <h2 id="whats-new-title" className="min-w-0 flex-1 font-semibold">
              {t("wnTitle")}
            </h2>
            <button
              type="button"
              onClick={dismiss}
              className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: "var(--t-text-muted)" }}
              aria-label={t("close")}
              title={t("close")}
            >
              <X className="size-4" />
            </button>
          </div>

          <ul className="mt-2 space-y-3">
            {items.map((u) => (
              <li key={u.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "color-mix(in srgb, var(--t-primary) 18%, transparent)", color: "var(--t-accent)" }}
                  >
                    {t(TAG_KEY[u.tag])}
                  </span>
                  <span className="min-w-0 truncate font-medium">{pick(lang, u.title)}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--t-text-muted)" }}>
                  {pick(lang, u.body)}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2">
            <a
              href="/updates"
              target="_blank"
              rel="noopener"
              onClick={markSeen}
              className="text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--t-accent)" }}
            >
              {t("wnSeeAll")} →
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-8 rounded-lg px-3 text-xs font-semibold text-white"
              style={{ background: "var(--t-primary)" }}
            >
              {t("wnGotIt")}
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
