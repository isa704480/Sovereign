import type { MetadataRoute } from "next";
import { UPDATES } from "@/content/updates";
import { LEGAL_UPDATED } from "@/lib/locales/legal";
import MODEL_COMPARE from "@/data/model-compare.json";
import { COMPARE_MODELS } from "@/app/compare/[slug]/page";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");

/**
 * lastModified — haqiqiy kontent sanasi (har so'rovda `new Date()` emas: doim "hozir o'zgargan"
 * lastmod'ni Google e'tiborsiz qoldiradi). Landing / yangiliklar — oxirgi changelog yozuvi,
 * huquqiy sahifalar — LEGAL_UPDATED. Kirish sahifalarida sana yo'q.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const product = UPDATES[0]?.date;
  // Faqat yakuniy (yo'naltirilmaydigan) manzillar: subdomainlar yoqilganda /register va /login
  // app.<domen>'ga 308 bilan ketadi (u yerda noindex) — sitemap'ga kirmaydi.
  const authPages: MetadataRoute.Sitemap =
    process.env.SUBDOMAINS === "on"
      ? []
      : [
          { url: `${SITE_URL}/register`, changeFrequency: "monthly", priority: 0.8 },
          { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.5 },
        ];
  return [
    { url: `${SITE_URL}/`, lastModified: product, changeFrequency: "weekly", priority: 1 },
    ...authPages,
    { url: `${SITE_URL}/updates`, lastModified: product, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/compare`, lastModified: MODEL_COMPARE.runDate, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/refund`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    // Model taqqoslash sahifalari (SEO)
    ...(() => {
      const pages: MetadataRoute.Sitemap = [];
      for (let i = 0; i < COMPARE_MODELS.length; i++) {
        for (let j = i + 1; j < COMPARE_MODELS.length; j++) {
          const a = COMPARE_MODELS[i].slug;
          const b = COMPARE_MODELS[j].slug;
          const slug = a < b ? `${a}-vs-${b}` : `${b}-vs-${a}`;
          pages.push({ url: `${SITE_URL}/compare/${slug}`, changeFrequency: "monthly", priority: 0.7 });
        }
      }
      return pages;
    })(),
  ];
}
