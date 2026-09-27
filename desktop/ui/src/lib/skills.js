// SOVEREIGN Skills — Cowork ko'rsatish katalogi (id, brend nomi, belgi, avto/qo'lda).
// Qo'llanmalar (prompt) va triggerlar faqat serverda: src/config/skills.ts (yagona manba);
// src/config/skills.test.ts bu ro'yxat server katalogi bilan mosligini tekshiradi.
// Tavsiflar: i18n.js → `skill.<id>.desc`; nom brend (tarjima qilinmaydi), focus-mode'dan tashqari.

export const SKILLS = [
  { id: "ui-ux-pro-max", name: "UI/UX Pro Max", icon: "layout", auto: true },
  { id: "apple-design", name: "Apple Liquid Glass", icon: "layers", auto: true },
  { id: "clean-code", name: "Clean Code", icon: "braces", auto: true },
  { id: "cybersecurity", name: "Cybersecurity Pro", icon: "shield", auto: true },
  { id: "no-ai-slop", name: "No AI Slop", icon: "pencil", auto: true },
  { id: "data-viz", name: "Data Viz", icon: "chart", auto: true },
  { id: "focus-mode", name: "Focus / ADHD", nameKey: "skill.focus-mode.name", icon: "focus", auto: false },
];

/** Server bilan bir xil: bitta javobda ko'pi bilan shuncha skill qo'llanadi. */
export const MAX_ACTIVE_SKILLS = 4;

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** Ko'rsatiladigan nom (focus-mode — tarjima, qolganlari brend). */
export function skillName(s, t) {
  return s.nameKey ? t(s.nameKey) : s.name;
}

/** Hodisa/serverdan kelgan id'lar — faqat ma'lumlari, takrorsiz, ko'pi bilan 8 ta. */
export function knownSkillIds(ids) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id === "string" && SKILL_BY_ID[id] && !out.includes(id)) out.push(id);
    if (out.length >= 8) break;
  }
  return out;
}
