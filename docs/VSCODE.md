# SOVEREIGN — VS Code kengaytmasi

> Papka: `vscode/`. Kengaytma VS Code, **Cursor**, **Windsurf**, **VSCodium** va
> **Google Antigravity** da ishlaydi — ularning hammasi VS Code kengaytmalarini yuklaydi.
>
> Tekshirilgan sana: 2026-09-27. Buyruqlar `@vscode/vsce` **3.9.2** va `ovsx` joriy
> versiyasiga mos. Quyidagi har bir bayroq (`--flag`) haqiqiy `--help` chiqishidan olingan.

---

## 1. Kengaytma nima qiladi

- **Yon paneldagi suhbat** (faoliyat paneli, WebView): joriy fayl yoki belgilangan kod
  haqida so'raysiz, javob oqim bilan keladi, har bir kod blokida **Copy** va
  **Apply to editor** tugmalari.
- **Muharrir buyruqlari**: *Explain selection* (`Ctrl+Alt+E`), *Fix this error*
  (`Ctrl+Alt+X` — kursor ostidagi diagnostikani oladi), *Write a test for this function*
  (`Ctrl+Alt+T`), *Ask about this file*, *Open chat* (`Ctrl+Alt+S`).
- **Kirish**: CLI bilan bir xil device-login (`/api/cli/start` → `/cli/connect` →
  `/api/cli/poll`), token — VS Code SecretStorage'da. Yoki mavjud
  `~/.sovereign/config.json` dan olinadi.
- **Holat paneli**: model va tarif; bosilsa — model tanlash, sozlamalar, kirish/chiqish.

**Ataylab yo'q**: avtonom fayl tahriri, terminal buyruqlari, To'liq avto. Bular CLI
(`sov`) va Cowork'da qoladi — kengaytmaning xavfsizlik yuzasi kichik bo'lishi uchun.

---

## 2. Ishga tushirish (Extension Development Host, F5)

```bash
cd vscode
npm install
npm run compile      # tsc --noEmit + esbuild → dist/extension.js
npm test             # node --test (93 ta test)
```

Keyin:

1. VS Code'da **`vscode/` papkasini** oching (repo ildizini emas — aks holda F5 boshqa
   konfiguratsiyani oladi).
2. **F5** bosing (yoki `Run and Debug` → `Run Extension`).
3. Yangi oyna ochiladi — bu **Extension Development Host**. Chap tomondagi faoliyat
   panelida SOVEREIGN belgisi paydo bo'ladi.
4. Kodni o'zgartirgach: `npm run watch` ni fonda qoldiring va Development Host oynasida
   **Ctrl+R** (qayta yuklash) bosing.

`vscode/.vscode/launch.json` shu uchun tayyor turibdi.

**Xatolarni ko'rish**: Development Host oynasida `Help → Toggle Developer Tools` →
`Console`. Webview'ning o'z konsoli: buyruqlar panelidan
`Developer: Open Webview Developer Tools`.

---

## 3. `.vsix` yig'ish va mahalliy o'rnatish

```bash
cd vscode
npm run package          # → vscode/sovereign.vsix
```

O'rnatish (har bir muharrirning o'z CLI'si):

```bash
code      --install-extension sovereign.vsix   # VS Code
cursor    --install-extension sovereign.vsix   # Cursor
windsurf  --install-extension sovereign.vsix   # Windsurf
codium    --install-extension sovereign.vsix   # VSCodium
```

Yoki qo'lda: **Extensions** ko'rinishi → yuqoridagi `…` menyusi →
**Install from VSIX…**.

O'chirish: `code --uninstall-extension sovereign.sovereign` (publisher o'zgarsa —
`<publisher>.sovereign`).

> `.vsix` ichiga nima kirishini `vscode/.vscodeignore` boshqaradi. Nima kirganini
> ko'rish: `npx vsce ls`.

---

## 4. VS Code Marketplace'ga chiqarish

### 4.1 Publisher yaratish

> **Diqqat**: eski qo'llanmalardagi `vsce create-publisher` buyrug'i **endi yo'q**
> (vsce 3.9.2 da bunday buyruq mavjud emas). Publisher faqat veb orqali yaratiladi.

