# SOVEREIGN AI — To'liq UI/UX Design Prompt
## Claude Design uchun Tayyor Prompt

> Bu hujjatni Claude Design'ga to'liq ko'chiring.
> Har bir ekran va komponent aniq tasvirlangan.

---

## PLATFORMA HAQIDA

**Platforma nomi:** SOVEREIGN AI  
**Tagline:** Your AI. Your Truth. Your Data. Forever.  
**Tur:** Premium AI chat platformasi — model almashish, maxfiylik, internet tadqiqot  
**Maqsadli auditoriya:** Texnologiya mutaxassislari, tadqiqotchilar, biznes foydalanuvchilar  

---

## BRAND IDENTIFIKATSIYA

### Universal Rang Tizimi

**Asosiy rang (Universal):**
```
Primary:      #5B50F0  → Kosmik indigo (barcha model ranglarining sintezi)
Primary Dark: #4338E0  → Hover/active holat
Primary Glow: rgba(91,80,240,0.25) → Shadow/glow effekt
```

**Fon ranglari (Dark mode — asosiy):**
```
bg-base:      #060812  → Eng chuqur fon (page background)
bg-elevated:  #0D1033  → Kartalar, panel
bg-floating:  #141840  → Overlay, dropdown, tooltip
bg-hover:     #1C2150  → Hover holat
```

**Matn ranglari:**
```
text-primary:  #F0F2FF  → Asosiy matn
text-secondary: #9BA3CC  → Ikkinchi darajali
text-muted:    #5C6490  → Hint, placeholder
text-disabled: #3A3F6A  → O'chiq holat
```

**Semantik ranglar:**
```
success:  #10D4A0  → Tasdiqlangan, yaxshi
warning:  #F59E0B  → Ogohlantirish
error:    #EF4444  → Xato
research: #20D4E8  → Perplexity/Internet rejimi
verified: #34D399  → Neural tekshiruvdan o'tgan
```

**Chegara ranglari:**
```
border-subtle:  rgba(255,255,255,0.06)
border-default: rgba(255,255,255,0.10)
border-strong:  rgba(255,255,255,0.18)
border-accent:  rgba(91,80,240,0.35)
```

### Per-Model Ranglar (Tema almashish)

| Model | Primary | Bg | Accent | Border |
|-------|---------|-----|--------|--------|
| SOVEREIGN (default) | #5B50F0 | #060812 | #7C6FF7 | rgba(91,80,240,0.3) |
| Claude | #CC785C | #1A0F0A | #D4956A | rgba(204,120,92,0.3) |
| ChatGPT | #10A37F | #0D0D0D | #19C37D | rgba(16,163,127,0.3) |
| Gemini | #4285F4 | #0C0C1E | #A855F7 | rgba(66,133,244,0.3) |
| Perplexity | #20808D | #0A0E14 | #29A0AD | rgba(32,128,141,0.3) |
| Mistral | #FF7000 | #0F0A05 | #FF9500 | rgba(255,112,0,0.3) |
| LLaMA | #7C3AED | #080516 | #9F67FF | rgba(124,58,237,0.3) |

### Tipografiya

**Display shrift (sarlavhalar, logo):**
```
Font: Syne (Google Fonts)
Weights: 700, 800
Ishlatilishi: Logo, hero sarlavhalar, model nomi
```

**Asosiy shrift (matn, UI):**
```
Font: DM Sans (Google Fonts)
Weights: 300, 400, 500
Ishlatilishi: Barcha UI matn, suhbat
```

**Monospace (kod, token):**
```
Font: DM Mono (Google Fonts)
Weights: 400, 500
Ishlatilishi: Kod bloklar, API key, token
```

**Tipo shkala:**
```
xs:   11px / 1.4  — Label, badge
sm:   13px / 1.5  — Caption, meta
base: 15px / 1.65 — Asosiy matn
lg:   17px / 1.55 — Katta matn
xl:   20px / 1.4  — Kichik sarlavha
2xl:  26px / 1.25 — O'rta sarlavha
3xl:  34px / 1.15 — Katta sarlavha
4xl:  44px / 1.05 — Hero
5xl:  58px / 1.0  — Display
```

### Geometriya va Spacing

