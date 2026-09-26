/**
 * O'zbek yozuvi izchilligi (faqat LOG — javobni to'smaydi). Foydalanuvchi lotinda
 * yozsa-yu javob kirill/lotin aralash bo'lsa (yoki aksincha, yoki o'zbekcha kirill
 * o'rniga ruscha), server logiga ogohlantirish yoziladi — prompt sifati kuzatiladi.
 *
 * Pure funksiya — test: npx tsx src/lib/ai/script-check.test.ts
 */

/** Kod bloklari, inline kod, havolalar va markdown rasmlari hisobga olinmaydi. */
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

function counts(text: string) {
  const t = prose(text);
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const cyr = (t.match(/[Ѐ-ӿ]/g) ?? []).length;
  // O'zbek kirillining o'ziga xos harflari (rus tilida yo'q).
  const uzCyr = (t.match(/[ўқғҳЎҚҒҲ]/g) ?? []).length;
  return { latin, cyr, uzCyr };
}

export type ScriptDrift =
  | { kind: "mixed"; user: "latin" | "cyrillic"; latin: number; cyrillic: number }
  | { kind: "russian-for-uz-cyrl" };

/**
 * Oxirgi foydalanuvchi xabari va javob bo'yicha yozuv siljishini topadi.
 * Qisqa matnlarda (≤ 40 harf) hech narsa qaytarmaydi — shovqin ko'p.
 */
export function scriptDrift(userText: string, answer: string): ScriptDrift | null {
  const u = counts(userText);
  const a = counts(answer);
  const uLetters = u.latin + u.cyr;
  const aLetters = a.latin + a.cyr;
  if (uLetters < 8 || aLetters < 40) return null;

  const userScript = u.cyr > u.latin ? "cyrillic" : "latin";
  // Begona yozuv ulushi: lotin foydalanuvchiga kirill harflari va aksincha.
  const foreign = userScript === "latin" ? a.cyr : a.latin;
  if (foreign >= 25 && foreign / aLetters >= 0.15) {
    return { kind: "mixed", user: userScript, latin: a.latin, cyrillic: a.cyr };
  }
  // Foydalanuvchi o'zbekcha kirillda (ў/қ/ғ/ҳ bor), javob esa kirill-u, ularsiz — ehtimol ruscha.
  if (userScript === "cyrillic" && u.uzCyr > 0 && a.cyr >= 200 && a.uzCyr === 0) {
    return { kind: "russian-for-uz-cyrl" };
  }
  return null;
}
