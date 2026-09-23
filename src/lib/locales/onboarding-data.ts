/**
 * Onboarding kontentining tarjimalari — src/config/onboarding.ts shaklini buzmaslik
 * uchun alohida "yon xarita": id → L10n. Topilmasa config'dagi o'zbekcha matn qaytadi.
 */

import { pick, type L10n, type Lang } from "@/lib/i18n";
import type { ExperienceZone, OnboardingOption, OnboardingStepId } from "@/config/onboarding";

type OptionText = { label?: L10n; description?: L10n };
export type OptionGroup = "purposes" | "industries" | "priorities" | "languages" | "age";

const OPTIONS: Record<OptionGroup, Record<string, OptionText>> = {
  purposes: {
    work: {
      label: { uz: "Ish / Biznes", "uz-cyrl": "Иш / Бизнес", ru: "Работа / Бизнес", en: "Work / Business" },
      description: { uz: "Hisob-kitob, email, tahlil", "uz-cyrl": "Ҳисоб-китоб, email, таҳлил", ru: "Расчёты, почта, аналитика", en: "Calculations, email, analysis" },
    },
    research: {
      label: { uz: "Tadqiqot", "uz-cyrl": "Тадқиқот", ru: "Исследования", en: "Research" },
      description: {
        uz: "Internet qidiruv, maqolalar, faktlar",
        "uz-cyrl": "Интернет қидирув, мақолалар, фактлар",
        ru: "Поиск в интернете, статьи, факты",
        en: "Web search, articles, facts",
      },
    },
    creative: {
      label: { uz: "Ijodiy", "uz-cyrl": "Ижодий", ru: "Творчество", en: "Creative" },
      description: { uz: "Yozish, dizayn, kontent", "uz-cyrl": "Ёзиш, дизайн, контент", ru: "Тексты, дизайн, контент", en: "Writing, design, content" },
    },
    personal: {
      label: { uz: "Shaxsiy", "uz-cyrl": "Шахсий", ru: "Личное", en: "Personal" },
      description: { uz: "Suhbat, savol, o'rganish", "uz-cyrl": "Суҳбат, савол, ўрганиш", ru: "Общение, вопросы, обучение", en: "Chat, questions, learning" },
    },
  },
  industries: {
    tech: { label: { uz: "Texnologiya", "uz-cyrl": "Технология", ru: "Технологии", en: "Technology" } },
    business: { label: { uz: "Biznes", "uz-cyrl": "Бизнес", ru: "Бизнес", en: "Business" } },
    education: { label: { uz: "Ta'lim", "uz-cyrl": "Таълим", ru: "Образование", en: "Education" } },
    health: { label: { uz: "Sog'liqni saqlash", "uz-cyrl": "Соғлиқни сақлаш", ru: "Здравоохранение", en: "Healthcare" } },
    law: { label: { uz: "Huquq", "uz-cyrl": "Ҳуқуқ", ru: "Право", en: "Law" } },
    finance: { label: { uz: "Moliya", "uz-cyrl": "Молия", ru: "Финансы", en: "Finance" } },
    marketing: { label: { uz: "Marketing", "uz-cyrl": "Маркетинг", ru: "Маркетинг", en: "Marketing" } },
    engineering: { label: { uz: "Muhandislik", "uz-cyrl": "Муҳандислик", ru: "Инженерия", en: "Engineering" } },
    science: { label: { uz: "Ilmiy tadqiqot", "uz-cyrl": "Илмий тадқиқот", ru: "Научные исследования", en: "Scientific research" } },
    creative: { label: { uz: "Ijodiy sohalar", "uz-cyrl": "Ижодий соҳалар", ru: "Творческие сферы", en: "Creative industries" } },
  },
  priorities: {
    speed: {
      label: { uz: "Tezlik", "uz-cyrl": "Тезлик", ru: "Скорость", en: "Speed" },
      description: { uz: "Tez javoblar kerak", "uz-cyrl": "Тез жавоблар керак", ru: "Нужны быстрые ответы", en: "I need fast answers" },
    },
    accuracy: {
      label: { uz: "Aniqlik", "uz-cyrl": "Аниқлик", ru: "Точность", en: "Accuracy" },
      description: { uz: "Tekshirilgan ma'lumotlar", "uz-cyrl": "Текширилган маълумотлар", ru: "Проверенная информация", en: "Verified information" },
    },
    privacy: {
      label: { uz: "Maxfiylik", "uz-cyrl": "Махфийлик", ru: "Приватность", en: "Privacy" },
      description: {
        uz: "Ma'lumotlarim xavfsiz bo'lsin",
        "uz-cyrl": "Маълумотларим хавфсиз бўлсин",
        ru: "Чтобы мои данные были в безопасности",
        en: "Keep my data safe",
      },
    },
    price: {
      label: { uz: "Narx", "uz-cyrl": "Нарх", ru: "Цена", en: "Price" },
      description: { uz: "Arzon yoki tekin modellar", "uz-cyrl": "Арзон ёки текин моделлар", ru: "Недорогие или бесплатные модели", en: "Cheap or free models" },
    },
  },
  languages: {
    uz: { label: { uz: "O'zbek", "uz-cyrl": "Ўзбек", ru: "Узбекский", en: "Uzbek" } },
    ru: { label: { uz: "Rus", "uz-cyrl": "Рус", ru: "Русский", en: "Russian" } },
    en: { label: { uz: "Ingliz", "uz-cyrl": "Инглиз", ru: "Английский", en: "English" } },
    de: { label: { uz: "Nemis", "uz-cyrl": "Немис", ru: "Немецкий", en: "German" } },
    fr: { label: { uz: "Fransuz", "uz-cyrl": "Француз", ru: "Французский", en: "French" } },
    ar: { label: { uz: "Arab", "uz-cyrl": "Араб", ru: "Арабский", en: "Arabic" } },
  },
  age: {
    u18: {
      label: { uz: "18 gacha", "uz-cyrl": "18 гача", ru: "До 18", en: "Under 18" },
      description: { uz: "Maktab, kollej", "uz-cyrl": "Мактаб, коллеж", ru: "Школа, колледж", en: "School, college" },
    },
    "18-24": {
      description: { uz: "Talaba, yosh mutaxassis", "uz-cyrl": "Талаба, ёш мутахассис", ru: "Студент, молодой специалист", en: "Student, early career" },
    },
    "55+": { label: { uz: "55 va undan katta", "uz-cyrl": "55 ва ундан катта", ru: "55 и старше", en: "55 and over" } },
  },
};