```
Border radius:
  xs: 4px   — Chip, tag
  sm: 8px   — Input, kichik karta
  md: 12px  — Karta, modal
  lg: 16px  — Panel
  xl: 24px  — Katta modal
  full: 100px — Pill, avatar

Spacing tizimi (4px asosi):
  1: 4px  | 2: 8px  | 3: 12px | 4: 16px
  5: 20px | 6: 24px | 8: 32px | 10: 40px
  12: 48px | 16: 64px | 20: 80px

Shadow tizimi:
  sm: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)
  md: 0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)
  lg: 0 8px 32px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.3)
  glow: 0 0 24px rgba(91,80,240,0.3), 0 0 8px rgba(91,80,240,0.2)
```

---

## EKRAN 1 — LANDING PAGE (Marketing Sahifa)

### Hero Section

```
Layout: To'liq ekran, vertikal markazlashgan
Fon: #060812 + animated star field (300 nuqta, sekin aylanadigan)

Chapda (60% kenglik):
┌─────────────────────────────────────────┐
│  [Badge] "YANGI AVLOD AI PLATFORMASI"   │
│          (indigo bordered pill)         │
│                                         │
│  H1 (Syne 800, 58px):                  │
│  "Barcha AI'lar                         │
│   Bitta Joyda.                          │
│   Faqat Sizniki."                       │
│                                         │
│  Subtext (DM Sans 400, 17px, #9BA3CC): │
│  "GPT-4o, Claude, Gemini, Mistral —    │
│   hamma bitta interfeys orqali.         │
│   Suhbatlaringiz shifrlangan.           │
│   Xotirangiz sizda."                    │
│                                         │
│  [CTA: "Bepul Boshlash"] → /register   │
│  (Indigo bg, white text, 16px radius)  │
│                                         │
│  [Secondary: "Arxitektura haqida →"]   │
│  (Text link, muted color)              │
│                                         │
│  Pastda: "Google, Email yoki davom et" │
│  Kichik ikonlar: 🔒 "Maxfiy" ⚡ "Tez" │
└─────────────────────────────────────────┘

O'ngda (40%):
[Animated Model Switcher Demo]
— Aylanadigan karta: Claude → ChatGPT → Gemini
— Har bir karta o'z rangi bilan animatsiyada
— Real chat ko'rinishi

```

### Features Section (3 ustun)

```
Ustun 1: 🔐 "Zero-Trust Maxfiylik"
  "Blind Prompting — AI kompaniyalari sizning 
   haqiqiy ma'lumotingizni ko'rmaydi"
  
Ustun 2: 🧠 "Umrbod Xotira"
  "AI sizni yillar davomida o'rganadi.
   Bu bilim faqat sizga tegishli."
  
Ustun 3: ✅ "Tekshirilgan Javoblar"
  "Neural-Symbolic Engine har bir javobni
   faktlar bazasiga solishtiradi."
```

### Model Showcase Section

```
Title: "Qaysi AI'ni tanlasangiz — biz qo'llab-quvvatlaymiz"

6 ta model karta (3x2 grid):
Har bir karta:
  — Model rangi bilan gradient background
  — Logo / ikon
  — Nom va provider
  — Qisqa ta'rif
  — "Tekin" yoki narx badge

[Claude]      [ChatGPT]    [Gemini]
[Perplexity]  [Mistral]    [LLaMA 🆓]
```

---

## EKRAN 2 — REGISTER / LOGIN SAHIFASI

### Layout

```
Ikki ustun (50/50):

Chap — Visual panel:
  Fon: #0D1033, gradient overlay
  Markazda: SOVEREIGN logo (animatsiyali)
  Pastda: Floating model cards (Claude, GPT, Gemini)
  Quote: "Birinchi marta AI sizga tegishli."

O'ng — Form panel:
  Fon: #060812
  Markazda joylashgan karta (max-width: 420px)
```

### Register Karta

```
┌────────────────────────────────────────┐
│  [SOVEREIGN logo - small]              │
│                                        │
│  H2: "Hisobingizni yarating"           │
│  Subtext: "30 soniyada tayyor"         │
│                                        │
│  [Google bilan davom etish]            │
│  (Google ranglari, "G" ikonasi)        │
│                                        │
│  ─────── yoki ───────                  │
│                                        │
│  [Email input]                         │
│  placeholder: "email@example.com"      │
│                                        │
│  [Parol input] + ko'z ikoni            │
│  placeholder: "Kamida 8 belgi"         │
│                                        │
│  [Parolni tasdiqlash]                  │
│                                        │
│  [✓] "Foydalanish shartlariga roziman" │
│  (link sifatida "shartlar")            │
│                                        │
│  [DAVOM ETISH →]                       │
│  (To'liq kenglik, indigo, 48px height) │
│                                        │
│  "Hisobingiz bormi? Kiring →"         │
└────────────────────────────────────────┘

Pastda: 
🔒 "256-bit shifrlash" · 🚫 "Reklamasiz" · 🌍 "GDPR"
```

