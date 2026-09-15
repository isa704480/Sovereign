/**
 * Onboarding questionnaire content (docs/DESIGN.md — Ekran 3).
 */

export interface OnboardingOption {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
}

export const PURPOSES: OnboardingOption[] = [
  { id: "work", emoji: "🏢", label: "Ish / Biznes", description: "Hisob-kitob, email, tahlil" },
  { id: "research", emoji: "🔬", label: "Tadqiqot", description: "Internet qidiruv, maqolalar, faktlar" },
  { id: "creative", emoji: "🎨", label: "Ijodiy", description: "Yozish, dizayn, kontent" },
  { id: "personal", emoji: "💬", label: "Shaxsiy", description: "Suhbat, savol, o'rganish" },
];

export const INDUSTRIES: OnboardingOption[] = [
  { id: "tech", label: "Texnologiya" },
  { id: "business", label: "Biznes" },
  { id: "education", label: "Ta'lim" },
  { id: "health", label: "Sog'liqni saqlash" },
  { id: "law", label: "Huquq" },
  { id: "finance", label: "Moliya" },
  { id: "marketing", label: "Marketing" },
  { id: "engineering", label: "Muhandislik" },
  { id: "science", label: "Ilmiy tadqiqot" },
  { id: "creative", label: "Ijodiy sohalar" },
];

export const PRIORITIES: OnboardingOption[] = [
  { id: "speed", emoji: "⚡", label: "Tezlik", description: "Tez javoblar kerak" },
  { id: "accuracy", emoji: "🎯", label: "Aniqlik", description: "Tekshirilgan ma'lumotlar" },
  { id: "privacy", emoji: "🔒", label: "Maxfiylik", description: "Ma'lumotlarim xavfsiz bo'lsin" },
  { id: "price", emoji: "💰", label: "Narx", description: "Arzon yoki tekin modellar" },
];

export const LANGUAGES: OnboardingOption[] = [
  { id: "uz", emoji: "🇺🇿", label: "O'zbek" },
  { id: "ru", emoji: "🇷🇺", label: "Rus" },
  { id: "en", emoji: "🇬🇧", label: "Ingliz" },
  { id: "de", emoji: "🇩🇪", label: "Nemis" },
  { id: "fr", emoji: "🇫🇷", label: "Fransuz" },
  { id: "ar", emoji: "🇸🇦", label: "Arab" },
];

export interface ExperienceZone {
  /** inclusive lower bound, 0..100 */
  from: number;
  id: "beginner" | "intermediate" | "expert";
  label: string;
  hint: string;
}

export const EXPERIENCE_ZONES: ExperienceZone[] = [
  { from: 0, id: "beginner", label: "Yangi boshlovchi", hint: "AI asoslarini o'rgatamiz" },
  { from: 34, id: "intermediate", label: "O'rta", hint: "Ilg'or xususiyatlarni ko'rsatamiz" },
  { from: 67, id: "expert", label: "Ekspert", hint: "Barcha sozlamalarni ochamiz" },
];

export function experienceZone(value: number): ExperienceZone {
  return [...EXPERIENCE_ZONES].reverse().find((z) => value >= z.from) ?? EXPERIENCE_ZONES[0];
}

export const ONBOARDING_STEPS = [
  {
    id: "purpose",
    number: "01",
    title: "AI'ni asosan nima uchun ishlatasiz?",
    subtitle: "Bu bizga siz uchun eng yaxshi sozlamalarni tanlashga yordam beradi",
  },
  {
    id: "industry",
    number: "02",
    title: "Qaysi sohada ishlaysiz?",
    subtitle: "Bir nechtasini tanlashingiz mumkin",
  },
  {
    id: "priorities",
    number: "03",
    title: "Siz uchun eng muhimi nima?",
    subtitle: "Ko'p tanlash mumkin",
  },
  {
    id: "languages",
    number: "04",
    title: "Qaysi tillarda ishlaysiz?",
    subtitle: "AI shu tillarda javob berishga tayyorlanadi",
  },
  {
    id: "experience",
    number: "05",
    title: "AI bilan qancha vaqt ishlagansiz?",
    subtitle: "Interfeys murakkabligini shunga moslaymiz",
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export const COMPLETION_LINES = [
  "Shaxsiy AI Vault yaratilmoqda...",
  "Xotira tizimi sozlanmoqda...",
  "Tayyor! 🎉",
];
