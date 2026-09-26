"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { useT } from "@/store/chat";

/**
 * 404: mavjud bo'lmagan manzil yoki notFound() — sayt uslubida, tanlangan tilda.
 * Client komponent: root not-found serverda cookie o'qisa (getServerT), BUTUN sayt
 * dinamik bo'lib qolardi (CDN keshi yo'qoladi). Til brauzerdagi store'dan olinadi.
 * not-found.js metadata eksportini qo'llamaydi — sarlavha React <title> orqali.
 */
export default function NotFound() {
  const t = useT();
  return (
    <main
      className="flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      style={{ background: "#060812", color: "#F0F2FF" }}
    >
      <title>{`${t("p3bNotFoundTitle")} · SOVEREIGN AI`}</title>
      <LogoMark size={48} />
      <p className="nums mt-6 text-sm font-semibold tracking-[0.2em]" style={{ color: "#5B50F0" }}>
        404
      </p>
      <h1 className="t-display mt-2 text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">{t("p3bNotFoundTitle")}</h1>
      <p className="mt-2 max-w-md text-sm" style={{ color: "#9BA3CC" }}>
        {t("p3bNotFoundBody")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#5B50F0" }}
        >
          {t("p3bErrHome")}
        </Link>
        <Link
          href="/app"
          className="inline-flex min-h-10 items-center rounded-full border px-5 text-sm font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "rgba(255,255,255,0.12)", color: "#F0F2FF" }}
        >
          {t("p3bErrChat")}
        </Link>
      </div>
    </main>
  );
}