### Login Karta (tab yoki alohida sahifa)

```
[Elektron pochta] tab | [Parol] tab

Google OAuth button (birinchi, katta)
─── yoki ───
Email + Parol forma
"Parolni unutdingizmi?" link
[KIRISH →]
```

---

## EKRAN 3 — ONBOARDING QUESTIONNAIRE

### Umumiy ko'rinish

```
Fon: #060812
Progress bar (yuqorida): ████░░░░ "Savol 2 / 5"
                          (Indigo color, animated fill)

Markazda katta karta:
  max-width: 600px
  border: 1px solid rgba(255,255,255,0.08)
  border-radius: 24px
  padding: 48px
  background: #0D1033
```

### Savol 1: Maqsad

```
Stepda step number: [01]
H2: "AI'ni asosan nima uchun ishlatasiz?"
Subtext: "Bu bizga siz uchun eng yaxshi sozlamalarni tanlashga yordam beradi"

4 ta karta (2x2 grid):

[🏢 Ish / Biznes]         [🔬 Tadqiqot]
  Hisob-kitob, email,       Internet qidiruv,
  tahlil                    maqolalar, faktlar

[🎨 Ijodiy]               [💬 Shaxsiy]
  Yozish, dizayn,           Suhbat, savol,
  kontent                   o'rganish

Har bir karta:
  — Tanlanganda: indigo border + background
  — Hover: scale(1.02) + shadow
  — Multi-select mumkin

[KEYINGISI →] (disabled, tanlanguncha)
```

### Savol 2: Soha

```
[02] "Qaysi sohada ishlaysiz?"

Chip-style buttons (wrap layout):
[Texnologiya] [Biznes] [Ta'lim] [Sog'liqni saqlash]
[Huquq] [Moliya] [Marketing] [Muhandislik]
[Ilmiy tadqiqot] [Ijodiy sohalar] [Boshqa ...]

Tanlanganlar: Filled indigo
Tanlanmaganlar: Outlined, subtle
```

### Savol 3: Prioritetlar

```
[03] "Siz uchun eng muhimi nima?" (Ko'p tanlash)

4 ta toggle karta (2x2):

[⚡ Tezlik]               [🎯 Aniqlik]
  Tez javoblar              Tekshirilgan
  kerak                     ma'lumotlar

[🔒 Maxfiylik]            [💰 Narx]
  Ma'lumotlarim             Arzon yoki
  xavfsiz bo'lsin           tekin modellar
```

### Savol 4: Tillar

```
[04] "Qaysi tillarda ishlaysiz?" (Ko'p tanlash)

Flag emoji bilan:
[🇺🇿 O'zbek] [🇷🇺 Rus] [🇬🇧 Ingliz]
[🇩🇪 Nemis] [🇫🇷 Fransuz] [🇸🇦 Arab]
[+ Boshqa qo'shish] (text input)
```

### Savol 5: Tajriba darajasi

```
[05] "AI bilan qancha vaqt ishlagansiz?"

Slider:
Yangi boshlovchi ──────●──── Ekspert
        |                        |
   "Birinchi marta"         "Har kuni"

Slider pozitsiyasiga qarab matn:
● Yangi → "AI asoslarini o'rgatamiz"
● O'rta → "Ilg'or xususiyatlarni ko'rsatamiz"  
● Ekspert → "Barcha sozlamalarni oching"
```

### Onboarding Completion

```
Animatsiyali:
  1. ✓ icon paydo bo'ladi (scale animatsiya)
  2. "Ajoyib! Sozlamalaringiz tayyor"
  3. Model tavsiyasi: "Siz uchun Claude 3.5 eng yaxshi"
     (onboarding javoblari asosida)
  4. [SOVEREIGN'ga KIRISH →] — katta CTA
  
Loading animatsiya:
  "Shaxsiy AI Vault yaratilmoqda..."
  "Xotira tizimi sozlanmoqda..."
  "Tayyor! 🎉"
```

---

## EKRAN 4 — ASOSIY DASHBOARD (Chat Interface)

