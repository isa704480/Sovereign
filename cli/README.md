# SOVEREIGN CLI

Terminaldagi AI koding agenti. `sovereign` deb yozing — AI ochiladi, ish papkangizda **fayl va papka yarata, o'qiy va o'zgartira** oladi, kod yozadi.

## O'rnatish

Node.js 20+ kerak.

```bash
npm install -g @islombekmansurov/sov-cli
```

> Loyiha ichidan (publish qilinmagan bo'lsa): `npm run cli:install`
> O'chirish: `npm uninstall -g @islombekmansurov/sov-cli`

Bu `sovereign` (va qisqa `sov`) buyrug'ini o'rnatadi.

## Ulanish (2 yo'l)

### 1. SOVEREIGN akkaunti (tavsiya)

```bash
sovereign login
```

Brauzer ochiladi, SOVEREIGN hisobingizda **Ruxsat berish** bosasiz — CLI hisobingizga ulanadi. Hech qanday API kalit kerak emas, tarifingiz (Free/Pro/...) amal qiladi.

Lokal serverga (test): `sovereign login --local`

### 2. O'z OpenRouter kalitingiz

```bash
sovereign key sk-or-v1-...
```

Kalit https://openrouter.ai/keys dan olinadi. Yoki shell'da `OPENROUTER_API_KEY`.

## Foydalanish

```bash
sovereign                             # interaktiv rejim (chat + agent)
sovereign "React todo app yarat"      # bitta topshiriq
sovereign "..." -f rasm.png -f a.pdf  # fayllarni biriktirib yuborish
sovereign --yes "..."                 # amallarni avtomatik tasdiqlash
sovereign whoami                      # holat
sovereign logout                      # chiqish
sovereign help                        # yordam
```

Interaktiv rejimda: `/model`, `/cwd <yo'l>`, `/attach <fayl>`, `/detach`, `/clear`, `/exit`.

## Fayl biriktirish

Rasm (`.png .jpg .webp .gif`), PDF, va matn (`.md .json .ts .py ...`) fayllarni biriktirib yuborsangiz bo'ladi:

```bash
sovereign "bu diagrammaga qarab kod yoz" -f diagram.png
sovereign "bu PDFdan asosiy g'oyalarni chiqar" -f paper.pdf
```

Interaktiv rejimda:

```
› /attach ./mockup.png
› Shu dizaynga qarab HTML yoz
```

Cheklovlar: rasm 8 MB, matn 2 MB, PDF 20 MB. PDF matnini ajratish uchun `npm i -g pdf-parse` o'rnating (ixtiyoriy).

## Xavfsizlik

- Fayl amallari **faqat `sovereign` ishga tushgan papka ichida** bo'ladi.
- Fayl/papka/buyruqdan oldin **tasdiq so'raydi** (`--yes` bilan o'chiriladi).
- Token va kalitlar faqat kompyuteringizda (`~/.sovereign/config.json`).

## Sozlash manzili

`SOVEREIGN_URL` — server manzili (default `https://sovhq.vercel.app`).
`SOVEREIGN_TOKEN` — akkaunt tokeni (env orqali).
