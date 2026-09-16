# SOVEREIGN CLI

Terminaldagi AI koding agenti. `sovereign` deb yozing — AI ochiladi, ish papkangizda **fayl va papka yarata, o'qiy va o'zgartira** oladi, kod yozadi.

## O'rnatish

Node.js 20+ kerak.

```bash
npm install -g sovereign-cli
```

> Loyiha ichidan (publish qilinmagan bo'lsa): `npm run cli:install`
> O'chirish: `npm uninstall -g sovereign-cli`

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
sovereign                       # interaktiv rejim (chat + agent)
sovereign "React todo app yarat"   # bitta topshiriq
sovereign --yes "..."           # amallarni avtomatik tasdiqlash
sovereign whoami                # holat
sovereign logout                # chiqish
sovereign help                  # yordam
```

Interaktiv rejimda: `/model`, `/cwd <yo'l>`, `/clear`, `/exit`.

## Xavfsizlik

- Fayl amallari **faqat `sovereign` ishga tushgan papka ichida** bo'ladi.
- Fayl/papka/buyruqdan oldin **tasdiq so'raydi** (`--yes` bilan o'chiriladi).
- Token va kalitlar faqat kompyuteringizda (`~/.sovereign/config.json`).

## Sozlash manzili

`SOVEREIGN_URL` — server manzili (default `https://sovereign.ai`).
`SOVEREIGN_TOKEN` — akkaunt tokeni (env orqali).
