/**
 * Onboarding questionnaire content (docs/DESIGN.md — Ekran 3).
 */

/** lucide ikon nomi (OptionCard ichida chiziladi; emoji emas). */
export type OnboardingIconName =
  | "briefcase"
  | "microscope"
  | "palette"
  | "message"
  | "zap"
  | "target"
  | "lock"
  | "wallet";

export interface OnboardingOption {
  id: string;
  label: string;
  description?: string;
  icon?: OnboardingIconName;
  /** Til tanlovlari: tilning o'z nomi (bayroq o'rniga). */
  nativeName?: string;
  /** Faqat davlatlar: bayroq (davlat tanlagichida saqlanadi). */
  emoji?: string;
}

export const PURPOSES: OnboardingOption[] = [
  { id: "work", icon: "briefcase", label: "Ish / Biznes", description: "Hisob-kitob, email, tahlil" },
  { id: "research", icon: "microscope", label: "Tadqiqot", description: "Internet qidiruv, maqolalar, faktlar" },
  { id: "creative", icon: "palette", label: "Ijodiy", description: "Yozish, dizayn, kontent" },
  { id: "personal", icon: "message", label: "Shaxsiy", description: "Suhbat, savol, o'rganish" },
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
  { id: "speed", icon: "zap", label: "Tezlik", description: "Tez javoblar kerak" },
  { id: "accuracy", icon: "target", label: "Aniqlik", description: "Tekshirilgan ma'lumotlar" },
  { id: "privacy", icon: "lock", label: "Maxfiylik", description: "Ma'lumotlarim xavfsiz bo'lsin" },
  { id: "price", icon: "wallet", label: "Narx", description: "Arzon yoki tekin modellar" },
];

export const LANGUAGES: OnboardingOption[] = [
  { id: "uz", nativeName: "Oʻzbekcha", label: "O'zbek" },
  { id: "ru", nativeName: "Русский", label: "Rus" },
  { id: "en", nativeName: "English", label: "Ingliz" },
  { id: "de", nativeName: "Deutsch", label: "Nemis" },
  { id: "fr", nativeName: "Français", label: "Fransuz" },
  { id: "ar", nativeName: "العربية", label: "Arab" },
];

/** Yosh guruhlari — aniq son so'ramaymiz, javob uslubini moslash uchun yetarli. */
export const AGE_GROUPS: OnboardingOption[] = [
  { id: "u18", label: "18 gacha", description: "Maktab, kollej" },
  { id: "18-24", label: "18–24", description: "Talaba, yosh mutaxassis" },
  { id: "25-34", label: "25–34" },
  { id: "35-44", label: "35–44" },
  { id: "45-54", label: "45–54" },
  { id: "55+", label: "55 va undan katta" },
];

/** Davlatlar — mintaqa asosiylari birinchi, qolgani "Boshqa" orqali. */
export const COUNTRIES: OnboardingOption[] = [
  { id: "UZ", emoji: "🇺🇿", label: "O'zbekiston" },
  { id: "KZ", emoji: "🇰🇿", label: "Qozog'iston" },
  { id: "KG", emoji: "🇰🇬", label: "Qirg'iziston" },
  { id: "TJ", emoji: "🇹🇯", label: "Tojikiston" },
  { id: "TM", emoji: "🇹🇲", label: "Turkmaniston" },
  { id: "RU", emoji: "🇷🇺", label: "Rossiya" },
  { id: "TR", emoji: "🇹🇷", label: "Turkiya" },
  { id: "KR", emoji: "🇰🇷", label: "Koreya" },
  { id: "AE", emoji: "🇦🇪", label: "BAA" },
  { id: "US", emoji: "🇺🇸", label: "AQSH" },
  { id: "DE", emoji: "🇩🇪", label: "Germaniya" },
  { id: "GB", emoji: "🇬🇧", label: "Buyuk Britaniya" },
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
  {
    id: "age",
    number: "06",
    title: "Yoshingiz qaysi guruhda?",
    subtitle: "Javoblar ohangi va misollar shunga moslanadi",
  },
  {
    id: "country",
    number: "07",
    title: "Qaysi davlatdansiz?",
    subtitle: "Mahalliy qonun, valyuta va vaqt mintaqasini hisobga olamiz",
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export const COMPLETION_LINES = [
  "Shaxsiy AI Vault yaratilmoqda...",
  "Xotira tizimi sozlanmoqda...",
  "Tayyor!",
];
