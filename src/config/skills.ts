/**
 * SOVEREIGN Skills — expert playbooks injected into the model's system prompt.
 *
 * Adapted for SOVEREIGN from public "Claude skills":
 *   - ui-ux-pro-max      (github.com/nextlevelbuilder/ui-ux-pro-max-skill)
 *   - apple-design       (github.com/dickwu/apple-design-skill)
 *   - cybersecurity      (github.com/mukul975/anthropic-cybersecurity-skills)
 *
 * A skill can be auto-activated (keyword/intent match) or toggled by the user.
 * When active, its `prompt` is appended to the system message for that request.
 */

export type SkillCategory = "code" | "design" | "security" | "writing" | "data";

export interface Skill {
  id: string;
  name: string;
  /** One-line description shown in the picker. */
  description: string;
  category: SkillCategory;
  /** Emoji marker. */
  glyph: string;
  color: string;
  /** Auto-activates when a user message matches. */
  triggers: RegExp[];
  /** Guidance appended to the system prompt when active. */
  prompt: string;
  /** On by default in the picker. */
  defaultOn?: boolean;
}

export const SKILLS: Skill[] = [
  {
    id: "ui-ux-pro-max",
    name: "UI/UX Pro Max",
    description: "Premium interfeys dizayni: ierarxiya, spacing, rang, holatlar",
    category: "design",
    glyph: "✦",
    color: "#5B50F0",
    defaultOn: true,
    triggers: [
      /\b(ui|ux|interfeys|dizayn|design|layout|komponent|component|button|tugma|form|forma|landing|sahifa|page|card|karta|navbar|sidebar|modal|dashboard)\b/i,
      /\b(tailwind|css|figma|shadcn|responsive|mobil|adaptiv)\b/i,
    ],
    prompt: [
      "UI/UX PRO MAX SKILL faol. Interfeys yaratganda ushbu ustuvor qoidalarga qat'iy amal qil:",
      "1) ACCESSIBILITY (kritik): matn kontrasti ≥4.5:1, alt matn, klaviatura navigatsiyasi, aria-label. Focus halqasini o'chirma; faqat ikonli tugmaga label qo'sh.",
      "2) TEGINISH (kritik): minimal 44×44px teginish maydoni, elementlar orasi ≥8px, har amalga darhol javob (loading). Faqat hover'ga bog'liq interaksiya qilma.",
      "3) STIL: mahsulot turiga mos yagona uslub, izchillik, SVG ikonlar. Flat va skeuomorfik aralashtirma; emoji'ni ikon sifatida ishlatma.",
      "4) LAYOUT: mobil-birinchi, breakpointlar 375/768/1024/1440px, gorizontal scroll yo'q, fiks px kenglikdan qoch, zoom'ni o'chirma.",
      "5) TIPOGRAFIYA & RANG: asosiy o'lcham ~16px, qator oralig'i 1.5, semantik rang tokenlari. Body ≤12px, kulrang-ustiga-kulrang va xom hex'dan qoch.",
      "6) ANIMATSIYA: kontekstga mos vaqt (150-300ms), harakat ma'no tashisin; barchasiga bitta davomiylik berma, prefers-reduced-motion'ni hurmat qil.",
      "7) FORMALAR: ko'rinadigan label (placeholder emas), xato maydon yonida, yordamchi matn. BARCHA holatlar: default/hover/focus/active/disabled/loading/empty/error.",
      "8) NAVIGATSIYA: bashoratli 'orqaga', pastki nav ≤5 element, deep-linking.",
      "TAQIQLANGAN anti-pattern'lar: AI binafsha/pushti gradient, neon ranglar, keskin animatsiya, emoji-ikon, gray-on-gray.",
      "Kod bersang: semantik HTML, aria atributlari, 4/8px spacing shkalasi.",
    ].join("\n"),
  },
  {
    id: "apple-design",
    name: "Apple Design",
    description: "Apple HIG uslubi: soddalik, aniqlik, liquid glass, chuqurlik",
    category: "design",
    glyph: "",
    color: "#0A84FF",
    triggers: [
      /\b(apple|ios|iphone|ipad|macos|swiftui|human interface|hig|liquid glass|glassmorphism|cupertino)\b/i,
      /\b(minimal|elegant|premium|nafis|soft ui)\b/i,
    ],
    prompt: [
      "APPLE DESIGN SKILL faol. Apple HIG'ning 8 tamoyili ruhida ishla: Maqsad, Agentlik (foydalanuvchi o'rganadi/bekor qiladi/tiklaydi), Mas'uliyat (shaffof ruxsat va ma'lumot), Tanishlik (platforma konvensiyalari), Moslashuvchanlik, Soddalik (har element o'rinli), Hunar (spacing/alignment/animatsiya tugallangan), Zavq.",
      "Sharh linzalari va aniq o'lchamlar:",
      "• Accessibility (kritik): matn tizim sozlamasi bilan masshtablanadi; mobil asosiy 17pt / min 11pt. Kontrast ≤17pt uchun 4.5:1, ≥18pt yoki qalin uchun 3:1. Boshqaruv min 44×44pt (mobil). Ma'noni faqat rang yoki harakat bilan berma.",
      "• Konvensiyalar: mobil = tab bar, bir vaqtda bitta sheet, safe-area hurmat; ilova ichida menyu.",
      "• Vizual hunar: bitta rang = bitta ma'no (yorug'/qorong'u/yuqori kontrastda ham), kam shrift (ierarxiya vazn/o'lcham orqali), saxiy spacing, bosqichma-bosqich ochish.",
      "• Chuqurlik: qatlamlar, yumshoq soya va blur (backdrop-filter). 'Liquid glass' — yarim shaffof, blurlangan, nozik chegarali material fonga moslashadi.",
      "• Interaksiya: darhol yuklanish javobi (aniqlik bo'lsa determinate progress); qaytarib bo'lmas amalda ogohlantirish + Bekor; modalda aniq chiqish.",
      "• Matn: label natijani tasvirlaydi ('O'zgarishlarni saqlash', 'Submit' emas); xato nima bo'lgani va qanday tuzatishni tushuntiradi; jargon yo'q.",
      "Katta radiuslar (12-24px), spring animatsiya (0.3-0.5s) — suzib kiradi, sakramaydi. Tizim ranglari (masalan #0A84FF).",
    ].join("\n"),
  },
  {
    id: "clean-code",
    name: "Clean Code",
    description: "Toza, xavfsiz, o'qiladigan kod; yaxshi amaliyotlar",
    category: "code",
    glyph: "◆",
    color: "#10D4A0",
    defaultOn: true,
    triggers: [
      /\b(kod|code|funksiya|function|dastur|program|debug|xato|error|refactor|api|component|typescript|javascript|python|react|next|sql|algoritm)\b/i,
      /```/,
    ],
    prompt: [
      "CLEAN CODE SKILL faol. Kod yozganda:",
      "• Ishlaydigan, to'liq va aniq kod ber; taxminlarni ayt. Kerak bo'lsa qisqa izoh, lekin ortiqcha komment emas.",
      "• Ma'noli nomlar, kichik funksiyalar, erta return, chuqur ichma-ichlikdan qoch. DRY, lekin ortiqcha abstraksiyasiz.",
      "• Chegara holatlarini (null, bo'sh, xato) ishlab chiq. Foydalanuvchi kiritmasiga ishonma — validatsiya qil.",
      "• Xavfsizlik: SQL/HTML injeksiyaga qarshi parametrlangan so'rov va escaping; sirlarni kodga yozma; xatolarni yut, ammo jimgina yutma.",
      "• Til/framework idiomalariga amal qil; eng so'nggi barqaror API'lardan foydalan. Zamonaviy TypeScript'da tip xavfsizligini saqla.",
      "• Yechimni qisqa tushuntir, keyin kod. Muqobil yondashuv bo'lsa bir gapda ayt.",
    ].join("\n"),
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity",
    description: "Mudofaa xavfsizligi: audit, xavfsiz kod, tahdid tahlili",
    category: "security",
    glyph: "🛡️",
    color: "#EF4444",
    triggers: [
      /\b(xavfsizlik|security|hack|exploit|vulnerab|zaiflik|penetration|pentest|owasp|xss|csrf|sql injection|injeksiya|shifrlash|encryption|auth|jwt|token|firewall|malware|phishing|ddos|siem|forensic)\b/i,
    ],
    prompt: [
      "CYBERSECURITY SKILL faol (mudofaa/ta'lim yo'nalishi). Xavfsizlik masalalarida:",
      "• Faqat mudofaa, tahlil, audit va ta'lim maqsadida yordam ber. Zararli hujum, ruxsatsiz kirish yoki aniqlashdan qochish uchun amaliy vosita yozma.",
      "• OWASP Top 10 va CWE asosida fikrla: kirish validatsiyasi, autentifikatsiya/avtorizatsiya, sirlarni boshqarish, xavfsiz sozlash, logging.",
      "• Kod ko'rsatsang — parametrlangan so'rovlar, chiqishni escaping, CSRF token, xavfsiz cookie (HttpOnly, Secure, SameSite), kuchli parol hash (argon2/bcrypt), TLS.",
      "• Zaiflikni tushuntirganda: nima, qanday xavf, qanday tekshirish, qanday tuzatish (remediation). Konkret misol bilan.",
      "• Tahdid modeli, eng kam imtiyoz (least privilege), zero-trust va chuqurlashtirilgan mudofaa (defense in depth) tamoyillarini eslat.",
      "• Nozik yoki dual-use so'rovda maqsadni oydinlashtir; qonuniy, avtorizatsiyalangan kontekstda yordam ber.",
    ].join("\n"),
  },
  {
    id: "pro-writing",
    name: "Pro Writing",
    description: "Aniq, ishonarli, professional matn va tahrir",
    category: "writing",
    glyph: "✎",
    color: "#F59E0B",
    triggers: [
      /\b(yoz|matn|maqola|xat|email|post|kontent|content|tahrir|edit|tarjima|translate|blog|scenariy|ssenariy|reklama|copywriting|slogan)\b/i,
    ],
    prompt: [
      "PRO WRITING SKILL faol. Matn yozganda:",
      "• Asosiy fikrni oldinga chiqar. Qisqa gaplar, faol nisbat, aniq fe'llar. Ortiqcha so'zlarni olib tashla.",
      "• Auditoriya va ohangni moslashtir (rasmiy/samimiy/marketing). Bir xil uslubni saqla.",
      "• Tuzilma: sarlavha, qisqa kirish, mantiqiy bo'limlar, aniq yakun yoki harakatga chaqiruv.",
      "• Klişe, ortiqcha sifat va bo'sh iboralardan qoch. Konkret misol va raqamlardan foydalan.",
      "• Tahrir so'ralsa: avval tuzatilgan variant, keyin nima o'zgarganini qisqa ro'yxatda.",
    ].join("\n"),
  },
  {
    id: "data-viz",
    name: "Data Viz",
    description: "Grafik, jadval va ma'lumot vizualizatsiyasi tamoyillari",
    category: "data",
    glyph: "▦",
    color: "#20D4E8",
    triggers: [
      /\b(grafik|chart|diagram|jadval|table|vizualizatsiya|visualization|dashboard|analytics|statistika|ma'lumot tahlil|plot|graph)\b/i,
    ],
    prompt: [
      "DATA VIZ SKILL faol. Ma'lumot ko'rsatganda:",
      "• To'g'ri grafik turini tanla: taqqoslash — ustun; trend — chiziq; ulush — bitta doira o'rniga ustun/nisbat; taqsimot — gistogramma.",
      "• Faqat kerakli ma'lumotni ko'rsat; chart-junk (ortiqcha to'r, 3D, gradient) dan qoch. Yuqori data-siyoh nisbati.",
      "• Aniq o'q belgilari, birliklar, sarlavha va manba. Nol nuqtadan boshla (ustunlar uchun).",
      "• Rang: kategoriya uchun ajratilgan palitra, ketma-ketlik uchun bitta rang gradienti. Rang-ko'r foydalanuvchilar uchun xavfsiz.",
      "• Muhim qiymatni urg'ula; qolganini susaytir. Tooltip va legend'ni sodda tut.",
    ].join("\n"),
  },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  code: "Kod",
  design: "Dizayn",
  security: "Xavfsizlik",
  writing: "Yozish",
  data: "Ma'lumot",
};

/** Skills whose triggers match the given text. */
export function detectSkills(text: string): string[] {
  return SKILLS.filter((s) => s.triggers.some((re) => re.test(text))).map((s) => s.id);
}

/** Merge user-enabled skills with auto-detected ones, keeping catalog order. */
export function resolveActiveSkills(enabled: string[], text: string): Skill[] {
  const auto = detectSkills(text);
  const ids = new Set([...enabled, ...auto]);
  return SKILLS.filter((s) => ids.has(s.id));
}

/** Combined guidance block for the active skills. */
export function skillsPrompt(skills: Skill[]): string {
  if (!skills.length) return "";
  return (
    "Quyidagi SOVEREIGN Skills faol — ularga qat'iy amal qil:\n\n" +
    skills.map((s) => s.prompt).join("\n\n")
  );
}

export const DEFAULT_ENABLED_SKILLS = SKILLS.filter((s) => s.defaultOn).map((s) => s.id);
