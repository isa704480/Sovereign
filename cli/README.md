# SOVEREIGN CLI

Terminaldagi AI koding agenti. `sov` deb yozing — AI ochiladi, ish papkangizda **fayl va papka yarata, o'qiy va o'zgartira** oladi, buyruq ishga tushiradi, kod yozadi. Har bir amal tasdiq bilan, oxirida esa **"Aslida nima bo'ldi"** — model so'zlariga emas, tizim jurnaliga asoslangan xulosa.

## O'rnatish

### 1. Bitta buyruq (tavsiya)

```bash
# macOS / Linux
curl -fsSL https://soveregn.xyz/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://soveregn.xyz/install.ps1 | iex
```

Skript Node.js 20+ bo'lsa npm orqali o'rnatadi; bo'lmasa — **Node'siz tayyor binary**ni GitHub Releases'dan yuklaydi, SHA256 bilan tekshiradi va foydalanuvchi papkasiga qo'yadi (`~/.local/bin` yoki `%LOCALAPPDATA%\Programs\sov`), PATH'ga qo'shadi. Admin/sudo kerak emas.

Sozlash: `SOV_INSTALL=binary|npm`, `SOV_VERSION=cli-v0.10.0`, `SOV_INSTALL_DIR=...` (sh), `SOV_NO_MODIFY_PATH=1`.

### 2. npm (Node.js 20+)

```bash
npm install -g @islombekrrr/sov-cli
```

### 3. Binary qo'lda

