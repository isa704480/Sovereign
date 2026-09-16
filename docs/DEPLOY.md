# SOVEREIGN — Vercel'ga deploy

Bu qo'llanma **birinchi marta** deploy qilish uchun. Keyingi safar `git push` bilan avtomatik yangilanadi.

## 1. Kod GitHub'da bo'lishi kerak

```bash
# GitHub'da yangi bo'sh repo yarating (masalan: sovereign-ai)
# Keyin loyihada:
git remote add origin https://github.com/<siz>/sovereign-ai.git
git branch -M main
git push -u origin main
```

## 2. Vercel loyihasini yaratish

1. https://vercel.com/new — GitHub bilan kiring
2. **Import Git Repository** → yaratgan repongizni tanlang
3. **Framework Preset**: Next.js (o'z-o'zidan aniqlanadi)
4. **Root Directory**: `./` (asosiy papka)
5. **Environment Variables** bo'limiga quyidagilarni qo'ying (`.env.local` dan)

### Serverga qo'yiladigan environment kalitlari

| Kalit | Manba | Izoh |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | ochiq |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | ochiq |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | **maxfiy** |
| `NEXT_PUBLIC_SITE_URL` | `https://<siz>.vercel.app` (yoki domeningiz) | keyin domenni ulasangiz o'zgartiring |
| `OPENROUTER_API_KEY` | openrouter.ai/keys | **maxfiy** |
| `PERPLEXITY_API_KEY` | perplexity.ai/settings/api | **maxfiy** |
| `OPENAI_API_KEY` | platform.openai.com | audio transkripsiya uchun (ixtiyoriy) |
| `ZENOBANK_API_KEY` | dashboard.zenobank.io | to'lov uchun |
| `ZENOBANK_WEBHOOK_SECRET` | ZenoBank webhook sozlamalari | **maxfiy** |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console | Google login uchun |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Console | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Console | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Console | |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud → OAuth 2.0 Client | |
| `ALLOW_PLAN_SWITCH` | `false` prodaksiyada | test uchun `true` qilib qo'ying |

> **Muhim**: `DATABASE_URL` faqat migratsiyalar uchun kerak (lokal `npm run db:migrate`) — Vercel'ga qo'shish shart emas.

6. **Deploy** tugmasini bosing. Birinchi build 2-3 daqiqa oladi.

## 3. Supabase'ni yangi URL bilan bog'lang

Deploy tugagach `https://<siz>.vercel.app` yoki `https://<domen>` manzilingiz bo'ladi.

### Auth → URL Configuration

- **Site URL**: `https://<sizning-domen>`
- **Redirect URLs** (qo'shing):
  - `https://<sizning-domen>/auth/callback`
  - `http://localhost:3000/auth/callback` (dev uchun)

### Google Cloud → OAuth Client

Authorized redirect URIs ro'yxatiga qo'shing:
- `https://<supabase-project>.supabase.co/auth/v1/callback`

### Firebase → Authentication → Settings → Authorized domains

Qo'shing:
- `<sizning-domen>` (masalan `sovereign.vercel.app`)

## 4. ZenoBank webhook

Dashboard → Webhooks:
- URL: `https://<sizning-domen>/api/webhooks/zenobank`
- Events: `checkout.completed`
- Signing secret'ni oling → `ZENOBANK_WEBHOOK_SECRET` sifatida Vercel'ga qo'ying → Redeploy

## 5. CLI serverga ishora qilsin

CLI foydalanuvchilariga:

```bash
export SOVEREIGN_URL=https://<sizning-domen>
sovereign login
```

Yoki `~/.sovereign/config.json` da `baseUrl` ni yangilash.

## 6. Yangi versiya deploy qilish

```bash
git add .
git commit -m "..."
git push
```

Vercel avtomatik build va deploy qiladi (Preview PR + Production main).

## Debug

- Build xatosi → Vercel dashboard → Deployments → **View Function Logs**
- Runtime xatosi → **Logs** tab
- Env yetishmasa → sahifada `NEXT_PUBLIC_SUPABASE_URL kerak` xatolari chiqadi
