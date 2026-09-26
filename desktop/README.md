# SOVEREIGN Cowork (desktop)

Ish stolidagi AI koding hamkori — **React + Vite + Electron**. Mavjud `cli/src`
agentini (vositalar, xavfsizlik sandbox, xotira, "Aslida nima bo'ldi" jurnali)
qayta ishlatadi. Dizayn va arxitektura: [DESIGN.md](DESIGN.md).

## Imkoniyatlar

- Birinchi ishga tushirish: til (o'zbek lotin/kirill, rus, ingliz) → brauzer orqali kirish → ish papkasi → xavfsizlik modeli
- Chat / Kod rejimlari, vosita qadamlari holati bilan (bajarildi / xato / rad etildi / takror / to'xtatildi)
- "Aslida nima bo'ldi" jurnal kartasi — modelning da'vosi emas, haqiqiy natijalar
- Tasdiq oynasi: diff, xavfli buyruq ogohlantirishi, fokus "Bekor qilish"da, Enter avtomatik tasdiqlamaydi
- O'ng panel: o'zgarishlar (diff + Undo / hammasini bekor qilish) va terminal chiqishi
- Vazifalar tarixi (mahalliy, davom ettirish mumkin), fayl daraxti qidiruv bilan
- Ctrl+K buyruqlar palitrasi, Ctrl+/ yorliqlar, sozlamalar (mavzu tizim/qorong'i/yorug', til, model, papka, akkaunt, maxfiylik, yangilanishlar)
- Oyna o'lchami/joyi eslab qolinadi, bitta nusxa, fonda tugaganda bildirishnoma

## Ishga tushirish

```bash
cd desktop
npm install          # bir marta
npm start            # vite build + electron
npm run start:offline  # SOV_OFFLINE=1 — tarmoq faqat localhost (demo/test)
npm run dev          # vite HMR + electron
```

Faqat UI'ni brauzerda ko'rish (Electron'siz, soxta ko'prik bilan):
`npx vite --port 5174` → `http://localhost:5174/?fresh=1` (onboarding), `?anon=1`, `?nofolder=1`, `?panel=1`.

Auth CLI bilan **bir xil** (`~/.sovereign/config.json`): ilovadan "Brauzer orqali kirish"
yoki terminalda `sovereign login`.

## Windows o'rnatuvchi (.exe)

```bash
npm run icons        # build/icon.ico + icon.png (public/logo.svg geometriyasidan; sharp repo ildizidan)
npm run dist:win     # release/SOVEREIGN-Cowork-Setup-<versiya>.exe
```

- Joriy foydalanuvchi uchun o'rnatiladi (administrator kerak emas), Desktop va Start menyu yorliqlari.
- Agar build `EXDEV: cross-device link not permitted` bilan yiqilsa (TEMP va kesh turli disklarda):
  `ELECTRON_BUILDER_CACHE` ni TEMP bilan bir diskdagi papkaga yo'naltiring.
- **Imzo yo'q:** Windows SmartScreen "Windows protected your PC" deydi → *More info* → *Run anyway*.
  Sertifikat olingach `CSC_LINK` / `CSC_KEY_PASSWORD` (CI secret) qo'shing — ogohlantirish yo'qoladi.

## Reliz va avtomatik yangilanish

1. `desktop/package.json` → `version` ni oshiring (mas. `0.5.1`).
2. `git tag desktop-v0.5.1 && git push origin desktop-v0.5.1`
3. `.github/workflows/desktop-release.yml` Windows'da o'rnatuvchini yig'adi va GitHub Release'ga
   `.exe`, `.blockmap`, `latest.yml` ni yuklaydi.

Ilova ichidagi `electron-updater` shu repo'ning **eng so'nggi (latest) relizini** o'qiydi:
reliz desktop bo'lishi, repo ochiq (public) bo'lishi kerak — aks holda tekshiruv jim
"reliz yo'q" deb tugaydi (ilova qulamaydi). Yuklab olish faqat foydalanuvchi bosganda,
o'rnatish qayta ishga tushirishda. Offline rejimda va `npm start` da o'chiq.

## Smoke test (production'ga ulanmasdan)

```bash
SOV_OFFLINE=1 SOV_USER_DATA=<temp> SOV_SMOKE_SHOT=<temp>/shot.png SOV_SMOKE_QUIT=1 \
  "release/win-unpacked/SOVEREIGN Cowork.exe"
```

`shot.png` (oyna rasmi) va `shot.png.txt` (ko'rinadigan matn) yoziladi. `SOVEREIGN_URL=http://127.0.0.1:<port>`
bilan mahalliy mock serverga ulab agent oqimini ham tekshirish mumkin (offline rejim localhost'ga ruxsat beradi).

## Arxitektura (qisqa)

| Qatlam | Fayl | Vazifa |
|---|---|---|
| Main | `main.mjs`, `electron/*.mjs` | agent tsikli, IPC, sozlamalar, tarix, kirish, updater, offline guard |
| Ko'prik | `preload.cjs` | `window.sovereign` — tor, tekshirilgan IPC (contextIsolation + sandbox) |
| UI | `ui/src/` | React: App, Onboarding, Sidebar, Conversation, RightPanel, ConfirmDialog, Settings, CommandPalette |

Agent yadrosi `../cli/src` dan olinadi (o'rnatilgan ilovada `resources/cli/src`) — CLI va desktop bir xil xatti-harakat.