/** Variant matni tanlangan tilda (label / description). */
export function optionText(
  group: OptionGroup,
  o: OnboardingOption,
  lang: Lang,
): { label: string; description?: string } {
  const tr = OPTIONS[group][o.id];
  return {
    label: tr?.label ? pick(lang, tr.label) : o.label,
    description: tr?.description ? pick(lang, tr.description) : o.description,
  };
}

const STEPS: Record<OnboardingStepId, { title: L10n; subtitle: L10n }> = {
  purpose: {
    title: {
      uz: "AI'ni asosan nima uchun ishlatasiz?",
      "uz-cyrl": "AI'ни асосан нима учун ишлатасиз?",
      ru: "Для чего вы в основном используете ИИ?",
      en: "What do you mainly use AI for?",
    },
    subtitle: {
      uz: "Bu bizga siz uchun eng yaxshi sozlamalarni tanlashga yordam beradi",
      "uz-cyrl": "Бу бизга сиз учун энг яхши созламаларни танлашга ёрдам беради",
      ru: "Это поможет нам подобрать для вас лучшие настройки",
      en: "This helps us pick the best settings for you",
    },
  },
  industry: {
    title: { uz: "Qaysi sohada ishlaysiz?", "uz-cyrl": "Қайси соҳада ишлайсиз?", ru: "В какой сфере вы работаете?", en: "What field do you work in?" },
    subtitle: {
      uz: "Bir nechtasini tanlashingiz mumkin",
      "uz-cyrl": "Бир нечтасини танлашингиз мумкин",
      ru: "Можно выбрать несколько",
      en: "You can pick more than one",
    },
  },
  priorities: {
    title: { uz: "Siz uchun eng muhimi nima?", "uz-cyrl": "Сиз учун энг муҳими нима?", ru: "Что для вас важнее всего?", en: "What matters most to you?" },
    subtitle: { uz: "Ko'p tanlash mumkin", "uz-cyrl": "Кўп танлаш мумкин", ru: "Можно выбрать несколько вариантов", en: "Multiple choices allowed" },
  },
  languages: {
    title: {
      uz: "Qaysi tillarda ishlaysiz?",
      "uz-cyrl": "Қайси тилларда ишлайсиз?",
      ru: "На каких языках вы работаете?",
      en: "Which languages do you work in?",
    },
    subtitle: {
      uz: "AI shu tillarda javob berishga tayyorlanadi",
      "uz-cyrl": "AI шу тилларда жавоб беришга тайёрланади",
      ru: "ИИ подготовится отвечать на этих языках",
      en: "AI will get ready to answer in these languages",
    },
  },
  experience: {
    title: {
      uz: "AI bilan qancha vaqt ishlagansiz?",
      "uz-cyrl": "AI билан қанча вақт ишлагансиз?",
      ru: "Как давно вы работаете с ИИ?",
      en: "How long have you been using AI?",
    },
    subtitle: {
      uz: "Interfeys murakkabligini shunga moslaymiz",
      "uz-cyrl": "Интерфейс мураккаблигини шунга мослаймиз",
      ru: "Под это мы настроим сложность интерфейса",
      en: "We'll match the interface complexity to it",
    },
  },
  age: {
    title: {
      uz: "Yoshingiz qaysi guruhda?",
      "uz-cyrl": "Ёшингиз қайси гуруҳда?",
      ru: "К какой возрастной группе вы относитесь?",
      en: "Which age group are you in?",
    },
    subtitle: {
      uz: "Javoblar ohangi va misollar shunga moslanadi",
      "uz-cyrl": "Жавоблар оҳанги ва мисоллар шунга мосланади",
      ru: "Под это подстроятся тон ответов и примеры",
      en: "The tone of answers and examples will adapt to it",
    },
  },
  country: {
    title: { uz: "Qaysi davlatdansiz?", "uz-cyrl": "Қайси давлатдансиз?", ru: "Из какой вы страны?", en: "Which country are you from?" },
    subtitle: {
      uz: "Mahalliy qonun, valyuta va vaqt mintaqasini hisobga olamiz",
      "uz-cyrl": "Маҳаллий қонун, валюта ва вақт минтақасини ҳисобга оламиз",
      ru: "Учтём местные законы, валюту и часовой пояс",
      en: "We'll take local laws, currency and time zone into account",
    },
  },
};

