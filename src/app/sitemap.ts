import type { MetadataRoute } from "next";
import { UPDATES } from "@/content/updates";
import { LEGAL_UPDATED } from "@/lib/locales/legal";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");

/**
 * lastModified — haqiqiy kontent sanasi (har so'rovda `new Date()` emas: doim "hozir o'zgargan"
 * lastmod'ni Google e'tiborsiz qoldiradi). Landing / yangiliklar — oxirgi changelog yozuvi,
 * huquqiy sahifalar — LEGAL_UPDATED. Kirish sahifalarida sana yo'q.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const product = UPDATES[0]?.date;
  return [
    { url: `${SITE_URL}/`, lastModified: product, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/updates`, lastModified: product, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/refund`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
