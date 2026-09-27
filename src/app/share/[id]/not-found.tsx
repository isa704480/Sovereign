"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { useT } from "@/store/chat";

/**
 * Ulashilgan suhbat topilmadi (o'chirilgan, noto'g'ri havola yoki muddati o'tgan) — sababi va
 * keyingi qadam bilan, tanlangan tilda. Client komponent: til brauzerdagi store'dan olinadi.
 */
export default function ShareNotFound() {
  const t = useT();
  return (
    <main
      className="flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      style={{ background: "#060812", color: "#F0F2FF" }}
    >
      <title>{`${t("chShareNotFound")} · SOVEREIGN AI`}</title>
      <LogoMark size={44} />
      <h1 className="t-display mt-6 text-balance text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">{t("chShareNotFound")}</h1>
      <p className="mt-2 max-w-md text-sm" style={{ color: "#9BA3CC" }}>
        {t("p21ShareNotFoundBody")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#5B50F0" }}
        >
          {t("p3bErrHome")}
        </Link>
        <Link
          href="/register"
          className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "rgba(255,255,255,0.12)", color: "#F0F2FF" }}
        >
          {t("chShareTry")}
        </Link>
      </div>
    </main>
  );
}