### Layout Tuzilmasi

```
┌──────────────┬─────────────────────────────┐
│    SIDEBAR   │      CHAT AREA              │
│   (260px)    │      (flex-1)               │
│              │                             │
│   Logo       │  ┌──────────────────────┐  │
│   ─────────  │  │  Chat Header         │  │
│   + Yangi    │  │  [Model Switcher]    │  │
│   Suhbat     │  └──────────────────────┘  │
│              │                             │
│   Qidiruv    │  ┌──────────────────────┐  │
│   ─────────  │  │                      │  │
│   Suhbat 1   │  │    Message Area      │  │
│   Suhbat 2   │  │    (scrollable)      │  │
│   Suhbat 3   │  │                      │  │
│   ...        │  └──────────────────────┘  │
│              │                             │
│   ─────────  │  ┌──────────────────────┐  │
│   Xotira     │  │    Input Area        │  │
│   Knowledge  │  │                      │  │
│   Sozlamalar │  └──────────────────────┘  │
│              │                             │
│   [Avatar]   │                             │
│   Mansurov   │                             │
└──────────────┴─────────────────────────────┘
```

### Sidebar Detali

```
YUQORI QISM:
┌────────────────────────┐
│ ⬡ SOVEREIGN  [Yopish] │  ← Logo + hamburger
├────────────────────────┤
│ + Yangi suhbat         │  ← Primary button, indigo
├────────────────────────┤
│ 🔍 Suhbatlarni qidirish│  ← Search input
└────────────────────────┘

SUHBATLAR RO'YXATI:
Bugun
  ● Claude bilan loyiha...
  ● GPT: Python kodi
  
Kecha
  ● Gemini: Tadqiqot
  
Bu hafta
  ● Mistral: Fransuz tili
  ...

Har bir suhbat item:
  — [Model color dot] + Suhbat nomi
  — Hover: options (...) → Rename, Delete
  — Active: Indigo bg

PASTKI QISM:
─────────────────────────
🧠 Xotira (43 tugun)     →
📁 Knowledge Base (5)    →
🔬 Research rejim        ○ (toggle)
─────────────────────────
[Avatar] Mansurov · Free  
         [Upgrade →]
```

### Model Switcher (Chat Header)

```
┌─────────────────────────────────────────────────┐
│                                                   │
│  [◀ Orqaga]  "Yangi suhbat"    [🔗] [⋮]         │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Hozirgi model:                              │ │
│  │  [●] Claude 3.5 Sonnet          [▼]         │ │
│  │      Anthropic · $0.003/1K                   │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  [Tezkor model o'zgartirish - chip style]:        │
│  [Claude] [GPT-4o] [Gemini] [🌐 Research] [+]   │
│                                                   │
└─────────────────────────────────────────────────┘
```

### Model Dropdown (tanlash vaqtida)

```
Model tanlash dropdown karta:
max-height: 480px
border-radius: 16px
shadow: lg

┌─────────────────────────────────────┐
│  Model tanlang                       │
│  ─────────────────────────────────  │
│                                     │
│  PREMIUM MODELLAR                   │
│  ┌──────────────────────────────┐   │
│  │ ● Claude 3.5 Sonnet          │   │
│  │   Yozish, tahlil uchun ideal │   │
│  │   ████ Aqlli   ███ Ijodiy    │   │  ← Capability bars
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ ⬡ GPT-4o                     │   │
│  │   Kod va matematik           │   │
│  │   ████ Tez   ████ Kod        │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ ✦ Gemini Pro 1.5             │   │
│  │   Ko'p modal, vizual         │   │
│  └──────────────────────────────┘   │
│                                     │
│  TEKIN MODELLAR  [🆓]               │
│  ─────────────────────────────────  │
│  LLaMA 3.1 8B · Tekin              │
│  Gemma 2 9B · Tekin                 │
│  Mistral 7B · Tekin                 │
│                                     │
│  INTERNET TADQIQOT  [🌐]            │
│  ─────────────────────────────────  │
│  Perplexity Sonar · Tekin           │
│  Perplexity Pro · $0.001/qidiruv   │
└─────────────────────────────────────┘
```

---

## EKRAN 5 — MODEL-SPESIFIK TEMALAR

### 5.1 Claude Temasi

