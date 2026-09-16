# SOVEREIGN CLI

Terminaldagi AI koding agenti. `sovereign` deb yozing — AI ochiladi, ish papkangizda **fayl va papka yarata, o'qiy va o'zgartira** oladi, kod yozadi.

## O'rnatish

Node.js 20+ kerak. Loyiha ildizidan:

```bash
npm run cli:install
```

yoki qo'lda:

```bash
cd cli
npm install -g .
```

Bu `sovereign` (va qisqa `sov`) buyrug'ini butun tizimga o'rnatadi.

> O'chirish: `npm uninstall -g sovereign-cli`

## Sozlash (API kalit)

Eng oson yo'l — kalitni bir buyruqda saqlash:

```bash
sovereign key sk-or-v1-...
```

Yoki interaktiv sozlash:

```bash
sovereign config
```

Birinchi ishga tushirishda ham kalit so'raydi va `~/.sovereign/config.json` ga saqlaydi.

Muqobil: shell'da `OPENROUTER_API_KEY` o'rnating — avtomatik ishlaydi. Kalitni https://openrouter.ai/keys dan oling.

## Foydalanish

```bash
sovereign                       # interaktiv rejim (chat + agent)
sovereign "React todo app yarat"   # bitta topshiriq va chiqish
sovereign --yes "..."           # barcha amallarni avtomatik tasdiqlash
sovereign config                # kalit / model
sovereign help                  # yordam
```

Interaktiv rejimda:

| Buyruq | Ish |
|---|---|
| `/model <id>` | modelni almashtirish (masalan `openai/gpt-4o`) |
| `/cwd <yo'l>` | ish papkasini o'zgartirish |
| `/clear` | suhbatni tozalash |
| `/exit` | chiqish |

## Xavfsizlik

- Barcha fayl amallari **faqat `sovereign` ishga tushgan papka ichida** bo'ladi (tashqariga chiqolmaydi).
- Fayl yozish, papka yaratish va buyruq bajarishdan oldin **tasdiq so'raydi** (`--yes` bilan o'chiriladi).
- Kalitlar faqat sizning kompyuteringizda (`~/.sovereign/config.json`).

## Model

Default: `openai/gpt-4o-mini` (arzon, tool-calling'ni qo'llab-quvvatlaydi). `/model` yoki `sovereign config` orqali o'zgartiring. Vositalar (fayl yaratish) uchun model tool-calling'ni qo'llab-quvvatlashi shart — ba'zi tekin modellar buni qila olmaydi.
