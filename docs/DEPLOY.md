# Vercel'ga deploy

## 1. Repo'ni ulash

GitHub'ga push qiling → https://vercel.com/new → repo'ni tanlang. Framework: **Next.js** (avtomatik aniqlanadi).

## 2. Environment Variables (Vercel → Project → Settings → Environment Variables)

| Nomi | Qiymat |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://provrwznkeptfotvfgoa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `NEXT_PUBLIC_SITE_URL` | `https://<sizning-domen>.vercel.app` (yoki custom domen) |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` |
| `PERPLEXITY_API_KEY` | `pplx-...` |

`DATABASE_URL` Vercel'ga kerak emas (faqat lokal migratsiya uchun).

## 3. Supabase URL sozlamalari (deploy'dan keyin)

**Authentication → URL Configuration**

- Site URL: `https://<domen>`
- Redirect URLs: `https://<domen>/auth/callback` (lokalni ham qoldiring: `http://localhost:3000/auth/callback`)

## 4. Google / GitHub OAuth (deploy'dan keyin)

- **Google Cloud Console** → Credentials → OAuth client (Web) → Authorized redirect URI:
  `https://provrwznkeptfotvfgoa.supabase.co/auth/v1/callback`
- **GitHub** → Settings → Developer settings → OAuth Apps → Authorization callback URL:
  `https://provrwznkeptfotvfgoa.supabase.co/auth/v1/callback`
- Client ID / Secret'larni Supabase → Authentication → Providers ga kiriting va provider'ni yoqing.

## 5. Tekshirish

- `https://<domen>/` landing ochiladi
- `/register` → email bilan hisob → `/onboarding` → `/app`
- `/app` da real javob keladi (OpenRouter), Research rejimida manbalar ko'rinadi
