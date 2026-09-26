import type { Metadata } from "next";
import { getHealthSnapshot } from "@/lib/status/health";
import type { HealthSnapshot } from "@/lib/status/types";
import { StatusBoard } from "./StatusBoard";

/**
 * Ommaviy status sahifasi (status.soveregn.xyz → /status). Har so'rovda render
 * bo'ladi, lekin snapshot server xotirasida 60s keshlangan — upstream'lar
 * bosimga tushmaydi. Faqat shu route dinamik; boshqa sahifalarga ta'sir qilmaydi.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "SOVEREIGN Status" },
  description: "Live status of SOVEREIGN AI services: web app, database, AI gateway, image generation and payments.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "SOVEREIGN Status",
    description: "Live status of SOVEREIGN AI services.",
  },
};

export default async function StatusPage() {
  let initial: HealthSnapshot | null = null;
  try {
    initial = await getHealthSnapshot();
  } catch {
    initial = null;
  }
  return <StatusBoard initial={initial} />;
}
