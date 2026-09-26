"use client"; // Xato chegaralari (error boundary) faqat client komponent bo'la oladi.

import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { useT } from "@/store/chat";

/**
 * Segment darajasidagi xato sahifasi: kutilmagan render xatosida oq ekran o'rniga
 * tarjima qilingan xabar, "Qayta urinish" (retry — serverdan qayta o'qib chizadi) va bosh sahifa.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();

  useEffect(() => {
    // Tafsilot foydalanuvchiga ko'rsatilmaydi — faqat konsol/log uchun (digest server logiga mos keladi).
    console.error(error);
  }, [error]);

  return (
    <main
      className="flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      style={{ background: "#060812", color: "#F0F2FF" }}
    >
      <LogoMark size={48} />
      <h1 className="t-display mt-6 text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">{t("p3bErrTitle")}</h1>
      <p className="mt-2 max-w-md text-sm" style={{ color: "#9BA3CC" }}>
        {t("p3bErrBody")}
      </p>
      {error.digest && (
        <p className="nums mt-2 text-[11px]" style={{ color: "#7A82B0" }}>
          ID: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="min-h-10 rounded-full px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#5B50F0" }}
        >
          {t("p3bErrRetry")}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-full border px-5 text-sm font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "rgba(255,255,255,0.12)", color: "#F0F2FF" }}
        >
          {t("p3bErrHome")}
        </Link>
      </div>
    </main>
  );
}
