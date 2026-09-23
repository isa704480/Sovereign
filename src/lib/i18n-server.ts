import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, translate, type Lang, type TKey } from "@/lib/i18n";

/** Server komponent / action / route ichida foydalanuvchi tanlagan til. */
export async function getServerLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

/** Serverda: const t = await getServerT(); t("key") */
export async function getServerT(): Promise<(key: TKey) => string> {
  const lang = await getServerLang();
  return (key) => translate(lang, key);
}
