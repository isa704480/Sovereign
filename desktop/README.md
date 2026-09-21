# SOVEREIGN Cowork (desktop)

Ish stolidagi AI koding hamkori — Claude Code uslubida, lekin GUI. Mavjud
`cli/src` agentini (tools, xavfsizlik sandbox, xotira) qayta ishlatadi.

## Ishga tushirish (dev)

```bash
cd desktop
npm install
npm start
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
| Main (Node) | `main.mjs` | Agent tsikli, /api/cli/chat, `runTool`, IPC |
| Ko'prik | `preload.cjs` | `window.sovereign` xavfsiz API (contextIsolation) |
| UI | `renderer/` | Chat, tool kartalari, tasdiq dialogi (vanilla, build shart emas) |

Agent yadrosi `../cli/src` dan olinadi — CLI va desktop bir xil xatti-harakat.

## Keyingi (yo'l xaritasi)
- Fayl daraxti (sidebar) + tanlab ochish.
- Qator-ma-qator diff ko'rinishi.
- Ichki terminal paneli (run_command chiqishini jonli).
- Model tanlagich (OmniRoute oilalar) + /vibe tugmasi.
- Avtomatik yangilanish (electron-updater).