1. <https://marketplace.visualstudio.com/manage> ga kiring (Microsoft hisobi bilan).
2. Chap panelda **Create publisher**.
3. **ID** (o'zgarmas, URL'da ko'rinadi, mas. `sovereign-ai`) va **Name** (ko'rinadigan
   nom, mas. `SOVEREIGN`) kiriting.
4. `vscode/package.json` dagi `"publisher": "sovereign"` **o'rin egasini** shu ID ga
   almashtiring. Kengaytma to'liq id'si `<publisher>.<name>` bo'ladi, ya'ni
   `sovereign-ai.sovereign`.

### 4.2 Azure DevOps tashkiloti va token

Marketplace Azure DevOps hisob-kitobiga tayanadi.

1. <https://dev.azure.com> da **bir xil Microsoft hisobi** bilan tashkilot (organisation)
   yarating — nomi ixtiyoriy, publisher ID bilan mos kelishi shart emas.
2. O'ng yuqoridagi foydalanuvchi belgisi → **Personal access tokens** → **New Token**.
3. **Organization**: `All accessible organizations` (bu majburiy — aks holda Marketplace
   tokenni qabul qilmaydi).
4. **Scopes**: `Show all scopes` havolasini bosing → **Marketplace** bo'limini toping →
   **Manage** ni belgilang.
5. Muddat (Expiration) tanlang va **Create**. Token **faqat bir marta** ko'rsatiladi —
   parol menejeriga saqlang. **Repozitoriyga hech qachon yozmang.**

> **2026 muhim eslatma**: Microsoft e'lon qilishicha, **2026-yil 1-dekabrdan** Azure
> DevOps'dagi global Personal Access Token'lar ishdan chiqariladi. O'rniga Microsoft
> Entra ID (workload identity federation / managed identity) keladi va `vsce` uni
> `--azure-credential` bayrog'i bilan qo'llaydi:
>
> ```bash
> vsce publish --azure-credential
> ```
>
> Ya'ni bugun olingan PAT vaqtinchalik yechim — CI'ni o'sha sanagacha Entra ID'ga
> ko'chirish kerak.

### 4.3 Kirish va nashr

```bash
cd vscode

# Tokenni bir marta saqlash (interaktiv — PAT so'raydi):
npx vsce login <publisher-id>

# Tekshirish: token shu publisher uchun nashr huquqiga egami?
npx vsce verify-pat <publisher-id>

# Nashr (package.json dagi joriy versiya bilan):
npx vsce publish
```

CI uchun (interaktivsiz) token muhit o'zgaruvchisi orqali beriladi:

```bash
VSCE_PAT=<token> npx vsce publish        # yoki: npx vsce publish -p <token>
```

Boshqa foydali bayroqlar (hammasi `vsce publish --help` dan):

| Bayroq | Nima qiladi |
|---|---|
| `-p, --pat <token>` | Tokenni to'g'ridan-to'g'ri beradi (standart: `VSCE_PAT`) |
| `--azure-credential` | PAT o'rniga Microsoft Entra ID |
| `-i, --packagePath <paths...>` | Tayyor `.vsix` ni nashr qiladi (qaytadan yig'maydi) |
| `--pre-release` | Oldindan chiqarish (pre-release) belgisi bilan |
| `--skip-duplicate` | Bu versiya allaqachon bo'lsa — xatosiz to'xtaydi (CI uchun) |
| `--no-git-tag-version` | Versiya oshirganda git teg/commit yaratmaydi |

Tayyor `.vsix` ni nashr qilish:

```bash
npm run package
npx vsce publish -i sovereign.vsix
```

Nashr 5–10 daqiqada indekslanadi va
`https://marketplace.visualstudio.com/items?itemName=<publisher>.sovereign` da ko'rinadi.

### 4.4 Verified publisher (ko'k belgi)

Majburiy emas. Talablari: Marketplace'da kamida **6 oy** turgan kengaytma **va**
ro'yxatdan o'tganiga kamida **6 oy** bo'lgan domen (domen egaligi DNS orqali
tasdiqlanadi). Ya'ni birinchi kundan olib bo'lmaydi — `soveregn.xyz` bilan keyinroq.

---

## 5. Open VSX'ga chiqarish (VSCodium, Windsurf, Antigravity)

VSCodium, Windsurf va Antigravity Microsoft Marketplace'dan foydalana olmaydi (litsenziya
cheklovi) — ular **Open VSX** (Eclipse Foundation) ro'yxatini ishlatadi. Shu bois
**ikkala joyga ham** nashr qilish kerak.

