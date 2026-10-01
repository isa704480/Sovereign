"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Menu, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { LANGS } from "@/lib/i18n";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useChat, useT } from "@/store/chat";
import { DOCS_URL } from "./company";
import { ctaPrimarySm, ctaSecondarySm } from "./cta";
import { useSignedIn } from "./use-signed-in";

// "/#…" — Navbar huquqiy/yangiliklar sahifalarida ham chiziladi: nisbiy "#pricing"
// u yerda /terms#pricing bo'lib o'lik havola bo'lardi. Landing'ning o'zida bu oddiy scroll.
const NAV = [
  { href: "/#how", key: "p4dNavHow" },
  { href: "/#download", key: "dlNav" },
  { href: "/#features", key: "navFeatures" },
  { href: "/#pricing", key: "navPricing" },
  { href: "/#roadmap", key: "p4dNavRoadmap" },
  { href: "/#about", key: "p4dNavAbout" },
  { href: DOCS_URL, key: "p4dNavDocs" },
] as const;

/**
 * signedIn — server bilgan holat (ixtiyoriy). Sahifalar statik bo'lgani uchun asosiy manba
 * brauzerdagi sessiya cookie'si (useSignedIn): huquqiy sahifalarda ham kirgan foydalanuvchi
 * "Kirish / Bepul boshlash" o'rniga "Chatga qaytish"ni ko'radi.
 */
export function Navbar({ signedIn: signedInProp = false }: { signedIn?: boolean }) {
  const t = useT();
  const lang = useChat((s) => s.lang);
  const setLang = useChat((s) => s.setLang);
  const signedIn = useSignedIn() || signedInProp;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <motion.header
      // initial={false}: SSR HTML'da navbar darhol ko'rinadi (JS kutilmaydi).
      initial={false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
      className="fixed inset-x-0 top-0 z-50 px-3"
    >
      {/* "Asosiy mazmunga o'tish" havolasi root layout'da (SkipLink) — har sahifada bir xil. */}
      <div
        className={cn(
          "mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl px-3 py-1.5 transition-[background-color,border-color,box-shadow] duration-300 lg:px-5 lg:py-2",
          // Shisha + hairline faqat kontent ostidan o'tganda (scroll) — tepada shaffof.
          scrolled || open ? "glass shadow-sm" : "border border-transparent bg-transparent",
        )}
      >
        <Logo />

        <nav aria-label={t("p4dNavMain")} className="hidden min-w-0 flex-1 items-center justify-center gap-0 lg:flex xl:gap-0.5">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary xl:px-3 xl:text-sm"
            >
              {t(n.key)}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          {/* Til tanlash — brauzerda saqlanadi, chat ham shu tilda javob beradi.
              Umumiy komponent: fokus halqasi (focus-visible) bilan. */}
          <LangSwitcher />
          {signedIn ? (
            <Link href="/app" className={ctaPrimarySm}>
              <MessageSquare className="size-4" aria-hidden="true" /> {t("backToChat")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                {t("login")}
              </Link>
              <Link href="/register" className={ctaPrimarySm}>
                {t("startFree")}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? t("ldMenuClose") : t("ldMenuOpen")}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          className="grid size-11 place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary lg:hidden"
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="landing-mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="glass mx-auto mt-2 max-w-6xl rounded-2xl p-3 shadow-md lg:hidden"
            // Menyu matn ustiga ochiladi: deyarli to'liq qoplama, orqadagi sarlavha o'qilmaydi.
            style={{ background: "rgba(6, 8, 18, 0.96)" }}
          >
            <nav aria-label={t("p4dNavMain")}>
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-3 text-[15px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  {t(n.key)}
                </a>
              ))}
            </nav>
            <div role="group" aria-label={t("language")} className="mt-2 flex gap-1.5 border-t border-border pt-3">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  aria-pressed={lang === l.id}
                  aria-label={l.label}
                  lang={l.htmlLang}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm",
                    lang === l.id ? "border-primary text-accent-text" : "border-border text-text-secondary",
                  )}
                >
                  {l.short}
                </button>
              ))}
            </div>
            {signedIn ? (
              <div className="mt-2 border-t border-border pt-3">
                <Link href="/app" className={`${ctaPrimarySm} w-full`}>
                  <MessageSquare className="size-4" aria-hidden="true" /> {t("backToChat")}
                </Link>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
                <Link href="/login" className={ctaSecondarySm}>
                  {t("login")}
                </Link>
                <Link href="/register" className={ctaPrimarySm}>
                  {t("startFree")}
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
