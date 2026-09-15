# SOVEREIGN AI

> Your AI. Your Truth. Your Data. Forever.

Maxfiylik-birinchi AI platforma: barcha yirik modellar bitta interfeysda, shifrlangan xotira, tekshirilgan javoblar.

## Hujjatlar

- [docs/DESIGN.md](docs/DESIGN.md) — UI/UX spetsifikatsiya
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — texnik arxitektura
- [docs/SETUP.md](docs/SETUP.md) — lokal sozlash (Supabase, OAuth)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Motion · three.js (R3F) · Supabase (Auth + Postgres) · Zustand · React Hook Form + Zod

## Ishga tushirish

```bash
cp .env.example .env.local   # Supabase kalitlarini kiriting
npm install
npm run dev
```

## Bosqichlar

| Bosqich | Qamrov | Holat |
|---|---|---|
| 1 | Landing, Auth (email / Google / GitHub), Onboarding, dizayn tizimi, 3D/motion | ✅ |
| 2 | Chat dashboard, model switcher, 7 model temasi, OpenRouter streaming | ⏳ |
| 3 | Perplexity Research, Blind Prompting SDK, Memory Graph, Verification | ⏳ |
| 4 | Sozlamalar, Knowledge Base, billing, light mode, mobil polish | ⏳ |

© 2026 FayzInc
