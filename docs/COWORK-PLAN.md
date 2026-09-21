# SOVEREIGN Cowork — reja (boshlanish)

> Maqsad: "chat" emas, **hamkor (coworker)** — AI sizning loyihangiz/fayllaringiz ustida
> ishlaydi: o'qiydi, yozadi, ishga tushiradi, test qiladi, natijani ko'rsatadi.
> Web ilova + CLI + connectorlarni bitta ish maydoniga bog'laydi.

Bu reja **sekin, bosqichma-bosqich**. Har bosqich alohida yetkaziladi.

---

## Hozir nima bor (poydevor)
- **Web Cowork** — lokal papkani ulash, `@fayl` bilan tanlash (faqat o'qish/biriktirish).
- **CLI** — haqiqiy fayl yaratish/o'qish/o'zgartirish + buyruq ishga tushirish (agent tsikli, xavf tekshiruvi).
- **Tool-calling** — Gmail/Sheets/Slides/Figma/GitHub/MCP.
- **Agent rejimlari** — dasturchi/tadqiqotchi/biznes/yozuvchi.
- **Xotira** — web'da Memory Graph, CLI'da individual xotira.

Ya'ni bo'laklar bor; Cowork — ularni **bitta ish oqimiga** bog'lash.

---

## Nima yetishmaydi (Cowork uchun)
1. Web'da AI faylni faqat **o'qiydi**, **yoza olmaydi** (CLI'da yozadi, web'da yo'q).
2. Ish maydoni (workspace) tushunchasi yo'q — har suhbat mustaqil.
3. Ko'p qadamli vazifani **oxirigacha** (reja→kod→test→natija) yagona oqimda olib boradigan panel yo'q.
4. Web va CLI xotirasi/holati **bir-biriga bog'lanmagan**.

---

## Bosqichlar

### Bosqich 1 — Workspace modeli (poydevor)
- Tushuncha: **Workspace** = papka + fayllar holati + suhbat + rejadagi qadamlar.
- Web'da: ochilgan Cowork papkasini "workspace" sifatida saqlash (nomi, fayllar ro'yxati, oxirgi holat).
- Har workspace uchun alohida suhbat/xotira.
- *Natija:* foydalanuvchi papkani ochib, u bilan uzluksiz ishlaydi.

### Bosqich 2 — Web'da fayl yozish (File System Access API) — ✅ POYDEVOR TAYYOR
- `showDirectoryPicker` handle'i saqlanadi; `ensureWritePermission` readwrite so'raydi.
- AI `sovereign-write` blokida faylni beradi → klient `WriteFileCard` bilan ko'rsatadi
  (yangi/o'zgartirish, qator soni, **Qo'llash** tugmasi). `writeFileToFolder` saqlaydi.
- Chromiumsiz brauzerda (Safari/Firefox) — "Yuklab olish" zaxira.
- *Qoldi:* to'liq qator-ma-qator diff ko'rinishi; oqim tugaguncha Qo'llashni bloklash.

### Bosqich 3 — Cowork paneli (vazifa oqimi)
- Yon panel: **Reja → Qadamlar → Fayllar → Natija**.
- Foydalanuvchi vazifa beradi → agent reja tuzadi → har qadamni bajaradi (o'qish/yozish/tool) → panelda jonli ko'rsatadi.
- Har qadam yonida "ko'rish/qaytarish" (fayl diff, tool natijasi).
- *Natija:* "vazifa ber, agent bajaradi" — ChatGPT/Gemini emas, **coworker**.

### Bosqich 4 — CLI ↔ Web ko'prigi
- CLI workspace holatini serverga sync qiladi (allaqachon `sync.mjs` bor).
- Web'dan boshlangan vazifani CLI davom ettiradi va aksincha.
- Umumiy individual xotira (bir akkaunt — bir xotira).
- *Natija:* brauzer va terminal bitta ish maydonini bo'lishadi.

### Bosqich 5 — Ko'p agent (multi-agent)
- Bitta vazifada bir nechta agent: research → kod → test (parallel/ketma-ket).
- CLI'da `swarm` bor — shuni Cowork oqimiga bog'lash.
- *Natija:* murakkab vazifa bir necha ixtisoslashgan agent bilan tezroq bajariladi.

---

## Cross-platform (Mac · Linux · Windows)

Alohida OS kodi kerak EMAS — ikki muhit ham platformadan mustaqil:

| Yo'l | Texnologiya | Qamrov |
|---|---|---|
| **Web Cowork** | File System Access API (brauzer OS'ni abstract qiladi) | Chrome/Edge — Windows, macOS, Linux, ChromeOS |
| **Web zaxira** | `<input webkitdirectory>` (o'qish) + "Yuklab olish" (yozish) | Safari, Firefox — hamma OS |
| **CLI** | Node.js `fs` + `node:path` (POSIX/Win yo'llar avtomatik) | Windows, macOS, Linux |

- Yo'llar doim `/` bilan (POSIX uslub); `node:path` Windows'da `\` ga o'giradi.
- Sandbox: web'da brauzer ruxsati papka ichida qoladi; CLI'da `resolvePath` tekshiradi.
- Kelajakda desktop kerak bo'lsa — Tauri/Electron o'rami (o'sha kod bazasi).

## Xavfsizlik qoidalari (har bosqichda)
- Fayl yozish/buyruq **doim tasdiq** bilan (yoki "auto" rejim aniq yoqilganda).
- Ruxsat papka ichida qoladi (sandbox), tashqariga chiqmaydi.
- Diff ko'rsatilmasdan hech narsa qayta yozilmaydi.
- Maxfiy ma'lumot (Blind Prompting) agent oqimida ham maskalanadi.

---

## Birinchi qadam (keyingi ish)
**Bosqich 1 + 2 ni** boshlash: web Cowork'ga workspace holati va File System Access API orqali
**yozish** (diff + tasdiq). Shu ikkisi Cowork'ni "o'qish"dan "ishlash"ga o'tkazadi.

Tasdiqlasangiz, shu ikki bosqichni kod bilan boshlayman.
