"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { ctaPrimarySm, ctaSecondarySm } from "@/components/landing/cta";
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
      id="main-content"
      className="flex min-h-svh flex-1 flex-col items-center justify-center bg-bg-base px-4 py-16 text-center text-text-primary"
    >
      <title>{`${t("p3bNotFoundTitle")} · SOVEREIGN AI`}</title>
      <LogoMark size={48} />
      {/* Indigo matn sifatida --accent-text (#978FFB, 7.27:1); #5B50F0 faqat fon uchun. */}
      <p className="nums mt-6 text-sm font-semibold tracking-[0.2em] text-accent-text">
        404
      </p>
      <h1 className="font-display mt-2 text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">{t("p3bNotFoundTitle")}</h1>
      <p className="mt-2 max-w-md text-sm text-text-secondary">
        {t("p3bNotFoundBody")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={ctaPrimarySm}>
          {t("p3bErrHome")}
        </Link>
        <Link href="/app" className={ctaSecondarySm}>
          {t("p3bErrChat")}
        </Link>
      </div>
    </main>
  );
}
