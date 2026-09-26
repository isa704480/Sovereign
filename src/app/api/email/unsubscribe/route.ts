import { emailTokenSecret, verifyUnsubscribe } from "@/lib/email/token";
import { escapeHtml } from "@/lib/email/tip-email";
import { isLang, type L10n, type Lang } from "@/lib/i18n";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tip emaillaridan bir bosishda chiqish.
 *   GET  ?u=<uuid>&t=<hmac>  — emaildagi havola: darhol o'chiradi va tasdiq sahifasini ko'rsatadi.
 *   POST ?u=<uuid>&t=<hmac>  — RFC 8058 "List-Unsubscribe=One-Click" (pochta mijozi tugmasi).
 * Faqat email_tips = false qilinadi; boshqa hech narsa o'zgarmaydi. Qayta yoqish — Sozlamalar'da.
 */

const PAGE = {
  okTitle: { uz: "Obuna bekor qilindi", "uz-cyrl": "Обуна бекор қилинди", ru: "Вы отписались", en: "You're unsubscribed" },
  okBody: {
    uz: "Endi maslahat emaillarini yubormaymiz. Xohlasangiz, Sozlamalar'da qayta yoqishingiz mumkin.",
    "uz-cyrl": "Энди маслаҳат emailларини юбормаймиз. Хоҳласангиз, Созламалар'да қайта ёқишингиз мумкин.",
    ru: "Мы больше не будем присылать письма с советами. При желании их можно снова включить в Настройках.",
    en: "We won't send you tip emails anymore. You can turn them back on in Settings anytime.",
  },
  badTitle: { uz: "Havola yaroqsiz", "uz-cyrl": "Ҳавола яроқсиз", ru: "Ссылка недействительна", en: "This link isn't valid" },
  badBody: {
    uz: "Havola buzilgan yoki eskirgan. Emaillarni Sozlamalar'da o'chirishingiz mumkin.",
    "uz-cyrl": "Ҳавола бузилган ёки эскирган. Emailларни Созламалар'да ўчиришингиз мумкин.",
    ru: "Ссылка повреждена или устарела. Отключить письма можно в Настройках.",
    en: "The link is broken or outdated. You can turn emails off in Settings.",
  },
  errTitle: { uz: "Xatolik", "uz-cyrl": "Хатолик", ru: "Ошибка", en: "Something went wrong" },
  errBody: {
    uz: "Hozir saqlab bo'lmadi. Birozdan keyin qayta urining yoki Sozlamalar'da o'chiring.",
    "uz-cyrl": "Ҳозир сақлаб бўлмади. Бироздан кейин қайта уриниб кўринг ёки Созламалар'да ўчиринг.",
    ru: "Не удалось сохранить. Попробуйте позже или отключите в Настройках.",
    en: "We couldn't save that right now. Please try again later, or turn emails off in Settings.",
  },
  open: { uz: "SOVEREIGN'ni ochish", "uz-cyrl": "SOVEREIGN'ни очиш", ru: "Открыть SOVEREIGN", en: "Open SOVEREIGN" },
} satisfies Record<string, L10n>;

type Outcome = { status: 200 | 400 | 500; kind: "ok" | "bad" | "err"; lang: Lang };

async function unsubscribe(req: Request): Promise<Outcome> {
  const url = new URL(req.url);
  const u = url.searchParams.get("u");
  const t = url.searchParams.get("t");
  const qLang = url.searchParams.get("l");
  const fallback: Lang = isLang(qLang) ? qLang : "en";
  if (!verifyUnsubscribe(u, t, emailTokenSecret()) || !u) return { status: 400, kind: "bad", lang: fallback };

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("profiles")
      .update({ email_tips: false })
      .eq("id", u.toLowerCase())
      .select("email_lang")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const l = (data as { email_lang?: string } | null)?.email_lang;
    // Profil yo'q (akkaunt o'chirilgan) bo'lsa ham — yuboradigan narsa yo'q, "ok".
    return { status: 200, kind: "ok", lang: isLang(l) ? l : fallback };
  } catch (e) {
    console.error("[unsubscribe] failed:", e instanceof Error ? e.message : e);
    return { status: 500, kind: "err", lang: fallback };
  }
}

function page(o: Outcome): Response {
  const title = PAGE[`${o.kind}Title`][o.lang];
  const body = PAGE[`${o.kind}Body`][o.lang];
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="${o.lang === "uz-cyrl" ? "uz-Cyrl" : o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${e(title)} · SOVEREIGN AI</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060812;color:#F0F2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:16px;box-sizing:border-box;">
<main style="max-width:440px;width:100%;background:#0D1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
<p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:0.18em;color:#9BA3CC;">SOVEREIGN AI</p>
<h1 style="margin:0 0 10px;font-size:22px;">${e(title)}</h1>
<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#9BA3CC;">${e(body)}</p>
<a href="${e(site)}/app" style="display:inline-block;background:#5B50F0;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px;">${e(PAGE.open[o.lang])}</a>
</main></body></html>`;
  return new Response(html, {
    status: o.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(req: Request) {
  return page(await unsubscribe(req));
}

export async function POST(req: Request) {
  const o = await unsubscribe(req);
  return Response.json({ ok: o.kind === "ok" }, { status: o.status, headers: { "Cache-Control": "no-store" } });
}
