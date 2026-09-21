# SOVEREIGN Cowork (desktop)

Ish stolidagi AI koding hamkori — Claude Code uslubida, GUI. **React + Vite +
Electron**. Mavjud `cli/src` agentini (tools, xavfsizlik sandbox, xotira) qayta
ishlatadi. Fayl daraxti, qator-ma-qator diff, tasdiq dialogi.

## Ishga tushirish

```bash
cd desktop
npm install       # React/Vite/Electron (bir marta)
npm start         # vite build + electron
```

Yoki HMR bilan (tez ishlab chiqish):

```bash
npm run dev       # vite dev server + electron (jonli qayta yuklash)
```

- Auth CLI bilan **bir xil** (`~/.sovereign/config.json`). Kirmagan bo'lsangiz,
  avval terminalda `sovereign login` qiling — ilova o'sha token bilan ishlaydi.
- Ilova ochilgach: **📁 papka tanlang** → loyiha papkasini ulang → vazifa yozing.
- AI fayl yozsa/buyruq ishga tushirsa — **tasdiq dialogi** chiqadi (sandbox: ish
  papkasidan tashqari yoki xavfli buyruq uchun majburiy).

## Paketlash (Win / Mac / Linux)

```bash
npm run dist          # joriy OS uchun
npm run dist:win      # Windows (NSIS o'rnatuvchi)
npm run dist:mac      # macOS (dmg)
npm run dist:linux    # Linux (AppImage)
```

Natija `desktop/release/` ichida.

## Arxitektura

| Qatlam | Fayl | Vazifa |
|---|---|---|
| Main (Node) | `main.mjs` | Agent tsikli, /api/cli/chat, `runTool`, IPC, `fs:tree`/`fs:read` |
| Ko'prik | `preload.cjs` | `window.sovereign` xavfsiz API (contextIsolation) |
| UI (React) | `ui/src/` | App, FileTree, DiffView, ConfirmDialog — Vite build → `ui-dist/` |

Agent yadrosi `../cli/src` dan olinadi — CLI va desktop bir xil xatti-harakat.

## Bor
- ✅ Chat + oqim, tool kartalari, ko'p agent (server orqali)
- ✅ Fayl daraxti (yig'iladigan) + fayl ko'ruvchi
- ✅ Qator-ma-qator diff (tasdiq dialogida)
- ✅ Vibe rejim, umumiy xotira, CLI bilan bir xil auth

## Keyingi (yo'l xaritasi)
- Ichki terminal paneli (run_command chiqishini jonli)
- Model tanlagich (OmniRoute oilalar)
- Tahrirlangan fayllar xulosasi ("N fayl o'zgardi") + Undo
- Avtomatik yangilanish (electron-updater)