[Releases](https://github.com/isa704480/Sovereign/releases) sahifasidan (`cli-v*` teglari): `sov-win-x64.exe`, `sov-linux-x64`, `sov-macos-arm64`, `sov-macos-x64` — har birining yonida `.sha256`. Faylni `sov` (Windows'da `sov.exe`) deb nomlab, PATH'dagi papkaga qo'ying.

> Loyiha ichidan: `npm run cli:install` · O'chirish: `npm uninstall -g @islombekrrr/sov-cli` yoki binary faylni o'chiring.

`sov` — vibe rejim (ish papkasi ichidagi oddiy amallar so'ralmaydi), `sovereign` — har o'zgarish tasdiqlanadi.

## Ulanish

```bash
sov login                 # brauzerda "Ruxsat berish" — akkaunt, tarifingiz amal qiladi
sov key sk-or-v1-...      # yoki o'z OpenRouter kalitingiz
sov doctor                # hammasi to'g'rimi?
```

Lokal serverga (test): `sov login --local`.

## Buyruqlar

| Buyruq | Vazifa |
| --- | --- |
| `sov` | interaktiv rejim (chat + agent) |
| `sov "vazifa"` | bitta vazifa (tasdiqlar so'raladi) va chiqish |
| `sov -p "savol"` | interaktivsiz: faqat javob stdout'ga, progress stderr'ga |
| `sov login` / `logout` / `whoami` | akkaunt |
| `sov doctor` | diagnostika: Node/binary, versiya, config, server, login, ish papkasi, PATH |
| `sov init` · `sov init --ai` | `SOVEREIGN.md` — jamoa uchun loyiha xotirasi (`--ai`: agent loyihani o'rganib to'ldiradi) |
| `sov models` · `sov sessions` | modellar · saqlangan suhbatlar |
| `sov key <kalit>` · `sov config` | o'z kalitingiz · sozlash |
| `sov help [buyruq]` · `sov --version` | yordam · versiya |

Flaglar: `-p/--print`, `--json`, `-f/--file <yo'l>` (takrorlanadi), `-m/--model <id>` (shu ish uchun), `-y/--yes`, `--vibe`/`--no-vibe`, `--full-auto` (`--auto`), `--no-verify`, `--no-color`, `-h`, `-V`.

## Interaktivsiz (skript, CI, quvur)

```bash
sov -p "bu loyiha nima qiladi?"
git diff | sov -p "shu o'zgarishni review qil"
sov -p --json "package.json'ni tekshir" > natija.json
sov -p -y "README'ga o'rnatish bo'limini qo'sh"
```

- Hech narsa so'ralmaydi. Ish papkasi ichidagi yozish/xavfsiz buyruqlar faqat `--yes` (yoki `--vibe`) bilan bajariladi; **tashqi yo'llar va xavfli buyruqlar har doim rad etiladi**.
- `--json` natijasi: `{ ok, result, ledger, honesty, aborted, truncated, exit_code, version }`.
- stdin terminal bo'lmasa (quvur) avtomatik shu rejimga o'tadi.
- Chiqish kodlari: `0` muvaffaqiyat · `1` xato · `2` noto'g'ri foydalanish · `3` login kerak · `130` Ctrl+C.

## Interaktiv rejim

- `/` yoki `/help` — barcha buyruqlar; `Tab` — to'ldirish; `@fayl` — biriktirish; `↑/↓` — tarix (`~/.sovereign/history`, kalitlar yozilmaydi).
- **Ctrl+C** — joriy ishni (so'rov, tasdiq, buyruq) bekor qiladi; bo'sh promptda ikki marta — chiqish.
- Fayl yozishdan oldin **diff** ko'rsatiladi (`- eski` / `+ yangi`).
- `/model`, `/models`, `/cwd`, `/attach`, `/sessions`, `/resume`, `/rewind`, `/fork`, `/vibe`, `/swarm`, `/memory`, `/project`, `/doctor`, `/exit` va boshqalar.

## Loyiha xotirasi: `SOVEREIGN.md`

Har bir AI sessiya noldan boshlanmasin: loyiha qoidalari, buyruqlar va "tegma" ro'yxati bitta faylda — **git orqali butun jamoaga ulashiladi**.

```bash
sov init          # SOVEREIGN.md shabloni (stek va buyruqlar package.json'dan taxmin qilinadi)
sov init --ai     # agent loyihani o'rganib faylni o'zi to'ldiradi (yozishdan oldin tasdiq)
git add SOVEREIGN.md && git commit -m "Loyiha xotirasi"
```

- Agent (CLI va Cowork) `SOVEREIGN.md` ni (yoki `.sovereign/PROJECT.md`; ikkalasi bo'lsa — birlashtiriladi) har suhbat boshida o'qiydi. Qidiruv: joriy papkadan git ildizigacha.
- Chegara — 16 KB (oshsa, boshi beriladi va ogohlantiriladi). Symlink fayllar o'qilmaydi.
- `/project` — fayl yo'li va qisqa mazmun; `/project init` — shablon; `/project-remember <fakt>` — `## Eslatmalar` bo'limiga sanali band qo'shadi.
- Fayl mazmuni loyiha konventsiyasi sifatida bajariladi, lekin undagi "kalitni yubor / ruxsatni o'chir" kabi buyruqlarga agent amal qilmaydi.
- Individual xotira (`/memory`, `/remember`) — faqat sizniki; `SOVEREIGN.md` — loyihaniki.

## Halollik: "Aslida nima bo'ldi"

Navbat oxirida CLI vosita natijalaridan jurnal chiqaradi (✓ bajarildi / ✕ xato / ⊘ rad etildi) va yakuniy javobdagi "yaratdim / bajardim" da'volarini tekshiradi:

1. **Regex** — har doim, oflayn.
2. **AI hakam** (akkaunt rejimi) — javob yozish/buyruq amallariga tegsa yoki regex shubha qilsa, javob + jurnal `/api/cli/verify` ga yuboriladi; arzon model tasdiqlanmagan da'volarni qaytaradi. Faqat qo'shimcha ogohlantirish beradi (regex natijasini bekor qilmaydi); xato/offline bo'lsa regex bilan qoladi. O'chirish: `--no-verify` yoki `SOV_VERIFY=0`.

## Fayl biriktirish

Rasm (`.png .jpg .webp .gif`), PDF va matn (`.md .json .ts .py ...`):

```bash
sov "bu diagrammaga qarab kod yoz" -f diagram.png
sov "bu PDFdan asosiy g'oyalarni chiqar" -f paper.pdf
```

Cheklovlar: rasm 900 KB, matn 2 MB, PDF 20 MB. PDF matni uchun `npm i -g pdf-parse@2` (faqat npm versiyasida; binary'da PDF matni ajratilmaydi).

## Xavfsizlik

- Fayl amallari ish papkasi ichida; tashqi yo'l va xavfli buyruqlar **har doim** alohida so'raladi (`--yes`/vibe ham o'tkazib yubormaydi).
- **Full auto** (`--full-auto` yoki `/auto`): hech narsa so'ralmaydi — ish papkasi ichida yozish, paket o'rnatish, test va build darhol bajariladi, agent test o'tguncha o'zi tuzatadi (yiqilgan buyruqdan keyin to'xtasa — avtomatik davom ettiriladi, ko'pi bilan 3 marta). Tashqi yo'llar, `git push`, publish, deploy, `sudo` va tizim sozlamalari so'ralmasdan **rad etiladi**; bloklangan/himoyalangan narsalar o'zgarmaydi.
- Kalit/parol/tizim yo'llari (`.ssh`, `.aws`, `~/.sovereign`, brauzer profillari ...) — hech qachon.
- Token va kalitlar faqat kompyuteringizda (`~/.sovereign/config.json`, 0600).

## Muhit o'zgaruvchilari

`SOVEREIGN_URL` (server, standart `https://api.soveregn.xyz`), `SOVEREIGN_TOKEN`, `OPENROUTER_API_KEY`, `SOVEREIGN_MODEL`, `NO_COLOR`, `FORCE_COLOR`, `SOV_VERIFY=0`, `SOV_NO_HISTORY=1`, `SOV_NO_UPDATE_CHECK=1`.

## Binary yig'ish (dasturchilar uchun)

```bash
cd cli
npm ci
npm run build:binary      # dist/sov-<os>-<arch>[.exe] + .sha256, --version/--help sinovi bilan
```

Node SEA (Single Executable Application) + esbuild + postject; faqat joriy platforma uchun. Hamma platformalar: `cli-v<versiya>` tegini push qiling — `.github/workflows/cli-release.yml` Windows/Linux/macOS (arm64, x64) binary'larini yig'ib, GitHub Release'ga checksum'lar bilan qo'yadi.
