import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Syne } from "next/font/google";
import { LangSync } from "@/components/LangSync";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { translate } from "@/lib/i18n";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");

/**
 * Metadata va <html lang> STATIK (en — sayt standart tili): cookie o'qilsa har sahifa har so'rovda
 * qayta render bo'lardi va CDN keshi yo'qolardi — yuqori yuklamada qimmat.
 * Til brauzerda LangSync orqali o'rnatiladi. OG rasm — app/opengraph-image.tsx.
 */
const description = translate("en", "uxMetaDescription");

/*
 * SEO:
 *  - canonical / og:url "./" — metadataBase + har sahifaning O'Z yo'li (/terms, /share/<id>);
 *    ?next=, ?error=, ?lang= kabi query variantlari alohida URL bo'lib qolmaydi.
 *  - og:title / og:description / twitter ATAYLAB berilmagan: Next ularni sahifaning
 *    title (shablon bilan) va description'idan to'ldiradi — /share, /terms preview'lari
 *    bosh sahifaniki bo'lib qolmaydi. (Bola sahifa openGraph bersa, u to'liq almashtiradi.)
 *  - og:locale:alternate yo'q: tilga xos URL (hreflang) hali yo'q — til faqat brauzerda.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SOVEREIGN AI — Your AI. Your Truth. Your Data. Forever.",
    template: "%s · SOVEREIGN AI",
  },
  description,
  applicationName: "SOVEREIGN AI",
  keywords: ["AI", "Claude", "ChatGPT", "Gemini", "privacy", "maxfiylik", "O'zbek"],
  alternates: { canonical: "./" },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    // iOS apple-touch-icon uchun SVG'ni qabul qilmaydi — app/apple-icon.png (180px). metadata.icons
    // berilganda fayl-konvensiya ikonkalari avtomatik qo'shilmaydi, shuning uchun aniq ko'rsatiladi.
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    url: "./",
    siteName: "SOVEREIGN",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#060812",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} ${dmMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg-base text-text-primary">
        <LangSync />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