```
Fon: #1A0F0A (chuqur qo'ng'ir-qora)
Accent: #CC785C (issiq korall)

Sidebar: #120A07
Chat bg: #1A0F0A
Input area: #221409

Xarakter belgisi:
  — Sarlavhada "✦" belgisi (Anthropic uslubi)
  — O'ngda "Made by Anthropic" badge
  — Shrift: Ko'proq serif hissiyot

Welcome screen:
  "✦ Claude"
  Katta, issiq korall
  "Yaxshi fikrlar uchun suhbat"
  
AI avatar: Korall rangli animatsiyali "✦"

Xabar pufagi:
  User: #2D1A12 bg
  Claude: #221409 bg, chapda korall chiziq
  
Efekt: Xabar yozilayotganda nozik "qalam" animatsiyasi
```

### 5.2 ChatGPT Temasi

```
Fon: #0D0D0D (sof qora)
Accent: #10A37F (GPT yashil)

Xarakter belgisi:
  — "⬡" hexagon (OpenAI uslubi)
  — Minimal, tekis dizayn
  — Inter / Söhne uslubidagi shrift

Welcome screen:
  "⬡ ChatGPT"  
  "Men sizga qanday yordam bera olaman?"
  (OpenAI'ning o'z uslubi)

Xabar pufagi:
  User: #1A1A1A (kamroq kontrast)
  GPT: #0D0D0D, chapda yashil chiziq
  
Efekt: Cursor animatsiyasi (blinking cursor)
Tugmalar: Tekis, sharp corners (4px radius)
```

### 5.3 Gemini Temasi

```
Fon: #0C0C1E (deep indigo-qora)
Accent: Multi-color gradient

Xarakter belgisi:
  — "✦" ko'p rangli (Google 4 rangi)
  — Material Design elementlari
  — Rounded, yumshoq

Welcome screen:
  Gradient "✦ Gemini"
  Rainbow shimmer animatsiyasi
  "Hello! Men Gemini."

Xabar pufagi:
  User: #1E1E3A
  Gemini: #161630, chapda gradient chiziq
  
Efekt: Typing animatsiya (Google-style dots)
Logo: Animatsiyali rainbow sparkle
Tugmalar: Ko'proq rounded (24px radius)
```

### 5.4 Perplexity Temasi (Research rejimi)

```
Fon: #0A0E14 (juda to'q)
Accent: #20808D (teal)

MAXSUS: Research panel sidebar (o'ngda)
┌─────────────────────┐
│ 🌐 MANBALAR         │
│ ─────────────────── │
│ 1. Wikipedia.org    │
│ 2. arxiv.org/...    │
│ 3. nature.com/...   │
│                     │
│ Qidiruv so'zi:      │
│ "AI privacy 2026"   │
│                     │
│ ─────────────────── │
│ Oxirgi yangilash:   │
│ 2 daqiqa oldin      │
└─────────────────────┘

Xabar ichida manba raqamlari: [1] [2] [3]
Hover qilganda: Manba preview popup

Typing animatsiya: "Internetdan qidirmoqda..."
+ Spinner animatsiya teal rangida
```

---

## EKRAN 6 — CHAT XABAR DIZAYNI

### Xabar Komponentlari

```
USER XABARI:
  Joylashuv: O'ngda (right-aligned)
  Fon: Indigo-tinted (#1C1F42)
  Border radius: 18px 18px 4px 18px
  Max-width: 70%
  
  Ichida:
    — Matn
    — [Fayl belgilangan bo'lsa: file preview]
    — Timestamp (hover qilganda ko'rinadi)

AI XABARI:
  Joylashuv: Chapda
  Fon: #0D1033 (elevated bg)
  Border radius: 4px 18px 18px 18px
  Border-left: 3px solid [model-primary-color]
  Max-width: 85%
  
  Ichida:
    — [Model avatar - kichik circle, model rangi]
    — Matn (Markdown render)
    — Kod blok (syntax highlighting, ko'chirish tugmasi)
    — [Neural-Symbolic badge: "✓ Tekshirilgan" yoki "⚠ Ehtiyot bo'ling"]
    — Pastda: Feedback buttons (👍 👎 📋 🔄)

TYPING INDICATOR:
  Chapda, model color dot
  Uch nuqta animatsiyasi: ●●●
  Model-spesifik: har model o'z animatsiyasiga ega

RESEARCH XABARI (Perplexity):
  Yuqorida: "🌐 Internet tadqiqoti"
  Manbalar badge'lari: [1] [2] [3]
  Pastda: "Manbalar" togglable section
```

### Markdown Render

