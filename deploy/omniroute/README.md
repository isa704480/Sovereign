# OmniRoute'ni Fly.io'ga qo'yish

OmniRoute — bitta manzil orqasida 350+ provayderni (150+ tekin) birlashtiruvchi
shlyuz. SOVEREIGN uni **zaxira** sifatida ishlatadi: asosiy provayderlar
ishlamay qolsa, so'rov shu yerga tushadi.

Bu papkadagi `fly.toml` tayyor — faqat quyidagi qadamlarni bajaring.

---

## 1. flyctl o'rnatish (Windows PowerShell)

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Terminalni qaytadan oching, keyin:

```bash
fly auth login
```

## 2. Ilovani yaratish

```bash
cd D:\My_apps\Sovereign\deploy\omniroute
fly launch --copy-config --no-deploy
```

Savollarga javob:

| Savol | Javob |
|---|---|
| App name | `sovereign-omniroute` (band bo'lsa boshqa nom — keyin 4-qadamga qarang) |
| Region | `fra` (Frankfurt — O'zbekistonga eng yaqin tez region) |
| Postgres / Redis kerakmi | **Yo'q** |
| Deploy now | **Yo'q** |

## 3. Sirlarni yaratish va o'rnatish

Har bir qiymat tasodifiy bo'lishi shart. Nusxa olib, bittalab bajaring:

```bash
fly secrets set JWT_SECRET=$(openssl rand -base64 48)
fly secrets set API_KEY_SECRET=$(openssl rand -hex 32)
fly secrets set STORAGE_ENCRYPTION_KEY=$(openssl rand -hex 32)
fly secrets set OMNIROUTE_WS_BRIDGE_SECRET=$(openssl rand -hex 32)
fly secrets set INITIAL_PASSWORD='<kuchli-parol-yozing>'
```

Windows'da `openssl` bo'lmasa, PowerShell'da:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

va chiqqan qiymatni qo'lda qo'ying:

```bash
fly secrets set API_KEY_SECRET=chiqqan_qiymat
```

> `INITIAL_PASSWORD` — dashboard'ga birinchi kirish paroli. `CHANGEME` qoldirmang.

## 4. Agar app nomi boshqa bo'lsa

`fly.toml` ichida ikki joyni tahrirlang:

```toml
app = "sizning-nom"
NEXT_PUBLIC_BASE_URL = "https://sizning-nom.fly.dev"
```

## 5. Deploy

```bash
fly deploy
fly open
```

Brauzerda dashboard ochiladi. Kiring (parol — `INITIAL_PASSWORD`).

## 6. API kalit yaratish

Dashboard → **Endpoints** → **Create API key**. Kalitni nusxa oling
(`ci_live_...` ko'rinishida).

> Chatda yoki boshqa joyda ochilgan kalitni darhol o'chirib, yangisini yarating.

## 7. SOVEREIGN'ga ulash

Vercel → Settings → Environment Variables (Secret, Production + Preview):

```
OMNIROUTE_BASE_URL = https://sovereign-omniroute.fly.dev/v1
OMNIROUTE_API_KEY  = ci_live_...
OMNIROUTE_MODEL    = auto
```

Keyin **Redeploy**. Shundan so'ng zaxira tartibi:
Experiential → **OmniRoute** → boshqa shlyuz → LLM7.

## 8. Tekshirish

```bash
curl https://sovereign-omniroute.fly.dev/v1/models -H "Authorization: Bearer ci_live_..."
```

Modellar ro'yxati kelsa — tayyor.

---

## Bilib qo'ying

- **Pul.** Fly.io endi bepul tarif bermaydi: karta biriktirish so'raladi. Bu
  konfiguratsiya eng kichik mashinani ishlatadi va so'rov bo'lmasa uxlaydi,
  shuning uchun xarajat oyiga bir necha dollar atrofida bo'ladi.
- **Birinchi so'rov sekin.** Mashina uxlab qolgan bo'lsa, uyg'onishi 1–3 soniya
  oladi. Zaxira shlyuz uchun bu muammo emas.
- **`REQUIRE_API_KEY=true`** ataylab yoqilgan. Busiz `/v1` manzilingizni topgan
  har kim sizning provayder kvotangizdan foydalanadi.
- **Volume.** `omniroute_data` — SQLite bazasi va kalitlar shu yerda. O'chirsangiz
  sozlamalar yo'qoladi.

---

# Muqobil: Render'ga qo'yish

`deploy/omniroute/render.yaml` tayyor. Render Dashboard → **New** → **Blueprint** →
shu reponi tanlang → fayl yo'li `deploy/omniroute/render.yaml`.

Deploy paytida ikkita qiymat so'raladi:
- `INITIAL_PASSWORD` — dashboard'ga birinchi kirish paroli
- `NEXT_PUBLIC_BASE_URL` — deploy tugagach `https://<nom>.onrender.com`

Qolgan sirlarni Render o'zi tasodifiy yaratadi.

## Render vs Fly.io

| | Render (Standard) | Fly.io (shared-1x, 1GB) |
|---|---|---|
| Narx | $25/oy | ~$5–6/oy |
| RAM | 2 GB | 1 GB |
| Uxlash | yo'q (doim yoqiq) | so'rov bo'lmasa uxlaydi |
| Disk | $0.25/GB/oy | volume narxi shunga yaqin |

**Bepul tarif yaramaydi:** 512 MB RAM, **disk yo'q** (SQLite bazasi va API
kalitlaringiz har restartda o'chadi), 15 daqiqa jimlikdan keyin uxlaydi va
uyg'onishi ~1 daqiqa. Zaxira shlyuz uchun bu qabul qilib bo'lmas.

## Bepul tarifda sinab ko'rish

`deploy/omniroute/render-free.yaml` — bepul tarif uchun variant. Uxlab qolmasligi
uchun tashqi ping kerak (Vercel Hobby cron'i har daqiqa ishlay olmaydi):

1. [cron-job.org](https://cron-job.org) (bepul, 1 daqiqagacha) yoki
   [UptimeRobot](https://uptimerobot.com) (bepul, 5 daqiqa) da hisob oching.
2. Yangi job: `GET https://sovereign-omniroute.onrender.com/` — har 5 daqiqada.

Shunda 15 daqiqalik jimlik hech qachon bo'lmaydi va xizmat uxlamaydi.

**Lekin disk yo'qligi hal bo'lmaydi:** Render bepul xizmatni redeploy yoki
texnik ishlarda qayta ishga tushirsa, dashboard'da yaratgan API kalitlaringiz va
ulangan provayderlar o'chib ketadi — qaytadan sozlash kerak bo'ladi. Shu sababli
bepul tarif faqat "ishlaydimi-yo'qmi" sinovi uchun.
