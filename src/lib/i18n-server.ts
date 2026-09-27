import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, translate, type Lang, type TKey } from "@/lib/i18n";

/**
 * Tilni aniq so'raydigan mijozlar sarlavhasi: Cowork desktop va CLI brauzer cookie'sini
 * yubormaydi, shuning uchun /api/cli/* xatolari shu sarlavha bilan tanlangan tilda qaytadi.
 * Faqat til tanlaydi (isLang bilan tekshiriladi) — xavfsizlikka ta'siri yo'q.
 */
export const LANG_HEADER = "x-sov-lang";

/** Server komponent / action / route ichida foydalanuvchi tanlagan til: X-Sov-Lang → cookie → standart. */
export async function getServerLang(): Promise<Lang> {
  const h = (await headers()).get(LANG_HEADER)?.trim().toLowerCase();
  if (isLang(h)) return h;
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

/** Serverda: const t = await getServerT(); t("key") */
export async function getServerT(): Promise<(key: TKey) => string> {
  const lang = await getServerLang();
  return (key) => translate(lang, key);
}