```
Kod bloklari:
  — Syntax highlighting (Shiki yoki Prism)
  — Pastda: [Til nomi] + [Nusxa olish] tugmasi
  — Fon: #0A0E1A, mono shrift
  — Rounded: 10px

Jadvallar:
  — Zebra stripes (alternating row bg)
  — Overflow-x: scroll (kichik ekranda)

Matematik:
  — KaTeX render
  — Block va inline

Ro'yxatlar:
  — Custom bullet: kichik model-color dot

Blockquote:
  — Chapda model-color chiziq
  — Fon: Transparent tinted
```

---

## EKRAN 7 — INPUT AREA

```
┌─────────────────────────────────────────────────┐
│                                                   │
│  [📎] [🎙️]  Xabar yozing...          [Yuborish] │
│                                                   │
│  [🌐 Research] [🧠 Xotira] [📁 File] [⚡ Tezkor]│
│                                                   │
└─────────────────────────────────────────────────┘

Input karta xossalari:
  border: 1px solid rgba(255,255,255,0.10)
  background: #0D1033
  border-radius: 20px
  Focus ring: 2px solid [model-primary-color]
  
Yuborish tugmasi:
  — Matn kiritmasa: disabled (o'q icon, muted)
  — Matn kiritganda: aktiv (model rangi)
  — Hover: glow effect

Qo'shimcha tugmalar (pastda, chip style):
  [🌐 Research rejim] — Toggle, Perplexity yoqish
  [🧠 Xotiradan] — Xotira konteksti qo'shish
  [📁 Fayl] — Fayl yuklash
  [⚡ Tez javob] — Stream emas, to'liq javob

Keyboard shortcuts badge:
  ↵ Enter — Yuborish
  ⇧ Shift+Enter — Yangi qator
```

---

## EKRAN 8 — XOTIRA SAHIFASI

### Memory Graph Vizualizatsiyasi

```
URL: /memory

Header: "Sizning AI Xotirasi"
Subtext: "43 tugun · Oxirgi yangilash: bugun"

TOP: Stats row
┌──────────┬──────────┬──────────┬──────────┐
│  43      │  12      │  156     │  3.2 MB  │
│  Tugun   │  Loyiha  │  Fakt    │  Hajm    │
└──────────┴──────────┴──────────┴──────────┘

ASOSIY: Interactive graph
  — D3.js yoki force-directed graph
  — Har bir tugun: circle, turga qarab rangli
  — Aloqalar: animatsiyali chiziqlar
  — Hover: Tugun tarkibini preview ko'rsatish
  — Click: Tugun detali (sidebar'da)

O'NGDA: Tugun detali sidebar
  Tanlangan tugun:
    — Tur (Fakt / Loyiha / Shaxs / Preference)
    — Matn
    — Qachon yaratilgan
    — Qancha suhbatda ishlatilgan
    — [Tahrirlash] [O'chirish]

PASTDA: Filter va boshqaruv
  [Hammasi] [Fakt] [Loyiha] [Shaxs] [Preference]
  [🔍 Xotiradan qidirish]
  [📤 Eksport] [⚠️ Hammasini o'chirish]
```

---

## EKRAN 9 — SOZLAMALAR SAHIFASI

### Navigatsiya (chapda tabs)

```
Profil
Maxfiylik & Xavfsizlik
Model Sozlamalari
Ko'rinish (Tema)
Xotira
Billing
```

### Maxfiylik va Xavfsizlik Sahifasi

```
H2: "Maxfiylik & Xavfsizlik"

SECTION: Blind Prompting
  Toggle: [●] Yoqilgan
  "Barcha so'rovlardagi shaxsiy ma'lumotlar 
   avtomatik maskalanadi"
  [Sozlamalar →] — Token turlari

SECTION: Shifrlash
  "AES-256-GCM shifrlash" [✓ Yoqilgan]
  Master parolni o'zgartirish →
  Recovery key ko'rish →

SECTION: Ma'lumotlar
  [📤 Barcha ma'lumotlarni eksport (GDPR)]
  [⚠️ Hisobni o'chirish]

SECTION: Faol sessiyalar
  — Har bir sessiya: qurilma, vaqt, IP
  — [Yopish] tugmasi har birida
```

### Model Sozlamalari