### 5.1 Bir martalik tayyorgarlik

1. <https://accounts.eclipse.org> da Eclipse hisobi oching. Profilda **GitHub username**
   maydonini to'ldiring — bu Open VSX bilan bog'lanish uchun shart.
2. <https://open-vsx.org> ga **GitHub orqali** kiring (o'sha GitHub hisobi bilan).
3. Profil sozlamalarida Eclipse hisobini ulang.
4. **Eclipse Foundation Open VSX Publisher Agreement** ni imzolang ("Show Publisher
   Agreement"). Bu bir martalik; imzolamasangiz nashr qila olmaysiz. Alohida ECA
   (Eclipse Contributor Agreement) kerak emas.
5. **Settings → Access Tokens → Generate New Token** — tokenni parol menejeriga saqlang.

### 5.2 Namespace va nashr

```bash
cd vscode

# Namespace = Open VSX'dagi publisher. Faqat bir marta:
npx ovsx create-namespace <publisher-id> -p <open-vsx-token>

# Tayyor .vsix ni nashr qilish:
npm run package
npx ovsx publish sovereign.vsix -p <open-vsx-token>
```

Token muhit o'zgaruvchisi bilan ham beriladi:

```bash
OVSX_PAT=<token> npx ovsx publish sovereign.vsix
```

Yoki tokenni saqlab qo'yish: `npx ovsx login <publisher-id>`.

Nashrdan keyin kengaytma ~5–10 soniya "Deactivated" turadi (qayta ishlanadi), keyin
`https://open-vsx.org/extension/<publisher-id>/sovereign` da ochiladi. Yangi publisher
namespace egaligini tasdiqlamaguncha sahifada ogohlantirish yorlig'i turadi — egalikni
tasdiqlash uchun Open VSX'ga so'rov yoziladi ("Managing Namespaces").

`package.json` da litsenziya bo'lishi shart — bizda `"license": "MIT"` va `LICENSE`
fayli bor, shart bajarilgan.

---

## 6. Yosh va shaxs talablari

Hech bir platforma "18+" deb aniq yozmagan, lekin amalda:

- **Microsoft / Azure DevOps**: Microsoft hisobi kerak. Microsoft Services Agreement
  bo'yicha eng kichik yosh mamlakatga qarab **13–16** oralig'ida; undan kichiklarga
  ota-ona hisobi bilan boshqariladigan bola hisobi kerak. Voyaga yetmagan bo'lsangiz,
  Azure DevOps shartnomasini tuzish huquqi cheklangan — tavsiya: hisob **kattalar
  nomida** (yoki keyinchalik yuridik shaxs nomiga) ochilsin.
- **Eclipse Foundation (Open VSX)**: Publisher Agreement — huquqiy shartnoma, uni
  imzolash uchun shartnoma tuzish layoqati kerak. Eclipse hisobida haqiqiy ism va
  ishlaydigan e-pochta talab qilinadi; GitHub username mos kelishi shart.
- **Shaxsni tasdiqlash**: ikkala reyestrda ham pasport/hujjat so'ralmaydi. Marketplace'da
  "Verified" ko'k belgisi shaxsni emas, **domen egaligini** tasdiqlaydi (§4.4).
- **To'lov**: ikkalasi ham bepul; karta talab qilinmaydi.

> Bu bo'lim huquqiy maslahat emas — shubha bo'lsa, tegishli shartnomalarni
> (Microsoft Services Agreement, Eclipse Publisher Agreement) o'qing.

---

## 7. Versiyalash

`vscode/package.json` dagi `version` **SemVer** bo'lishi shart: `MAJOR.MINOR.PATCH`,
faqat raqamlar (mas. `0.1.0`, `1.2.3`).

- **PATCH** (`0.1.0 → 0.1.1`) — xato tuzatish, matn o'zgarishi.
- **MINOR** (`0.1.1 → 0.2.0`) — yangi buyruq, yangi sozlama, yangi til.
- **MAJOR** (`0.2.0 → 1.0.0`) — mos kelmaydigan o'zgarish (mas. sozlama nomi o'zgardi).

`vsce` versiyani o'zi oshira oladi (`npm version` ni chaqiradi, git commit + teg
yaratadi):

