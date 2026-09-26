"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Menu, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { LANGS, type Lang } from "@/lib/i18n";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useChat, useT } from "@/store/chat";
import { DOCS_URL } from "./company";

const NAV = [
  { href: "#how", key: "p4dNavHow" },
  { href: "#features", key: "navFeatures" },
  { href: "#pricing", key: "navPricing" },
  { href: "#roadmap", key: "p4dNavRoadmap" },
  { href: "#about", key: "p4dNavAbout" },
  { href: DOCS_URL, key: "p4dNavDocs" },
] as const;

export function Navbar({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();
  const lang = useChat((s) => s.lang);
  const setLang = useChat((s) => s.setLang);
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
      {/* Klaviatura foydalanuvchilari uchun: menyuni o'tkazib yuborish. */}
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        {t("p4dSkip")}
      </a>

      <div
        className={cn(
          "mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300 lg:px-5",
          scrolled || open
            ? "glass shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]"
            : "border border-transparent bg-transparent",
        )}
      >
        <Logo />

        <nav aria-label={t("p4dNavMain")} className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {t(n.key)}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {/* Til tanlash — brauzerda saqlanadi, chat ham shu tilda javob beradi. */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            aria-label={t("language")}
            className="h-9 rounded-lg border border-border bg-transparent px-2 text-sm text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-primary-soft"
          >
            {LANGS.map((l) => (
              <option key={l.id} value={l.id} className="bg-bg-base">
                {l.short}
              </option>
            ))}
          </select>
          {signedIn ? (
            <Button asChild className="h-9 rounded-xl bg-primary px-4 text-white shadow-glow hover:bg-primary-dark">
              <Link href="/app">
                <MessageSquare className="size-4" /> {t("backToChat")}
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="h-9 px-3 text-text-secondary hover:text-text-primary">
                <Link href="/login">{t("login")}</Link>
              </Button>
              <Button asChild className="h-9 rounded-xl bg-primary px-4 text-white shadow-glow hover:bg-primary-dark">
                <Link href="/register">{t("startFree")}</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? t("ldMenuClose") : t("ldMenuOpen")}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          className="rounded-lg p-2 text-text-secondary hover:bg-bg-hover lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
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
            className="glass mx-auto mt-2 max-w-6xl rounded-2xl p-3 lg:hidden"
          >
            <nav aria-label={t("p4dNavMain")}>
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
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
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    lang === l.id ? "border-primary text-primary-soft" : "border-border text-text-muted",
                  )}
                >
                  {l.short}
                </button>
              ))}
            </div>
            {signedIn ? (
              <div className="mt-2 border-t border-border pt-3">
                <Button asChild className="h-10 w-full rounded-xl bg-primary text-white hover:bg-primary-dark">
                  <Link href="/app">
                    <MessageSquare className="size-4" /> {t("backToChat")}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
                <Button asChild variant="outline" className="h-10 rounded-xl">
                  <Link href="/login">{t("login")}</Link>
                </Button>
                <Button asChild className="h-10 rounded-xl bg-primary text-white hover:bg-primary-dark">
                  <Link href="/register">{t("startFree")}</Link>
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