```
Default model: [Dropdown]
Fallback model: [Dropdown]
Temperature: [Slider] 0 ─────●──── 2
Max tokens: [Input]
System prompt: [Textarea]

Per-model sozlamalar:
  [Claude] [GPT] [Gemini] [Perplexity] tablar
  Har birida API key (ixtiyoriy, o'z API)
```

### Ko'rinish (Tema)

```
SECTION: Model Atmosferasi
  "Model almashganda UI ham o'zgarsinmi?"
  Toggle: [●] Ha → dinamik tema
           [○] Yo'q → SOVEREIGN default

SECTION: Asosiy Tema
  [● Tizim (avtomatik)]
  [○ Qorong'u]
  [○ Yorug']

SECTION: Animatsiyalar
  [●] Xabar animatsiyalari
  [●] Model almashish o'tishi
  [○] Yulduzlar animatsiyasi (battery saver)

SECTION: Shrift
  Kattaroq [──●──] Kichikroq
  Preview: "Salom, bu namuna matn"
```

---

## EKRAN 10 — MOBIL (Telefon) KO'RINISH

### Adaptiv Layout

```
Telefon (< 640px):
  — Sidebar overlay (hamburger orqali ochiladi)
  — Bottom navigation bar
  — Chat xabarlari to'liq kenglik
  — Model switcher → bottom sheet

Bottom Navigation:
  [🏠 Bosh] [🔬 Tadqiqot] [🧠 Xotira] [⚙️ Sozlama]

Model Switcher (mobile):
  — Bottom sheet slide up
  — Horizontal scroll chips
  — Swipe to dismiss

Input Area (mobile):
  — Kichikroq, kompakt
  — Attach + Send tugmalari kattaroq (touch target min 44px)
  — Virtual keyboard ko'tarilganda input ustida qoladi
```

---

## ANIMATSIYA VA O'TISH EFFEKTLARI

### Model Almashish Animatsiyasi

```
Duration: 400ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)

Jarayon:
  1. Eski tema fades out (opacity: 1 → 0, 150ms)
  2. Background color interpolates (150ms overlap)
  3. Yangi tema fades in (opacity: 0 → 1, 200ms)
  4. Accent color animates via CSS custom properties
  
CSS:
  :root { transition: --primary-color 300ms ease; }
```

### Xabar Paydo Bo'lish

```
User xabari:
  Translate: translateY(8px) → translateY(0)
  Opacity: 0 → 1
  Duration: 200ms

AI xabari:
  Translate: translateX(-8px) → translateX(0)
  Opacity: 0 → 1
  Duration: 250ms
  Delay: 50ms (user xabaridan keyin)
```

### Loading States

```
Skeleton screens:
  — Shimmer animatsiya (right-to-left gradient)
  — Model-specific color tint

Research typing:
  "🌐 Internetdan qidirmoqda..."
  [Teal spinner] + pulsing dots

Memory injection:
  "🧠 Xotiradan kontekst qo'shilmoqda..."
  Quick flash, then chat opens
```

---

## KOMPONENT KUTUBXONASI (Claude Design uchun)

```
ASOSIY KOMPONENTLAR:

1. Button (5 variant):
   Primary | Secondary | Ghost | Danger | Icon-only
   Sizes: sm (32px) | md (40px) | lg (48px)
   States: default | hover | active | disabled | loading

2. Input:
   Text | Password | Search | Textarea
   States: default | focus | error | disabled
   Label + helper text + error message

3. Model Card:
   Compact (chip) | Regular (dropdown item) | Large (grid)
   Selected state | Hover state | Disabled state

4. Message Bubble:
   User variant | AI variant | System variant
   Verified badge | Research badge | Error state

5. Memory Node:
   Compact | Expanded | Graph node
   Types: fact | project | person | preference

6. Badge / Chip:
   Model badge | Status badge | Category chip
   Colors: per-model | semantic (success/warning/error)

7. Sidebar Item:
   Conversation item | Nav item | Section header

8. Toast / Notification:
   Success | Warning | Error | Info
   Position: bottom-right
   Auto-dismiss: 4 seconds

9. Modal:
   Small (confirm) | Medium (form) | Large (content)
   Backdrop blur: 8px

10. Tooltip:
    Text only | With icon
    Directions: top | bottom | left | right
```

---

## REFERANS RASMLAR VA INSPIRATSIYALAR

### Model UI Referanslari