export function stepText(id: OnboardingStepId, lang: Lang, fallback: { title: string; subtitle?: string }) {
  const tr = STEPS[id];
  return {
    title: tr ? pick(lang, tr.title) : fallback.title,
    subtitle: tr ? pick(lang, tr.subtitle) : fallback.subtitle,
  };
}

const ZONES: Record<ExperienceZone["id"], { label: L10n; hint: L10n }> = {
  beginner: {
    label: { uz: "Yangi boshlovchi", "uz-cyrl": "Янги бошловчи", ru: "Новичок", en: "Beginner" },
    hint: { uz: "AI asoslarini o'rgatamiz", "uz-cyrl": "AI асосларини ўргатамиз", ru: "Научим основам ИИ", en: "We'll teach you the AI basics" },
  },
  intermediate: {
    label: { uz: "O'rta", "uz-cyrl": "Ўрта", ru: "Средний", en: "Intermediate" },
    hint: {
      uz: "Ilg'or xususiyatlarni ko'rsatamiz",
      "uz-cyrl": "Илғор хусусиятларни кўрсатамиз",
      ru: "Покажем продвинутые функции",
      en: "We'll show you advanced features",
    },
  },
  expert: {
    label: { uz: "Ekspert", "uz-cyrl": "Эксперт", ru: "Эксперт", en: "Expert" },
    hint: { uz: "Barcha sozlamalarni ochamiz", "uz-cyrl": "Барча созламаларни очамиз", ru: "Откроем все настройки", en: "We'll unlock every setting" },
  },
};

export function zoneText(z: ExperienceZone, lang: Lang): { label: string; hint: string } {
  const tr = ZONES[z.id];
  return { label: tr ? pick(lang, tr.label) : z.label, hint: tr ? pick(lang, tr.hint) : z.hint };
}