```bash
npx vsce publish patch     # 0.1.0 → 0.1.1
npx vsce publish minor     # 0.1.1 → 0.2.0
npx vsce publish major     # 0.2.0 → 1.0.0
npx vsce publish 1.4.2     # aniq versiya
```

Muhim qoidalar:

- **Bir xil versiyani ikki marta nashr qilib bo'lmaydi.** Xato chiqsa — yangi PATCH.
- Marketplace'da **pre-release** kanali bor (`--pre-release`). Microsoft tavsiyasi:
  barqaror versiyalar uchun MINOR **juft** (`0.2.x`), pre-release uchun **toq**
  (`0.3.x`) ishlatish. Open VSX pre-release'ni shu tarzda ajratmaydi.
- `engines.vscode` (`^1.85.0`) — kengaytma qaysi VS Code'dan boshlab ishlashini
  bildiradi. Eski muharrirlar avtomatik ravishda mos oxirgi versiyani oladi. Buni
  oshirsangiz — MINOR yoki MAJOR bilan chiqaring.
- Har nashrdan oldin `vscode/CHANGELOG.md` ga yozing: Marketplace uni "Changelog"
  yorlig'ida ko'rsatadi.

### Nashr oldidan ro'yxat

```bash
cd vscode
npm ci
npm run compile          # typecheck + bundle
npm test                 # 93 ta test
npm run package          # .vsix yig'iladi
npx vsce ls              # paketga nima kirganini ko'rish (token/maxfiy fayl yo'qmi?)
```

Qo'lda:

- [ ] `publisher` o'rin egasi almashtirilganmi?
- [ ] `version` oshirilganmi, `CHANGELOG.md` yozilganmi?
- [ ] `README.md` dagi skrinshot o'rinlari to'ldirilganmi? (Marketplace **nisbiy**
      rasm havolalarini ko'rsatmaydi — `https://` mutlaq havola yoki
      `--baseImagesUrl` kerak.)
- [ ] `.vsix` mahalliy o'rnatilib sinalganmi (kirish, savol, Apply, Ctrl+Z)?

---

## 8. i18n — VS Code lokalizatsiyasi qanday ishlaydi