```
CLAUDE UI (claude.ai):
  ✓ Foydalanuvchi Screenshot bergan
  — Qorong'u sidebar (#1A1A1A)
  — Markazda "You're here!" welcome
  — Pastda: Chat input + Chat/Cowork tabs
  — Model tanlash: "Sonnet 5 Medium"
  — Warm, humanistic feel

CHATGPT UI (chat.openai.com):
  URL: https://chat.openai.com (screenshot olish kerak)
  — Qorong'u sidebar (#171717)
  — Markazda "ChatGPT" logo
  — GPT-4o model selector
  — Clean, minimal, green accent
  — Sharp edges (8px radius)

GEMINI UI (gemini.google.com):
  URL: https://gemini.google.com
  — Yorug' va qorong'u ikkovi
  — Colorful gradient header
  — Material Design 3 components
  — Rounded (24px+) everywhere
  — Google Sans typography

PERPLEXITY UI (perplexity.ai):
  URL: https://perplexity.ai
  — Very minimal, research-focused
  — Sources panel on right
  — Citation numbers in text [1][2][3]
  — Clean teal accent
  — Dark, distraction-free
```

### Design Inspiratsiya

```
Umumiy atmosfera uchun referanslar:

1. Linear.app — Premium dark UI, smooth animations
2. Vercel.com — Clean tech, minimal, elegant
3. Resend.com — Developer-first, beautiful dark
4. Raycast.app — Power user, keyboard-first
5. Figma.com — Creative, professional dark

SOVEREIGN bu barcha uslublarning sintezi:
  — Linear'ning animation sifati
  — Vercel'ning clean typography
  — Raycast'ning power-user focus
  — Per-model atmospheraning o'ziga xosligi
```

---

## LIGHT MODE (YORUG' TEMA)

```
Asosiy fon: #F8F9FF (juda yengil ko'k-oq)
Ikkinchi fon: #FFFFFF
Ko'tarilgan: #EEF0FF
Matn: #0A0C1A
Ikkinchi matn: #4A5280
Chegaralar: rgba(10,12,26,0.08)

Accent: #5B50F0 (bir xil, dark modedagi kabi)
Success: #059669
Warning: #D97706
Error: #DC2626

Model-specific light:
Claude:      #FFF8F5 fon, #CC785C accent
ChatGPT:     #F7FFFE fon, #10A37F accent
Gemini:      #F5F8FF fon, #4285F4 accent
Perplexity:  #F4FAFB fon, #20808D accent
```

---

## QISQACHA: CLAUDE DESIGN'GA TASHLAYDIGAN PROMPT

```
SOVEREIGN AI — Premium AI chat platformasi dizayni yarating.

BRAND:
Platform nomi: SOVEREIGN AI
Tagline: "Your AI. Your Truth. Your Data. Forever."
Universal rang: #5B50F0 (kosmik indigo)
Asosiy fon: #060812 (deep space)
Shriftlar: Syne (display) + DM Sans (body) + DM Mono (code)

MAXSUS XUSUSIYAT — MODEL TEMA ALMASHISH:
Foydalanuvchi modeli almashtirganda butun UI atmosferasi o'zgarsin:
- Claude → issiq korall (#CC785C), qo'ng'ir fon
- ChatGPT → yashil (#10A37F), sof qora fon  
- Gemini → ko'k/binafsha gradient (#4285F4), deep blue fon
- Perplexity → teal (#20808D), research panel bilan
- Mistral → amber (#FF7000), professional euro hissi
- LLaMA → binafsha (#7C3AED), "TEKIN" badge

EKRANLAR (ushbu tartibda):
1. Landing page — animatsiyali star field bg, model showcase
2. Register/Login — 2 ustun, Google OAuth + Email
3. Onboarding — 5 savol, progress bar, karta va chip UI
4. Main Dashboard — 3 ustunli layout (sidebar + chat + opsional panel)
5. Model Switcher dropdown — capability bars bilan
6. Chat xabarlar — user (o'ng) + AI (chap, model-renkli border)
7. Research rejim — Perplexity, manbalar panel
8. Memory sahifasi — force-directed graph vizualizatsiyasi
9. Sozlamalar — Privacy, model, tema, billing
10. Mobil adaptiv

UI TONI:
- Premium, minimal, dark-first
- Har bir model o'zining "shaxsiyatini" bersin
- Animatsiyalar silliq, maqsadli
- Typography kuchli, ierarxiya aniq
- Foydalanuvchi xotiri va maxfiyligi UI'da ko'rinsin
```

---

*SOVEREIGN Design Prompt v1.0*
