import { tipAt } from "@/content/tips";
import { UPDATES } from "@/content/updates";
import { isLang, pick, type L10n, type Lang } from "@/lib/i18n";

/**
 * Qayta jalb qilish (tip) emaili — matn va HTML. Toza funksiya: tarmoq yo'q, sir yo'q.
 * Maslahat navbati: tipAt(seq) — foydalanuvchi har safar keyingi maslahatni oladi.
 */

const COPY = {
  subject: {
    uz: "{title} — SOVEREIGN maslahati",
    "uz-cyrl": "{title} — SOVEREIGN маслаҳати",
    ru: "{title} — совет от SOVEREIGN",
    en: "{title} — a SOVEREIGN tip",
  },
  hiName: { uz: "Salom, {name}!", "uz-cyrl": "Салом, {name}!", ru: "Привет, {name}!", en: "Hi {name}," },
  hi: { uz: "Salom!", "uz-cyrl": "Салом!", ru: "Привет!", en: "Hi there," },
  intro: {
    uz: "SOVEREIGN'dan keyingi foydalanishingiz uchun bitta g'oya:",
    "uz-cyrl": "SOVEREIGN'дан кейинги фойдаланишингиз учун битта ғоя:",
    ru: "Одна идея для следующего захода в SOVEREIGN:",
    en: "One idea for your next session on SOVEREIGN:",
  },
  cta: { uz: "SOVEREIGN'ni ochish", "uz-cyrl": "SOVEREIGN'ни очиш", ru: "Открыть SOVEREIGN", en: "Open SOVEREIGN" },
  latest: { uz: "So'nggi yangilik:", "uz-cyrl": "Сўнгги янгилик:", ru: "Последнее обновление:", en: "Latest update:" },
  allUpdates: { uz: "Barcha yangiliklar", "uz-cyrl": "Барча янгиликлар", ru: "Все обновления", en: "All updates" },
  why: {
    uz: "Bu xatni Sozlamalar'da \"Maslahat va yangiliklarni emailga yuborish\"ni yoqqaningiz uchun oldingiz. Faqat 30 soatdan ko'p kirmasangiz va ko'pi bilan 30 soatda bir marta yozamiz.",
    "uz-cyrl": "Бу хатни Созламалар'да \"Маслаҳат ва янгиликларни emailга юбориш\"ни ёққанингиз учун олдингиз. Фақат 30 соатдан кўп кирмасангиз ва кўпи билан 30 соатда бир марта ёзамиз.",
    ru: "Вы получили это письмо, потому что включили «Присылать советы и новости на email» в Настройках. Пишем, только если вас не было больше 30 часов, и не чаще раза в 30 часов.",
    en: "You're getting this because you turned on \"Email me tips & updates\" in Settings. We only write when you've been away for 30+ hours, and at most once every 30 hours.",
  },
  unsubscribe: {
    uz: "Bir bosishda obunani bekor qilish",
    "uz-cyrl": "Бир босишда обунани бекор қилиш",
    ru: "Отписаться в один клик",
    en: "Unsubscribe in one click",
  },
  address: {
    uz: "SOVEREIGN AI · Toshkent, O'zbekiston",
    "uz-cyrl": "SOVEREIGN AI · Тошкент, Ўзбекистон",
    ru: "SOVEREIGN AI · Ташкент, Узбекистан",
    en: "SOVEREIGN AI · Tashkent, Uzbekistan",
  },
} satisfies Record<string, L10n>;

export interface TipEmailInput {
  lang: string | null | undefined;
  fullName: string | null | undefined;
  /** Jami yuborilganlar soni (profiles.tip_email_seq) — maslahat navbati. */
  seq: number;
  /** Masalan https://soveregn.xyz (oxirida / yo'q). */
  siteUrl: string;
  unsubscribeUrl: string;
}

export interface TipEmail {
  lang: Lang;
  tipId: string;
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Ismning birinchi so'zi, boshqaruv belgilarisiz, 40 belgigacha (sarlavha/salom uchun). */
export function firstName(full: string | null | undefined): string {
  const clean = (full ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim();
  return clean.split(/\s+/)[0]?.slice(0, 40) ?? "";
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

export function buildTipEmail(input: TipEmailInput): TipEmail {
  const lang: Lang = isLang(input.lang) ? input.lang : "en";
  const tip = tipAt(input.seq);
  const title = pick(lang, tip.title);
  const body = pick(lang, tip.body);
  const name = firstName(input.fullName);
  const hi = name ? fill(pick(lang, COPY.hiName), { name }) : pick(lang, COPY.hi);
  const latest = UPDATES[0];
  const latestTitle = latest ? pick(lang, latest.title) : "";
  const appUrl = `${input.siteUrl}/app`;
  const updatesUrl = `${input.siteUrl}/updates`;
  // Sarlavhada yangi qator bo'lmasin (header injection'dan himoya — Resend ham tekshiradi).
  const subject = fill(pick(lang, COPY.subject), { title }).replace(/[\r\n]+/g, " ");

  const text = [
    hi,
    "",
    pick(lang, COPY.intro),
    "",
    title,
    body,
    "",
    `${pick(lang, COPY.cta)}: ${appUrl}`,
    latest ? `\n${pick(lang, COPY.latest)} ${latestTitle} — ${updatesUrl}` : "",
    "",
    "—",
    pick(lang, COPY.why),
    `${pick(lang, COPY.unsubscribe)}: ${input.unsubscribeUrl}`,
    pick(lang, COPY.address),
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="${lang === "uz-cyrl" ? "uz-Cyrl" : lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#060812;color:#F0F2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060812;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="font-size:13px;font-weight:700;letter-spacing:0.18em;color:#9BA3CC;padding-bottom:20px;">SOVEREIGN AI</td></tr>
<tr><td style="background:#0D1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
<p style="margin:0 0 12px;font-size:15px;color:#F0F2FF;">${e(hi)}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#9BA3CC;">${e(pick(lang, COPY.intro))}</p>
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#F0F2FF;">${e(title)}</h1>
<p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#C9CEEA;word-break:break-word;">${e(body)}</p>
<a href="${e(appUrl)}" style="display:inline-block;background:#5B50F0;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">${e(pick(lang, COPY.cta))}</a>
${
  latest
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#9BA3CC;">${e(pick(lang, COPY.latest))} <span style="color:#F0F2FF;">${e(latestTitle)}</span> · <a href="${e(updatesUrl)}" style="color:#8F86FF;">${e(pick(lang, COPY.allUpdates))}</a></p>`
    : ""
}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:#6B739C;">
<p style="margin:0 0 8px;">${e(pick(lang, COPY.why))}</p>
<p style="margin:0 0 8px;"><a href="${e(input.unsubscribeUrl)}" style="color:#9BA3CC;">${e(pick(lang, COPY.unsubscribe))}</a></p>
<p style="margin:0;">${e(pick(lang, COPY.address))}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { lang, tipId: tip.id, subject, html, text };
}
