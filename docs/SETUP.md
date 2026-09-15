# SOVEREIGN AI — Lokal sozlash (Phase 1)

## 1. Supabase loyiha

1. https://supabase.com/dashboard → **New project** (region: eng yaqini, masalan Frankfurt).
2. **Project Settings → API** dan oling:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Loyiha ildizida `.env.example` ni `.env.local` ga nusxalang va qiymatlarni kiriting.

## 2. Ma'lumotlar bazasi

**SQL Editor** → yangi so'rov → `supabase/migrations/0001_profiles.sql` faylini to'liq joylashtiring → **Run**.

Bu `profiles` jadvalini, RLS siyosatlarini va `auth.users` ga trigger'ni yaratadi (har yangi foydalanuvchi uchun profil avtomatik ochiladi).

## 3. Auth sozlamalari

**Authentication → URL Configuration**

| Maydon | Qiymat (dev) |
|---|---|
| Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/auth/callback` |

Production'da domeningizni ham qo'shing: `https://your-domain.com/auth/callback`.

**Authentication → Providers**

- **Email**: yoqilgan. **Muhim:** *Confirm email* ni **o'chiring** (Authentication → Providers → Email → "Confirm email" off). Shunda sign up qilingan zahoti sessiya ochiladi va foydalanuvchi to'g'ridan-to'g'ri onboarding'ga tushadi. Yoqilgan holda avval pochtadagi havolani bosish kerak bo'ladi.
- Mavjud email bilan sign up qilinsa, tizim o'sha parol bilan avtomatik login qiladi; parol mos kelmasa xato ko'rsatadi.
- **Google**:
  1. https://console.cloud.google.com → APIs & Services → Credentials → *OAuth client ID* (Web application).
  2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase provider sahifasida ko'rsatiladi).
  3. Client ID / Secret ni Supabase'ga kiriting.
- **GitHub**:
  1. https://github.com/settings/developers → *New OAuth App*.
  2. Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
  3. Client ID / Secret ni Supabase'ga kiriting.

## 4. Ishga tushirish

```bash
npm install
npm run dev
```

http://localhost:3000 — landing. `/register` → onboarding → `/app`.

## Dizayn preview (Supabase'siz)

`http://localhost:3000/dev/onboarding` — faqat `development` rejimida ochiladi, sessiya talab qilmaydi, javoblar saqlanmaydi. Onboarding UI'ni tez ko'rib chiqish uchun.

## 5. Tekshiruv ro'yxati

- [ ] `/register` da email bilan hisob yaratildi, `profiles` jadvalida qator paydo bo'ldi
- [ ] Google / GitHub tugmalari Supabase OAuth sahifasiga olib boradi va qaytadi
- [ ] Onboarding 5 qadamdan o'tdi, `profiles.onboarding` JSON to'ldi, `onboarding_completed = true`
- [ ] Login qilmasdan `/app` → `/login` ga yo'naltiradi
- [ ] Login qilgan holda `/login` → `/app` ga yo'naltiradi

## Muammolar

- **"provider is not enabled"** — Supabase'da provider yoqilmagan.
- **OAuth qaytganda `/login?error=...`** — Redirect URL ro'yxatiga `/auth/callback` qo'shilmagan yoki `NEXT_PUBLIC_SITE_URL` noto'g'ri.
- **Profil topilmadi** — migration ishga tushirilmagan (trigger yo'q). SQL'ni qayta ishga tushiring, mavjud foydalanuvchilar uchun qo'lda `insert into profiles (id, email) select id, email from auth.users on conflict do nothing;`.
