# Kod imzosi — asoschi uchun qo'llanma

Hammasi **allaqachon kodda tayyor**. Siz faqat kalit/sertifikat olasiz va GitHub'ga secret qo'shasiz.
Secret yo'q bo'lsa relizlar **bugungidek** chiqadi (imzosiz, har qadam loglarda "notice" bilan o'tkazib yuboriladi).

| Nima | Narxi | Nimani himoya qiladi | Secret'lar |
|---|---|---|---|
| 1. Yangilanish manifesti imzosi | bepul | O'g'irlangan GitHub token bilan soxta `.exe` yangilanish sifatida tarqatilmaydi | `UPDATE_SIGNING_KEY` |
| 2. CLI `SHA256SUMS` imzosi | bepul | `install.sh` / `install.ps1` soxta binary'ni o'rnatmaydi | `CLI_SIGNING_KEY` |
| 3. Windows kod imzosi | ~$10/oy | SmartScreen ogohlantirishi yo'qoladi (obro' to'plangach) | Azure: 3 secret + 4 variable, yoki PFX |
| 4. macOS notarizatsiya | $99/yil | "Ochib bo'lmaydi" oynasi yo'qoladi | `MAC_CSC_LINK` + 4 ta |

Tavsiya etilgan tartib: **1 → 2** (bepul, darhol), keyin pul bo'lganda **3**, **4**.

Secret qo'shish: GitHub → repo → **Settings → Secrets and variables → Actions** →
*Secrets* yorlig'i (maxfiy) yoki *Variables* yorlig'i (maxfiy emas). Yoki terminalda:

```bash
gh secret set UPDATE_SIGNING_KEY < update-ed25519.pem     # fayldan
gh variable set WIN_PUBLISHER_NAME --body "Kompaniya Nomi"
```

> Yopiq kalitlar (`*.pem`, `*.p12`, `*.pfx`) — **faqat** sizning kompyuteringizda va shifrlangan zaxirada
> (parol menejeri / shifrlangan USB). Repo'ga, chatga, bulutga qo'ymang. `.gitignore` ularni bloklaydi.

---

## 1. Yangilanish manifesti imzosi (bepul, Ed25519)

Ilova yangilanishni yuklashdan oldin `latest.yml` imzosini ilovaga o'rnatilgan ochiq kalit bilan tekshiradi
(`desktop/electron/updater.mjs` → `update-sig.mjs`). Kalit o'rnatilmaguncha tekshiruv o'chiq.

**Qadamlar (tartib muhim):**

1. Kalit yarating (internetsiz ham bo'ladi, repo'dan TASHQARIDAGI papkaga):
   ```bash
   node desktop/scripts/sign-update.mjs keygen ~/sovereign-keys
   ```
   `~/sovereign-keys/update-ed25519.pem` — yopiq kalit; ekranda — ochiq kalit (`-----BEGIN PUBLIC KEY-----`).
2. GitHub secret: `UPDATE_SIGNING_KEY` = `update-ed25519.pem` faylining **to'liq** matni.
3. Oddiy reliz chiqaring (`desktop-vX.Y.Z`). Relizda `latest.yml.sig`, `latest-mac.yml.sig`,
   `latest-linux.yml.sig` paydo bo'lganini tekshiring.
4. Shundan keyin ochiq kalitni `desktop/electron/update-sig.mjs` ga qo'ying:
   ```js
   export const UPDATE_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
   MCowBQYDK2VwAyEA...
   -----END PUBLIC KEY-----
   `;
   ```
   Keyingi relizdan boshlab ilovalar imzosiz yoki noto'g'ri imzoli yangilanishni **yuklamaydi**.
   Publish job ham imzosi yo'q relizni ommaviy qilmaydi (reliz draft qoladi).

**Eng xavfsiz variant (secret'siz, OFFLINE):** 2-qadamni o'tkazib yuboring. Kalit o'rnatilgach, publish job
"`.sig yo'q`" deb to'xtaydi — reliz draft qoladi. Shunda:
```bash
gh release download desktop-vX.Y.Z -p 'latest*.yml' -D rel
node desktop/scripts/sign-update.mjs sign ~/sovereign-keys/update-ed25519.pem rel/latest*.yml
gh release upload desktop-vX.Y.Z rel/*.sig
```
va Actions'da **Re-run failed jobs**. (Farqi: secret'dagi kalitni repo'ga yozish huquqi bor odam workflow
orqali ishlata oladi; offline kalitni — yo'q.)

> Yopiq kalitni YO'QOTSANGIZ, o'rnatilgan ilovalar boshqa avtomatik yangilanmaydi — foydalanuvchilar
> yangi versiyani saytdan qo'lda o'rnatishi kerak bo'ladi. Zaxira nusxa shart.

## 2. CLI `SHA256SUMS` imzosi (bepul, RSA-3072)

RSA tanlangan, chunki macOS'dagi `openssl` (LibreSSL) va Windows PowerShell 5.1 uni qo'shimcha dasturlarsiz tekshira oladi.

1. Kalit yarating:
   ```bash
   node cli/scripts/sign-sums.mjs keygen ~/sovereign-keys
   ```
   Ekranda ikki ko'rinishdagi ochiq kalit chiqadi: PEM (install.sh uchun) va `<RSAKeyValue>` XML (install.ps1 uchun).
2. GitHub secret: `CLI_SIGNING_KEY` = `cli-sums-rsa.pem` faylining to'liq matni.
3. CLI relizini chiqaring (`cli-vX.Y.Z`) — relizda `SHA256SUMS.sig` paydo bo'ladi.
4. Keyin ochiq kalitni **ikkala** installer'ga qo'ying va saytni deploy qiling:
   - `public/install.sh`: `SUMS_PUBKEY='-----BEGIN PUBLIC KEY-----` … `-----END PUBLIC KEY-----'` (qatorlari bilan)
   - `public/install.ps1`: `$sumsPubKeyXml = '<RSAKeyValue>…</RSAKeyValue>'` (bitta qator)
   - Tekshirish: `node cli/scripts/sign-sums.mjs status` → `embedded` (ikkalasi bir xil kalit bo'lishi shart).

Kalit qo'yilgach, installer'lar `SHA256SUMS` + `SHA256SUMS.sig` ni yuklab, imzo va hash'ni tekshiradi;
imzo yo'q yoki noto'g'ri bo'lsa — o'rnatmaydi. `install.sh` uchun tizimda `openssl` bo'lishi kerak
(macOS va ko'p Linux'da bor). Installer'da kalit bor-u secret yo'q bo'lsa, CLI reliz workflow'i yiqiladi.

**npm (`@islombekrrr/sov-cli`) va provenance:** hozir npm qo'lda (kompyuterdan) chiqariladi — bunda
`--provenance` ishlamaydi, u faqat CI (GitHub Actions OIDC) ichida ishlaydi. Tavsiya:
- npm hisobida 2FA yoqing (publish uchun ham).
- Keyinroq npm'ni Actions'dan chiqaring: npmjs.com → paket → **Settings → Trusted Publisher** → GitHub Actions
  (repo `isa704480/Sovereign`, workflow `cli-release.yml`). Job'ga `permissions: id-token: write` va qadam:
  `npm publish --provenance --access public` (working-directory: `cli`). Trusted Publisher bilan `NPM_TOKEN` kerak emas.
- `package.json` ga `"provenance": true` ni qo'lda publish qilishda QO'SHMANG — kompyuterdan publish xato beradi.

## 3. Windows kod imzosi

### A variant — Azure Trusted Signing (~$9.99/oy, tavsiya)

Portalda "Trusted Signing" yoki yangi nomi "Artifact Signing" deb chiqishi mumkin.

> **Avval shartni tekshiring:** Microsoft identifikatsiyani faqat ayrim mamlakatlardagi tashkilotlar
> (odatda AQSh, Kanada, EI, Buyuk Britaniya; kamida bir necha yillik tarix) va AQSh/Kanadadagi jismoniy
> shaxslar uchun o'tkazadi. Ro'yxat o'zgarib turadi — Microsoft hujjatidan tekshiring. O'tmasangiz — B variant.

1. Azure obunasi → **Trusted Signing Account** yarating (region, masalan West Europe →
   endpoint `https://weu.codesigning.azure.net`).
2. Account ichida **Identity validation** (Public) → tasdiqlanishini kuting (bir necha kun).
3. **Certificate profile** (Public Trust) yarating.
4. Microsoft Entra ID → **App registrations** → yangi ilova → **Client secret** yarating.
5. Signing Account → **Access control (IAM)** → shu ilovaga "Trusted Signing Certificate Profile Signer"
   (yoki "Artifact Signing …Signer") rolini bering.
6. GitHub'ga qo'shing:
   - Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   - Variables: `AZURE_SIGNING_ENDPOINT` (1-qadamdagi URL), `AZURE_SIGNING_ACCOUNT` (account nomi),
     `AZURE_SIGNING_PROFILE` (profile nomi), `WIN_PUBLISHER_NAME` (tasdiqlangan nom — sertifikatdagi CN bilan **aynan bir xil**)

7 tasi ham bo'lsagina imzo yoqiladi; bittasi yetishmasa — ogohlantirish va imzosiz build.

### B variant — klassik PFX sertifikat

`WIN_CSC_LINK` = `.pfx` ning base64 matni, `WIN_CSC_KEY_PASSWORD` = paroli, ixtiyoriy `WIN_PUBLISHER_NAME`.
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```
Eslatma: 2023-yildan beri OV/EV sertifikat kalitlari odatda USB-token yoki bulut HSM'da beriladi va `.pfx`
sifatida eksport qilinmaydi — bunday sertifikat uchun bu variant ishlamaydi (A variantni tanlang).

### Muhim (ikkala variant)

Imzolangan build'da `verifyUpdateCodeSignature` avtomatik yoqiladi: shu versiyadan keyin ilova faqat **shu
nashriyotchi** (`WIN_PUBLISHER_NAME`) imzolagan yangilanishni o'rnatadi. Imzo to'xtasa (obuna tugasa),
Windows foydalanuvchilari avtomatik yangilana olmaydi. Imzosiz build'larda u `false` qoladi (bugungidek).

Tekshirish: `Get-AuthenticodeSignature .\SOVEREIGN-Cowork-Setup-X.Y.Z.exe | Format-List` →
`Status: Valid`, `SignerCertificate.Subject` dagi `CN=` qiymati `WIN_PUBLISHER_NAME` bilan bir xil.

## 4. macOS: Developer ID + notarizatsiya ($99/yil)

1. **Apple Developer Program** ga a'zo bo'ling (developer.apple.com; mamlakatingizda mavjudligini tekshiring).
2. Mac'da: Xcode → Settings → Accounts → **Manage Certificates** → "+" → **Developer ID Application**.
   Keychain Access'da shu sertifikatni (kaliti bilan) `.p12` ga parol bilan eksport qiling.
3. appleid.apple.com → **App-Specific Passwords** → yangi parol.
4. GitHub secrets:
   - `MAC_CSC_LINK` = `base64 -i cert.p12` natijasi, `MAC_CSC_KEY_PASSWORD` = `.p12` paroli
   - `APPLE_ID` (Apple ID email), `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (10 belgili, developer.apple.com → Membership)

`MAC_CSC_LINK` bo'lsa: Developer ID imzo + hardened runtime (`desktop/build/mac-entitlements.plist`).
Apple secret'lari ham bo'lsa — notarizatsiya. `MAC_CSC_LINK` yo'q bo'lsa — bugungidek ad-hoc imzo.
Tekshirish (dmg'ni ochib): `spctl -a -vv "/Volumes/…/SOVEREIGN Cowork.app"` → `source=Notarized Developer ID`.
(macOS avto-yangilanishi hozircha "saytdan yuklab olish" rejimida qoladi.)

---

## Sinov — haqiqiy foydalanuvchilarga tegmasdan

Desktop publish job'i relizni **Latest** qiladi, shuning uchun sinovni asosiy repo'da qilmang:

1. GitHub'da **private** sinov repo yarating (masalan `sovereign-release-test`).
2. `git push <sinov-remote> main` va teg: `git tag desktop-v<package.json versiyasi> && git push <sinov-remote> --tags`
   (CLI uchun `cli-v<cli/package.json versiyasi>`).
3. Sinov repo'ga xuddi shu secret/variable'larni qo'shing, Actions natijasini ko'ring:
   - loglarda `Code signing enabled (--win: azure)` / `(--mac: developer-id+notarize)`;
   - relizda `latest*.yml.sig`, `SHA256SUMS.sig`;
   - yuqoridagi `Get-AuthenticodeSignature` / `spctl` tekshiruvlari;
   - `curl -fsSL https://github.com/<siz>/sovereign-release-test/releases/download/cli-vX.Y.Z/SHA256SUMS -O` va
     `.sig` ni yuklab: `node cli/scripts/sign-sums.mjs verify SHA256SUMS ochiq.pem`.
4. Hammasi to'g'ri bo'lsa — sinov repo'ni o'chiring va secret'larni asosiy repo'ga qo'shing.

Mahalliy tekshiruv (secret'siz): `node desktop/scripts/test-security.mjs` (imzo konfiguratsiyasi va manifest testlari).

## Xavfsizlik eslatmalari

- Imzo secret'lari faqat tegishli OS'ning **build** qadamiga beriladi (Linux build'ga hech biri);
  `UPDATE_SIGNING_KEY` / `CLI_SIGNING_KEY` — faqat npm ishlamaydigan publish/release job'iga.
- Qo'shimcha himoya (ixtiyoriy): Settings → Environments → `release` muhiti (Required reviewers bilan),
  kalit secret'larini shu muhitga ko'chiring va `publish` / `release` job'lariga `environment: release` qo'shing —
  shunda har bir imzolash sizning tasdig'ingizni kutadi.