Tekshirildi: VS Code ko'rsatish tilini **cheklangan ro'yxatdan** tanlaydi (Language
Pack'lar): `en`, `zh-cn`, `zh-tw`, `fr`, `de`, `it`, `es`, `ja`, `ko`, `ru`, `pt-br`,
`tr`, `pl`, `cs`, `hu`. **O'zbek tili bu ro'yxatda yo'q.** Til `Configure Display
Language` buyrug'i, `argv.json` yoki `--locale` bayrog'i bilan tanlanadi.

Shundan kelib chiqib, kengaytmada ikki qatlam:

| Nima | Qayerda | Qaysi tillar amalda ishlaydi |
|---|---|---|
| Manifest matnlari (buyruq nomlari, sozlama tavsiflari) | `package.nls.json` (en, standart), `package.nls.ru.json`, `package.nls.uz.json`, `package.nls.uz-cyrl.json` | `en` va `ru` — VS Code o'zi tanlaydi. `uz` / `uz-cyrl` fayllari **zaxira uchun** turibdi: stock VS Code ularni hech qachon tanlamaydi, lekin `uz` deb xabar beradigan fork yoki kelajakdagi language pack olishi mumkin. |
| Ish vaqtidagi matnlar (panel, bildirishnomalar, quick pick) | `vscode/src/core/i18n.ts` — bizning lug'atimiz | **4 tilning hammasi.** `vscode.l10n` ishlatilmadi, chunki u ham o'sha cheklangan ro'yxatga bog'liq va o'zbekchani tanlay olmaydi. |

Ish vaqtidagi til: `sovereign.language` sozlamasi (`auto` / `uz` / `uz-cyrl` / `ru` /
`en`). `auto` da `vscode.env.language` ga qaraladi (`ru*` → ru, `uz-Cyrl` → uz-cyrl,
`uz*` → uz, qolgani → `en`).

Test (`vscode/test/i18n.test.ts`) har bir kalitda 4 til borligini, bo'sh emasligini,
`{o'rin egalari}` mos kelishini va alifbo to'g'riligini tekshiradi — loyihaning
`npm run i18n:check` qoidasi bilan bir xil ruh.

> Ildizdagi `npm run i18n:check` faqat `src/**` ni skanerlaydi, `vscode/` ni emas —
> shuning uchun kengaytmaning i18n tekshiruvi `cd vscode && npm test` ichida.

---

## 9. Fayl tuzilishi

```
vscode/
├─ package.json              manifest: buyruqlar, menyular, sozlamalar, keybinding
├─ package.nls*.json         manifest matnlari (en / ru / uz / uz-cyrl)
├─ esbuild.mjs               bundler → dist/extension.js (CJS, `vscode` external)
├─ tsconfig.json             typecheck (src + test)
├─ tsconfig.test.json        faqat sof modullar + testlar → out/ (node --test uchun)
├─ scripts/make-icon.mjs     media/icon.png (128×128) generatori — bog'liqliksiz
├─ media/
│  ├─ icon.png               Marketplace ikonkasi (indigo #5B50F0 / #060812)
│  ├─ activity-bar.svg       faoliyat paneli belgisi (currentColor)
│  ├─ panel.css              panel uslublari (VS Code mavzu o'zgaruvchilari)
│  └─ panel.js               webview skripti (nonce bilan yuklanadi)
├─ src/
│  ├─ extension.ts           activate/deactivate
│  ├─ panel.ts               WebviewView + CSP + so'rov oqimi
│  ├─ commands.ts            buyruqlar va model tanlash
│  ├─ auth.ts                device login + CLI kirishini ko'chirish
│  ├─ status.ts              holat paneli
│  ├─ editor.ts              muharrirdan kontekst, muharrirga qo'yish
│  ├─ settings.ts            sozlamalarni o'qish
│  └─ core/                  ← `vscode` ga BOG'LIQ EMAS, testlanadi
│     ├─ api.ts              /api/cli/* va /api/models mijozi
│     ├─ cli-config.ts       ~/.sovereign/config.json tahlili
│     ├─ context.ts          kontekst yig'ish va kesish
│     ├─ i18n.ts             4 tilli lug'at
│     ├─ markdown.ts         xavfsiz markdown → HTML
│     ├─ prompt.ts           xabarlar ro'yxati
│     ├─ protocol.ts         webview xabarlarini tekshirish
│     ├─ secrets.ts          token ombori (SecretStorage ustidan)
│     └─ url.ts              baseUrl tozalash
└─ test/                     node:test (VS Code test xosti kerak emas)
```

---

## 10. Xavfsizlik (nima qilingan va nega)

- **CSP**: `default-src 'none'`, skript faqat har bir render uchun yangi **nonce** bilan,
  `eval` yo'q, inline handler yo'q, `connect-src 'none'` (webview o'zi tarmoqqa
  chiqmaydi — hamma so'rovni kengaytma xosti qiladi).
- **`localResourceRoots`** faqat `media/` — webview ish papkangizni o'qiy olmaydi.
- **Model chiqishi ishonchsiz**: `src/core/markdown.ts` hamma narsani ekranlaydi; xom
  HTML, `javascript:`, `data:`, `file:`, `vscode:` va hatto `http:` havolalar havola
  bo'lmaydi. Faqat `https:` bosiladi va u xostga qaytib, yana tekshirilgach
  `vscode.env.openExternal` bilan ochiladi. Oqim davomida matn `textContent` bilan
  qo'yiladi (umuman HTML sifatida talqin qilinmaydi).
- **Protokol**: webview'dan kelgan har bir xabar `src/core/protocol.ts` da turi,
  uzunligi va ruxsat etilgan qiymatlari bo'yicha tekshiriladi. Webview kodni **faqat
  indeks bilan** so'raydi — xostga o'zboshimcha matn uzata olmaydi.
- **Token**: faqat SecretStorage (OS kalit saqlagichi), faqat `Authorization`
  sarlavhasida, saqlashdan oldin shakli tekshiriladi (sarlavha ichiga `\r\n` qo'yib
  bo'lmaydi), jurnalga hech qachon yozilmaydi. `Sign out` serverda ham bekor qiladi.
- **Manzil**: `sovereign.baseUrl` har chaqiruvda `https:` (yoki `http://localhost`) ga
  tozalanadi; server qaytargan kirish sahifasi URL'i xost bo'yicha solishtiriladi.
- **Fayl tahriri**: "Apply" oddiy `TextEditorEdit` — **Ctrl+Z** qaytaradi, fayl diskka
  o'z-o'zidan saqlanmaydi.
