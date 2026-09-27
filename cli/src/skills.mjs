// SOVEREIGN Skills — CLI/Cowork uchun ko'rsatish katalogi.
//
// Haqiqiy skill qo'llanmalari (prompt), triggerlar va limitlar FAQAT serverda
// (src/config/skills.ts — yagona manba): /api/cli/chat akkauntda yoqilgan skillar +
// avto-aniqlanganlarni system xabar sifatida o'zi qo'shadi va javobda `skills: [...]`
// qaytaradi. Bu fayl faqat id / nom / qisqa tavsif / taxalluslarni saqlaydi;
// src/config/skills.test.ts ular server katalogi bilan mosligini tekshiradi.

/** Serverdagi katalog bilan bir xil tartib. `mark` — terminal belgisi (emoji emas). */
export const SKILLS = [
  { id: "ui-ux-pro-max", name: "UI/UX Pro Max", mark: "◇", desc: "Premium interfeys: qulaylik, holatlar, moslashuvchanlik" },
  { id: "apple-design", name: "Apple Liquid Glass", mark: "◎", desc: "Apple uslubi: oq panellar, ingichka chiziqlar, shisha", aliases: ["apple-liquid-glass", "liquid-glass"] },
  { id: "clean-code", name: "Clean Code", mark: "◆", desc: "Toza, xavfsiz, o'qiladigan kod" },
  { id: "cybersecurity", name: "Cybersecurity Pro", mark: "◈", desc: "Himoya: xavfsiz kod va OWASP audit" },
  { id: "no-ai-slop", name: "No AI Slop", mark: "✎", desc: "Jonli, aniq matn — AI qoliplarisiz", aliases: ["pro-writing"] },
  { id: "data-viz", name: "Data Viz", mark: "▦", desc: "Grafik va jadval tamoyillari" },
  { id: "focus-mode", name: "Focus / ADHD", mark: "▸", desc: "Avval harakat, raqamli qadamlar (faqat qo'lda)", aliases: ["i-have-adhd", "adhd"], manual: true },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);

const ALIAS = new Map(SKILLS.flatMap((s) => [[s.id, s.id], ...(s.aliases ?? []).map((a) => [a, s.id])]));

/** Kanonik id ("pro-writing" → "no-ai-slop"); noma'lum bo'lsa null. */
export function canonicalSkillId(id) {
  if (typeof id !== "string") return null;
  return ALIAS.get(id.trim().toLowerCase()) ?? null;
}

/** Kanonik, ma'lum, takrorsiz id'lar (tartib saqlanadi). */
export function normalizeSkillIds(ids) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const c = canonicalSkillId(id);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * /api/cli/chat javobidagi `skills` maydoni: massiv → shu qadamda qo'llangan (kanonik) skillar;
 * maydon yo'q → null (eski server — skillarni o'zi qo'shmaydi).
 */
export function responseSkills(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.skills)) return null;
  return normalizeSkillIds(json.skills);
}

/** Skill nomlari (terminal qatori uchun). */
export function skillNames(ids) {
  return normalizeSkillIds(ids).map((id) => SKILLS.find((s) => s.id === id)?.name ?? id);
}

export const SKILLS_MARK = "Foydalanuvchi tomonidan yoqilgan SOVEREIGN Skills:";

/**
 * Eski server uchun zaxira system xabari (faqat nomlar). Yangi server skill qo'llanmalarini o'zi
 * qo'shadi — u holda (`fallback: false`) xabar olib tashlanadi (eski sessiyadan qolgan bo'lsa ham).
 * `messages` joyida o'zgartiriladi.
 */
export function syncSkillsMessage(messages, enabledSkills, { fallback = false } = {}) {
  const idx = messages.findIndex((m) => m.role === "system" && typeof m.content === "string" && m.content.startsWith(SKILLS_MARK));
  const ids = normalizeSkillIds([...(enabledSkills ?? [])]);
  const lines = fallback ? SKILLS.filter((s) => ids.includes(s.id)).map((s) => `- ${s.name}: ${s.desc}`) : [];
  if (!lines.length) {
    if (idx !== -1) messages.splice(idx, 1);
    return;
  }
  const msg = { role: "system", content: `${SKILLS_MARK}\n${lines.join("\n")}\nUlarni javob berayotganda qo'llang.` };
  if (idx !== -1) {
    messages[idx] = msg;
    return;
  }
  // Boshlang'ich system blokining oxiriga (SYSTEM, kontekst, xotira'dan keyin).
  const firstNonSystem = messages.findIndex((m) => m.role !== "system");
  messages.splice(firstNonSystem === -1 ? messages.length : firstNonSystem, 0, msg);
}
