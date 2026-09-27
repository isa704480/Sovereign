# SOVEREIGN Skills

Chatbot javoblariga qo'shiladigan ekspert "playbook"lar. Ochiq Claude-skill'lardan moslashtirilgan (hammasi MIT):

- **UI/UX Pro Max** — [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- **Apple Liquid Glass** (id `apple-design`) — [naplesblue/apple-liquid-glass](https://github.com/naplesblue/apple-liquid-glass)
- **Cybersecurity Pro** (faqat mudofaa) — [mukul975/anthropic-cybersecurity-skills](https://github.com/mukul975/anthropic-cybersecurity-skills)
- **No AI Slop** (eski `pro-writing` shu skillga o'tdi) — [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop)
- **Focus / ADHD-friendly answers** (`focus-mode`, faqat qo'lda) — [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd)
- SOVEREIGN'ning o'zi: Clean Code, Data Viz

## Qanday ishlaydi

- **Yagona manba**: `src/config/skills.ts`. Katalog oddiy JSON-ma'lumot (triggerlar — regex manba satrlari),
  prompt'lar ingliz tilida (model uchun, har biri ≤ ~600 token), nom/tavsiflar — i18n kalitlari
  (`src/lib/locales/p18-skills.ts`, 4 tilda), belgi — lucide ikon nomi (emoji emas).
- **Qo'lda**: web'da **Skills** tugmasi / bozor, CLI'da `/skill <id>`, Cowork'da Sozlamalar → Skillar.
  Tanlov akkauntda (`profiles.enabled_skills`, `/api/cli/me`) — CLI va Cowork bir xil ro'yxatni ko'radi.
- **Avtomatik**: oxirgi foydalanuvchi xabaridagi kalit so'zlar (uz/ru/en) ball beradi: kuchli so'z = 2,
  kuchsiz = 1, qarama-qarshi signal = −2; ≥ 2 ball bo'lsa skill yoqiladi. Salomlashish, rahmat va bir so'zli
  xabarlar hech narsani yoqmaydi. `focus-mode` hech qachon o'zi yoqilmaydi.
- **Limit**: bitta so'rovda ko'pi bilan 4 ta skill (`MAX_ACTIVE_SKILLS`), shundan avto-aniqlangan ko'pi bilan
  2 ta (`MAX_AUTO_SKILLS`). 4 tadan ko'p yoqilgan bo'lsa, xabarga eng moslari tanlanadi.
- **Web** (`/api/chat`): skill qoidalari system prompt'ga qo'shiladi, ishlatilganlari `skills` SSE hodisasi bilan
  qaytadi va javob ostida chip bo'lib ko'rinadi.
- **CLI / Cowork** (`/api/cli/chat`): server akkauntdagi skillar + avto-aniqlanganlarni bitta system xabar
  sifatida qo'shadi va javobda `skills: [...]` qaytaradi (CLI — xira qator, Cowork — chip'lar). Eski server
  (`skills` maydoni yo'q) bilan CLI zaxira sifatida faqat nomlar ro'yxatini yuboradi. Mahalliy model (Ollama)
  va shaxsiy OpenRouter kaliti rejimida skillar qo'llanmaydi.
- Taxalluslar: `pro-writing` → `no-ai-slop`, `apple-liquid-glass` → `apple-design`, `i-have-adhd` → `focus-mode`.

## Yangi skill qo'shish

1. `src/config/skills.ts` dagi `SKILLS` massiviga obyekt qo'shing (`id`, `name`, `nameKey`, `descKey`,
   `detailKeys`, `category`, `icon`, `color`, `triggers` — `strong(...)`/`weak(...)`/`kw(-2, ...)`, `prompt`,
   ixtiyoriy `aliases`, `source`).
2. Matnlarni `src/lib/locales/p18-skills.ts` ga 4 tilda qo'shing; kerak bo'lsa `SkillIcon.tsx` ga ikon.
3. CLI (`cli/src/skills.mjs`) va Cowork (`desktop/ui/src/lib/skills.js`, `desktop/ui/src/lib/i18n.js` →
   `skill.<id>.desc`) ro'yxatlariga qo'shing.
4. Tekshiruv: `npx tsx --conditions=react-server src/config/skills.test.ts` (katalog mosligi, byudjet,
   triggerlar), `node cli/scripts/test-skills.mjs`, `npm run i18n:check`.
