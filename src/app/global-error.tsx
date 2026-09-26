"use client"; // Xato chegaralari faqat client komponent bo'la oladi.

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LANG, isLang, LANG_COOKIE, LANGS, translate, type Lang } from "@/lib/i18n";

/**
 * Ildiz layout (yoki template) ning o'zi yiqilganda — app/error.tsx bu holatni ushlay olmaydi.
 * O'z <html>/<body> ini chizadi; global CSS va store yo'q, shuning uchun inline uslub va til
 * to'g'ridan-to'g'ri sov-lang cookie'sidan (LangSync yozadi).
 */
const subscribe = () => () => {};
function cookieLang(): Lang {
  const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]+)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return isLang(v) ? v : DEFAULT_LANG;
}

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const lang = useSyncExternalStore(subscribe, cookieLang, () => DEFAULT_LANG);
  const htmlLang = LANGS.find((l) => l.id === lang)?.htmlLang ?? "en";

  useEffect(() => {
    // Tafsilot foydalanuvchiga ko'rsatilmaydi — faqat konsol (digest server logiga mos keladi).
    console.error(error);
  }, [error]);

  return (
    <html lang={htmlLang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 16px",
          textAlign: "center",
          background: "#060812",
          color: "#F0F2FF",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>{`${translate(lang, "p3bErrTitle")} · SOVEREIGN AI`}</title>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{translate(lang, "p3bErrTitle")}</h1>
        <p style={{ marginTop: 8, maxWidth: 440, fontSize: 14, color: "#9BA3CC" }}>{translate(lang, "p3bErrBody")}</p>
        {error.digest && <p style={{ marginTop: 8, fontSize: 11, color: "#7A82B0" }}>ID: {error.digest}</p>}
        <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 40,
              padding: "0 20px",
              border: 0,
              borderRadius: 999,
              background: "#5B50F0",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {translate(lang, "p3bErrRetry")}
          </button>
          {/* To'liq sahifa yuklanishi — buzilgan ildiz layout'ni qayta quradi (<Link> emas). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 40,
              padding: "0 20px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#F0F2FF",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            {translate(lang, "p3bErrHome")}
          </a>
        </div>
      </body>
    </html>
  );
}
