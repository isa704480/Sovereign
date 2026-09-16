# Deploy: Vercel (vebsayt) + npm (CLI)

Ikki narsa alohida chiqariladi: **vebsayt** Vercel'ga, **CLI** npm'ga.

---

## A. Vebsaytni Vercel'ga qo'yish

### 1. GitHub'ga push

```bash
git remote add origin https://github.com/<siz>/sovereign.git
git push -u origin main
```

### 2. Vercel'ga ulash

https://vercel.com/new → repo'ni import → Framework: **Next.js** (avtomatik).

### 3. Environment Variables (Vercel → Settings → Environment Variables)

| Nomi | Qiymat |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://provrwznkeptfotvfgoa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `NEXT_PUBLIC_SITE_URL` | `https://<domen>.vercel.app` |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` |
| `PERPLEXITY_API_KEY` | `pplx-...` |

`DATABASE_URL` Vercel'ga kerak emas (faqat lokal migratsiya uchun).

### 4. Supabase URL sozlamalari

Authentication → URL Configuration:
- Site URL: `https://<domen>`
- Redirect URLs: `https://<domen>/auth/callback` (+ lokalni qoldiring)

### 5. Google / GitHub OAuth

- Google Cloud Console → Credentials → OAuth client (Web) → redirect URI:
  `https://provrwznkeptfotvfgoa.supabase.co/auth/v1/callback`
- GitHub → Developer settings → OAuth Apps → callback:
  `https://provrwznkeptfotvfgoa.supabase.co/auth/v1/callback`
- Client ID/Secret'ni Supabase → Auth → Providers ga kiriting, provider'ni yoqing.

---

## B. CLI'ni npm'ga chiqarish

### 1. npm hisobi

https://www.npmjs.com da bepul ro'yxatdan o'ting, so'ng:

```bash
npm login
```

### 2. Publish

```bash
cd cli
npm publish
```

> Nom band bo'lsa `cli/package.json` dagi `name` ni o'zgartiring (masalan `@fayzinc/sovereign-cli` — bunda `npm publish --access public`).

### 3. Endi har kim o'rnatadi

```bash
npm install -g sovereign-cli
sovereign login
```

`sovereign login` brauzerni ochadi → foydalanuvchi SOVEREIGN hisobiga kiradi → **Ruxsat berish** → CLI ulanadi. Server manzili default `https://sovereign.ai`; boshqa domen bo'lsa CLI kodidagi `baseUrl` (`cli/src/config.mjs`) ni yoki `SOVEREIGN_URL` ni sozlang.

> **Muhim:** deploy'dan keyin `cli/src/config.mjs` dagi default `baseUrl` ni haqiqiy Vercel domeningizga o'zgartiring, so'ng CLI'ni qayta publish qiling (`version` ni oshiring).

### Yangi versiya chiqarish

```bash
cd cli
npm version patch    # 0.1.0 → 0.1.1
npm publish
```

Foydalanuvchilar: `npm update -g sovereign-cli`.