/** COMPLETION_LINES bilan bir xil tartibda. */
const COMPLETION: L10n[] = [
  {
    uz: "Shaxsiy AI Vault yaratilmoqda...",
    "uz-cyrl": "Шахсий AI Vault яратилмоқда...",
    ru: "Создаём личный AI Vault...",
    en: "Creating your personal AI Vault...",
  },
  {
    uz: "Xotira tizimi sozlanmoqda...",
    "uz-cyrl": "Хотира тизими созланмоқда...",
    ru: "Настраиваем систему памяти...",
    en: "Setting up the memory system...",
  },
  { uz: "Tayyor! 🎉", "uz-cyrl": "Тайёр! 🎉", ru: "Готово! 🎉", en: "All set! 🎉" },
];

export function completionLine(index: number, lang: Lang, fallback: string): string {
  const tr = COMPLETION[index];
  return tr ? pick(lang, tr) : fallback;
}

/**
 * recommendModel() qaytaradigan o'zbekcha sabab → 4 til. Kalit — asl matn;
 * mos kelmasa (matn o'zgartirilgan bo'lsa) asl matn ko'rsatiladi.
 */
const REASONS: Record<string, L10n> = {
  "Narx siz uchun muhim — LLaMA to'liq tekin va kundalik ishlar uchun yetarli.": {
    uz: "Narx siz uchun muhim — LLaMA to'liq tekin va kundalik ishlar uchun yetarli.",
    "uz-cyrl": "Нарх сиз учун муҳим — LLaMA тўлиқ текин ва кундалик ишлар учун етарли.",
    ru: "Для вас важна цена — LLaMA полностью бесплатна и подходит для повседневных задач.",
    en: "Price matters to you — LLaMA is completely free and good enough for everyday tasks.",
  },
  "Tadqiqot uchun real-vaqt internet va manbalar bilan javob beruvchi model.": {
    uz: "Tadqiqot uchun real-vaqt internet va manbalar bilan javob beruvchi model.",
    "uz-cyrl": "Тадқиқот учун реал-вақт интернет ва манбалар билан жавоб берувчи модел.",
    ru: "Для исследований — модель, которая отвечает с поиском в интернете в реальном времени и источниками.",
    en: "For research — a model that answers with real-time web search and sources.",
  },
  "Evropa tillarida eng kuchli model — Mistral.": {
    uz: "Evropa tillarida eng kuchli model — Mistral.",
    "uz-cyrl": "Европа тилларида энг кучли модел — Mistral.",
    ru: "Самая сильная модель для европейских языков — Mistral.",
    en: "The strongest model for European languages — Mistral.",
  },
  "Kod va texnik masalalar uchun tez va aniq — GPT-4o.": {
    uz: "Kod va texnik masalalar uchun tez va aniq — GPT-4o.",
    "uz-cyrl": "Код ва техник масалалар учун тез ва аниқ — GPT-4o.",
    ru: "Быстро и точно для кода и технических задач — GPT-4o.",
    en: "Fast and precise for code and technical tasks — GPT-4o.",
  },
  "Yozish, kontent va nozik tahrir uchun Claude eng yaxshi.": {
    uz: "Yozish, kontent va nozik tahrir uchun Claude eng yaxshi.",
    "uz-cyrl": "Ёзиш, контент ва нозик таҳрир учун Claude энг яхши.",
    ru: "Для текстов, контента и тонкой редактуры Claude — лучший выбор.",
    en: "Claude is the best for writing, content and careful editing.",
  },
  "Umumiy ish va suhbat uchun eng muvozanatli tanlov — Claude.": {
    uz: "Umumiy ish va suhbat uchun eng muvozanatli tanlov — Claude.",
    "uz-cyrl": "Умумий иш ва суҳбат учун энг мувозанатли танлов — Claude.",
    ru: "Самый сбалансированный выбор для общих задач и общения — Claude.",
    en: "The most balanced choice for general work and conversation — Claude.",
  },
};

export function reasonText(reason: string, lang: Lang): string {
  const tr = REASONS[reason];
  return tr ? pick(lang, tr) : reason;
}
