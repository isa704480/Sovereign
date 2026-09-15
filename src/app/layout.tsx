import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Syne } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "SOVEREIGN AI — Your AI. Your Truth. Your Data. Forever.",
    template: "%s · SOVEREIGN AI",
  },
  description:
    "GPT-4o, Claude, Gemini, Mistral — hamma bitta interfeys orqali. Suhbatlaringiz shifrlangan. Xotirangiz sizda.",
  applicationName: "SOVEREIGN AI",
  keywords: ["AI", "Claude", "ChatGPT", "Gemini", "privacy", "maxfiylik", "O'zbek"],
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
      lang="uz"
      className={`${syne.variable} ${dmSans.variable} ${dmMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg-base text-text-primary">
        {children}
      </body>
    </html>
  );
}
