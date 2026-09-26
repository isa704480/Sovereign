// sov-audit-ignore-file — bu faylning o'zi qoida matnlari va naqshlarini saqlaydi.
//
// SOVEREIGN — deploy'dan oldingi xavfsizlik tekshiruvi (`sov audit`, `/audit`, Cowork).
// Offline va deterministik: tarmoq yo'q, AI yo'q — faqat ish papkasidagi fayllar o'qiladi.
// "Vibe-coded" ilovalardagi eng ko'p uchraydigan teshiklar: oshkor kalitlar, RLS'siz
// Supabase jadvallari, `using (true)` siyosatlari, faqat brauzerdagi auth, git'ga tushgan
// .env, NEXT_PUBLIC_/VITE_ ichidagi sirlar, CORS `*` + credentials, ochiq Firebase qoidalari.
//
// Sirlar HECH QACHON to'liq chiqarilmaydi: faqat birinchi 4 belgi + "***".
// Qatorni o'tkazib yuborish: shu yoki oldingi qatorda `sov-audit-ignore`;
// butun fayl: birinchi qatorlarda `sov-audit-ignore-file`.

import { readdirSync, readFileSync, existsSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { execFileSync } from "node:child_process";

export const SEVERITIES = ["critical", "high", "medium", "low"];
export const AUDIT_LANGS = ["uz", "uz-cyrl", "ru", "en"];
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const LIMITS = { maxFiles: 6000, maxFileBytes: 512 * 1024, maxTotalBytes: 80 * 1024 * 1024, maxMs: 20_000, maxFindings: 500 };

/** Hech qachon kirilmaydigan papkalar (build natijasi, bog'liqliklar, keshlar). */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "out", "coverage", ".vercel", ".turbo", ".cache", ".parcel-cache",
  ".svelte-kit", ".nuxt", ".output", ".expo", ".gradle", "target", "vendor", "bower_components", "__pycache__",
  ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache", ".idea", ".vscode", "release", "ui-dist", ".terraform", ".serverless",
]);
/** Ichma-ich yo'llar (masalan, Claude Code worktree'lari — repo nusxalari). */
const SKIP_PATHS = [".claude/worktrees"];

const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".py", ".rb", ".go", ".php", ".java", ".kt",
  ".swift", ".rs", ".cs", ".dart", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env", ".sql",
  ".html", ".htm", ".md", ".mdx", ".txt", ".sh", ".bash", ".ps1", ".xml", ".properties", ".rules", ".pem", ".key", ".tf",
  ".gradle", ".plist",
]);
const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".py", ".rb", ".go", ".php", ".java", ".kt", ".swift", ".rs", ".cs", ".dart"]);
const JS_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro"]);
const BINARY_KEY_EXT = new Set([".p12", ".pfx", ".jks", ".keystore", ".ppk"]);
const KEY_FILE_NAMES = /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/;
const LOCK_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "composer.lock", "Cargo.lock", "poetry.lock", "Gemfile.lock"]);

// ─────────────────────────────── qoidalar (4 tilda) ───────────────────────────────
// {ev} — qisqartirilgan dalil (4 belgi + ***), {name}/{table}/{kind}/{fn} — nom.
const R = (severity, msg, fix) => ({ severity, msg, fix });
export const RULES = {
  "secret.api-key": R(
    "critical",
    {
      uz: "{kind} kaliti kodda ochiq yozilgan ({ev}).",
      "uz-cyrl": "{kind} калити кодда очиқ ёзилган ({ev}).",
      ru: "Ключ {kind} записан в коде открытым текстом ({ev}).",
      en: "{kind} key is hardcoded in the source ({ev}).",
    },
    {
      uz: "Kalitni muhit o'zgaruvchisiga (server tomonda) ko'chiring va provayder panelida DARHOL yangilang (rotate) — git tarixida qolgan kalit oshkor hisoblanadi.",
      "uz-cyrl": "Калитни муҳит ўзгарувчисига (сервер томонда) кўчиринг ва провайдер панелида ДАРҲОЛ янгиланг (rotate) — git тарихида қолган калит ошкор ҳисобланади.",
      ru: "Перенесите ключ в переменную окружения (на сервере) и НЕМЕДЛЕННО перевыпустите его у провайдера — ключ в истории git считается скомпрометированным.",
      en: "Move the key into a server-side environment variable and rotate it with the provider NOW — a key that reached git history is compromised.",
    },
  ),
  "secret.private-key": R(
    "critical",
    {
      uz: "Maxfiy kalit (PRIVATE KEY bloki) repoda turibdi.",
      "uz-cyrl": "Махфий калит (PRIVATE KEY блоки) репода турибди.",
      ru: "В репозитории лежит приватный ключ (блок PRIVATE KEY).",
      en: "A private key (PRIVATE KEY block) is stored in the repository.",
    },
    {
      uz: "Faylni repodan olib tashlang, .gitignore'ga qo'shing, kalitni maxfiy saqlagichga (secret manager / env) o'tkazing va yangi kalit juftligini yarating.",
      "uz-cyrl": "Файлни реподан олиб ташланг, .gitignore'га қўшинг, калитни махфий сақлагичга (secret manager / env) ўтказинг ва янги калит жуфтлигини яратинг.",
      ru: "Удалите файл из репозитория, добавьте в .gitignore, храните ключ в секрет-хранилище (secret manager / env) и сгенерируйте новую пару ключей.",
      en: "Remove the file from the repo, add it to .gitignore, keep the key in a secret manager / env and generate a new key pair.",
    },
  ),
  "secret.service-role": R(
    "critical",
    {
      uz: "Supabase service_role kaliti kodda ({ev}) — u RLS'ni butunlay chetlab o'tadi.",
      "uz-cyrl": "Supabase service_role калити кодда ({ev}) — у RLS'ни бутунлай четлаб ўтади.",
      ru: "Ключ Supabase service_role в коде ({ev}) — он полностью обходит RLS.",
      en: "Supabase service_role key in the source ({ev}) — it bypasses RLS entirely.",
    },
    {
      uz: "Kalitni faqat serverdagi env'da saqlang (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_ prefiksisiz), Supabase panelida yangilang; brauzerda faqat anon/publishable kalit ishlating.",
      "uz-cyrl": "Калитни фақат сервердаги env'да сақланг (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_ префиксисиз), Supabase панелида янгиланг; браузерда фақат anon/publishable калит ишлатинг.",
      ru: "Храните ключ только в серверном env (SUPABASE_SERVICE_ROLE_KEY, без префикса NEXT_PUBLIC_), перевыпустите его в панели Supabase; в браузере используйте только anon/publishable ключ.",
      en: "Keep the key only in server env (SUPABASE_SERVICE_ROLE_KEY, no NEXT_PUBLIC_ prefix), rotate it in the Supabase dashboard; use only the anon/publishable key in the browser.",
    },
  ),
  "secret.gcp-service-account": R(
    "critical",
    {
      uz: "Google/Firebase service account JSON (private_key bilan) repoda turibdi.",
      "uz-cyrl": "Google/Firebase service account JSON (private_key билан) репода турибди.",
      ru: "В репозитории лежит JSON сервисного аккаунта Google/Firebase (с private_key).",
      en: "A Google/Firebase service-account JSON (with private_key) is in the repository.",
    },
    {
      uz: "Faylni o'chirib, .gitignore'ga qo'shing; Google Cloud konsolida kalitni o'chirib yangisini yarating va uni env orqali bering.",
      "uz-cyrl": "Файлни ўчириб, .gitignore'га қўшинг; Google Cloud консолида калитни ўчириб янгисини яратинг ва уни env орқали беринг.",
      ru: "Удалите файл и добавьте в .gitignore; в Google Cloud Console отзовите ключ, создайте новый и передавайте его через env.",
      en: "Delete the file and add it to .gitignore; revoke the key in Google Cloud Console, create a new one and pass it via env.",
    },
  ),
  "secret.generic": R(
    "high",
    {
      uz: "«{name}» qiymati kodda ochiq yozilgan ({ev}).",
      "uz-cyrl": "«{name}» қиймати кодда очиқ ёзилган ({ev}).",
      ru: "Значение «{name}» записано в коде открытым текстом ({ev}).",
      en: "“{name}” is hardcoded in the source ({ev}).",
    },
    {
      uz: "Qiymatni env o'zgaruvchisiga ko'chiring (process.env.X, faqat serverda) va eski qiymatni almashtiring.",
      "uz-cyrl": "Қийматни env ўзгарувчисига кўчиринг (process.env.X, фақат серверда) ва эски қийматни алмаштиринг.",
      ru: "Перенесите значение в переменную окружения (process.env.X, только на сервере) и замените старое значение.",
      en: "Move the value to an environment variable (process.env.X, server only) and replace the old value.",
    },
  ),
  "secret.jwt-hardcoded": R(
    "high",
    {
      uz: "JWT imzo siri kodda qattiq yozilgan ({ev}) — har kim token soxtalashtira oladi.",
      "uz-cyrl": "JWT имзо сири кодда қаттиқ ёзилган ({ev}) — ҳар ким токен сохталаштира олади.",
      ru: "Секрет подписи JWT зашит в коде ({ev}) — любой сможет подделать токен.",
      en: "JWT signing secret is hardcoded ({ev}) — anyone can forge tokens.",
    },
    {
      uz: "Sirni env'dan o'qing (process.env.JWT_SECRET), kamida 32 tasodifiy bayt qiling va yangilang.",
      "uz-cyrl": "Сирни env'дан ўқинг (process.env.JWT_SECRET), камида 32 тасодифий байт қилинг ва янгиланг.",
      ru: "Читайте секрет из env (process.env.JWT_SECRET), сделайте его не короче 32 случайных байт и смените.",
      en: "Read the secret from env (process.env.JWT_SECRET), make it at least 32 random bytes and rotate it.",
    },
  ),
  "env.not-ignored": R(
    "critical",
    {
      uz: "{name} fayli .gitignore'da emas yoki allaqachon git'ga tushgan.",
      "uz-cyrl": "{name} файли .gitignore'да эмас ёки аллақачон git'га тушган.",
      ru: "Файл {name} не в .gitignore или уже попал в git.",
      en: "{name} is not gitignored or has already been committed.",
    },
    {
      uz: ".gitignore'ga `.env*` va `!.env.example` qo'shing, `git rm --cached <fayl>` bilan kuzatuvdan chiqaring va ichidagi barcha kalitlarni yangilang.",
      "uz-cyrl": ".gitignore'га `.env*` ва `!.env.example` қўшинг, `git rm --cached <файл>` билан кузатувдан чиқаринг ва ичидаги барча калитларни янгиланг.",
      ru: "Добавьте в .gitignore `.env*` и `!.env.example`, уберите файл из индекса (`git rm --cached <файл>`) и смените все ключи внутри.",
      en: "Add `.env*` and `!.env.example` to .gitignore, untrack the file with `git rm --cached <file>` and rotate every key in it.",
    },
  ),
  "env.gitignore-missing": R(
    "medium",
    {
      uz: ".gitignore .env fayllarini yashirmaydi — birinchi `git add .` kalitlarni oshkor qiladi.",
      "uz-cyrl": ".gitignore .env файлларини яширмайди — биринчи `git add .` калитларни ошкор қилади.",
      ru: ".gitignore не скрывает файлы .env — первый же `git add .` раскроет ключи.",
      en: ".gitignore does not cover .env files — the first `git add .` will leak your keys.",
    },
    {
      uz: ".gitignore'ga `.env*` va `!.env.example` qatorlarini qo'shing.",
      "uz-cyrl": ".gitignore'га `.env*` ва `!.env.example` қаторларини қўшинг.",
      ru: "Добавьте в .gitignore строки `.env*` и `!.env.example`.",
      en: "Add `.env*` and `!.env.example` to .gitignore.",
    },
  ),
  "env.public-secret": R(
    "critical",
    {
      uz: "{name} — ommaviy (brauzerga yuboriladigan) prefiks bilan, lekin nomi maxfiy qiymatni bildiradi.",
      "uz-cyrl": "{name} — оммавий (браузерга юбориладиган) префикс билан, лекин номи махфий қийматни билдиради.",
      ru: "{name} — с публичным префиксом (попадает в браузер), но по названию это секрет.",
      en: "{name} uses a public (shipped-to-browser) prefix but its name says it is a secret.",
    },
    {
      uz: "Prefiksni olib tashlang (NEXT_PUBLIC_/VITE_/EXPO_PUBLIC_/REACT_APP_), qiymatni faqat server kodida (API route / server action / edge function) ishlating va kalitni yangilang — u allaqachon JS bundle'da.",
      "uz-cyrl": "Префиксни олиб ташланг (NEXT_PUBLIC_/VITE_/EXPO_PUBLIC_/REACT_APP_), қийматни фақат сервер кодида (API route / server action / edge function) ишлатинг ва калитни янгиланг — у аллақачон JS bundle'да.",
      ru: "Уберите префикс (NEXT_PUBLIC_/VITE_/EXPO_PUBLIC_/REACT_APP_), используйте значение только в серверном коде (API route / server action / edge function) и перевыпустите ключ — он уже в JS-бандле.",
      en: "Drop the prefix (NEXT_PUBLIC_/VITE_/EXPO_PUBLIC_/REACT_APP_), use the value only in server code (API route / server action / edge function) and rotate the key — it is already in the JS bundle.",
    },
  ),
  "client.server-env": R(
    "high",
    {
      uz: "\"use client\" komponent server env o'zgaruvchisini o'qiydi: {name}.",
      "uz-cyrl": "\"use client\" компонент сервер env ўзгарувчисини ўқийди: {name}.",
      ru: "Клиентский компонент (\"use client\") читает серверную переменную окружения: {name}.",
      en: "A \"use client\" component reads a server env variable: {name}.",
    },
    {
      uz: "Sirni ishlatadigan kodni server tomonga (route handler / server action) ko'chiring; client faqat natijani so'rasin.",
      "uz-cyrl": "Сирни ишлатадиган кодни сервер томонга (route handler / server action) кўчиринг; client фақат натижани сўрасин.",
      ru: "Перенесите код, использующий секрет, на сервер (route handler / server action); клиент пусть запрашивает только результат.",
      en: "Move the code that uses the secret to the server (route handler / server action); the client should only request the result.",
    },
  ),
  "supabase.service-role-client": R(
    "critical",
    {
      uz: "service_role brauzer kodida ishlatilgan — foydalanuvchi butun bazaga to'liq kirish oladi.",
      "uz-cyrl": "service_role браузер кодида ишлатилган — фойдаланувчи бутун базага тўлиқ кириш олади.",
      ru: "service_role используется в браузерном коде — пользователь получает полный доступ ко всей базе.",
      en: "service_role is used in browser code — any user gets full access to the whole database.",
    },
    {
      uz: "Brauzerda anon kalit + RLS ishlating; admin amallarni server route / Edge Function'ga ko'chiring va service_role kalitini yangilang.",
      "uz-cyrl": "Браузерда anon калит + RLS ишлатинг; админ амалларни сервер route / Edge Function'га кўчиринг ва service_role калитини янгиланг.",
      ru: "В браузере используйте anon-ключ + RLS; админские операции перенесите в серверный route / Edge Function и перевыпустите ключ service_role.",
      en: "Use the anon key + RLS in the browser; move admin operations to a server route / Edge Function and rotate the service_role key.",
    },
  ),
  "supabase.no-rls": R(
    "critical",
    {
      uz: "«{table}» jadvali yaratilgan, lekin Row Level Security yoqilmagan — anon kalit bilan hamma o'qiy/yoza oladi.",
      "uz-cyrl": "«{table}» жадвали яратилган, лекин Row Level Security ёқилмаган — anon калит билан ҳамма ўқий/ёза олади.",
      ru: "Таблица «{table}» создана, но Row Level Security не включён — с anon-ключом её может читать и менять кто угодно.",
      en: "Table “{table}” is created without Row Level Security — anyone with the anon key can read/write it.",
    },
    {
      uz: "Yangi migratsiya qo'shing: `alter table {table} enable row level security;` va kerakli siyosatlarni yozing (masalan, `using (auth.uid() = user_id)`).",
      "uz-cyrl": "Янги миграция қўшинг: `alter table {table} enable row level security;` ва керакли сиёсатларни ёзинг (масалан, `using (auth.uid() = user_id)`).",
      ru: "Добавьте миграцию: `alter table {table} enable row level security;` и напишите политики (например, `using (auth.uid() = user_id)`).",
      en: "Add a migration: `alter table {table} enable row level security;` and write policies (e.g. `using (auth.uid() = user_id)`).",
    },
  ),
  "supabase.rls-disabled": R(
    "high",
    {
      uz: "«{table}» jadvalida RLS o'chirilgan (disable row level security).",
      "uz-cyrl": "«{table}» жадвалида RLS ўчирилган (disable row level security).",
      ru: "В таблице «{table}» отключён RLS (disable row level security).",
      en: "RLS is disabled on table “{table}” (disable row level security).",
    },
    {
      uz: "RLS'ni qayta yoqing va aniq siyosatlar yozing; o'chirish faqat ichki (public bo'lmagan) sxemada maqbul.",
      "uz-cyrl": "RLS'ни қайта ёқинг ва аниқ сиёсатлар ёзинг; ўчириш фақат ички (public бўлмаган) схемада мақбул.",
      ru: "Включите RLS обратно и напишите конкретные политики; отключение допустимо только во внутренней (не public) схеме.",
      en: "Re-enable RLS and write explicit policies; disabling is only acceptable in an internal (non-public) schema.",
    },
  ),
  "supabase.policy-true": R(
    "high",
    {
      uz: "«{name}» siyosati ({table}, {kind}) shartsiz: `true` — bu RLS'ni amalda o'chiradi.",
      "uz-cyrl": "«{name}» сиёсати ({table}, {kind}) шартсиз: `true` — бу RLS'ни амалда ўчиради.",
      ru: "Политика «{name}» ({table}, {kind}) без условия: `true` — фактически отключает RLS.",
      en: "Policy “{name}” ({table}, {kind}) is unconditional: `true` — it effectively disables RLS.",
    },
    {
      uz: "Shartni egasiga bog'lang: `using (auth.uid() = user_id)` / `with check (auth.uid() = user_id)`; yozish siyosatini faqat `to authenticated` bilan bering.",
      "uz-cyrl": "Шартни эгасига боғланг: `using (auth.uid() = user_id)` / `with check (auth.uid() = user_id)`; ёзиш сиёсатини фақат `to authenticated` билан беринг.",
      ru: "Привяжите условие к владельцу: `using (auth.uid() = user_id)` / `with check (auth.uid() = user_id)`; политики записи давайте только `to authenticated`.",
      en: "Tie the condition to the owner: `using (auth.uid() = user_id)` / `with check (auth.uid() = user_id)`; grant write policies only `to authenticated`.",
    },
  ),
  "firebase.open-rules": R(
    "critical",
    {
      uz: "Firebase qoidasi hammaga ochiq: `allow {kind}` shartsiz (if true).",
      "uz-cyrl": "Firebase қоидаси ҳаммага очиқ: `allow {kind}` шартсиз (if true).",
      ru: "Правило Firebase открыто всем: `allow {kind}` без условия (if true).",
      en: "Firebase rule is open to everyone: `allow {kind}` with no condition (if true).",
    },
    {
      uz: "Kamida `if request.auth != null` va egasini tekshiring: `if request.auth.uid == userId`.",
      "uz-cyrl": "Камида `if request.auth != null` ва эгасини текширинг: `if request.auth.uid == userId`.",
      ru: "Как минимум `if request.auth != null` и проверка владельца: `if request.auth.uid == userId`.",
      en: "At minimum require `if request.auth != null` and check ownership: `if request.auth.uid == userId`.",
    },
  ),
  "firebase.test-mode": R(
    "high",
    {
      uz: "Firebase \"test mode\" qoidasi (request.time < ...) — sana o'tguncha baza hammaga ochiq.",
      "uz-cyrl": "Firebase \"test mode\" қоидаси (request.time < ...) — сана ўтгунча база ҳаммага очиқ.",
      ru: "Правило Firebase \"test mode\" (request.time < ...) — до указанной даты база открыта всем.",
      en: "Firebase \"test mode\" rule (request.time < ...) — the database is open to everyone until that date.",
    },
    {
      uz: "Vaqtga bog'liq qoidani olib tashlab, request.auth asosidagi qoidalar yozing.",
      "uz-cyrl": "Вақтга боғлиқ қоидани олиб ташлаб, request.auth асосидаги қоидалар ёзинг.",
      ru: "Уберите правило по времени и напишите правила на основе request.auth.",
      en: "Remove the time-based rule and write rules based on request.auth.",
    },
  ),
  "xss.inner-html": R(
    "medium",
    {
      uz: "`dangerouslySetInnerHTML` — tozalanmagan HTML XSS'ga olib keladi.",
      "uz-cyrl": "`dangerouslySetInnerHTML` — тозаланмаган HTML XSS'га олиб келади.",
      ru: "`dangerouslySetInnerHTML` — неочищенный HTML ведёт к XSS.",
      en: "`dangerouslySetInnerHTML` — unsanitized HTML leads to XSS.",
    },
    {
      uz: "Oddiy JSX matn ishlating yoki HTML'ni DOMPurify.sanitize() orqali tozalang.",
      "uz-cyrl": "Оддий JSX матн ишлатинг ёки HTML'ни DOMPurify.sanitize() орқали тозаланг.",
      ru: "Используйте обычный JSX-текст или очищайте HTML через DOMPurify.sanitize().",
      en: "Render plain JSX text or sanitize the HTML with DOMPurify.sanitize().",
    },
  ),
  "code.eval": R(
    "high",
    {
      uz: "`{fn}` — satrni kod sifatida bajaradi (kod in'eksiyasi xavfi).",
      "uz-cyrl": "`{fn}` — сатрни код сифатида бажаради (код инъекцияси хавфи).",
      ru: "`{fn}` — выполняет строку как код (риск инъекции кода).",
      en: "`{fn}` — executes a string as code (code-injection risk).",
    },
    {
      uz: "JSON uchun JSON.parse, dinamik amallar uchun aniq funksiyalar xaritasidan foydalaning.",
      "uz-cyrl": "JSON учун JSON.parse, динамик амаллар учун аниқ функциялар харитасидан фойдаланинг.",
      ru: "Для JSON используйте JSON.parse, для динамики — явную таблицу функций.",
      en: "Use JSON.parse for JSON and an explicit function map for dynamic behaviour.",
    },
  ),
  "net.http-url": R(
    "medium",
    {
      uz: "API manzili shifrlanmagan http:// orqali: {name}",
      "uz-cyrl": "API манзили шифрланмаган http:// орқали: {name}",
      ru: "Адрес API без шифрования (http://): {name}",
      en: "API URL uses unencrypted http://: {name}",
    },
    {
      uz: "https:// ishlating — aks holda token va ma'lumotlar tarmoqda ochiq ketadi.",
      "uz-cyrl": "https:// ишлатинг — акс ҳолда токен ва маълумотлар тармоқда очиқ кетади.",
      ru: "Используйте https:// — иначе токены и данные передаются открытым текстом.",
      en: "Use https:// — otherwise tokens and data travel in clear text.",
    },
  ),
  "cors.wildcard-credentials": R(
    "high",
    {
      uz: "CORS har qanday manbaga ({name}) credentials bilan ruxsat beradi.",
      "uz-cyrl": "CORS ҳар қандай манбага ({name}) credentials билан рухсат беради.",
      ru: "CORS разрешает любой источник ({name}) вместе с credentials.",
      en: "CORS allows any origin ({name}) together with credentials.",
    },
    {
      uz: "Ruxsat etilgan domenlar ro'yxatini (allowlist) yozing: origin: [\"https://sizning-domen.uz\"]; `*` yoki origin: true'ni credentials bilan ishlatmang.",
      "uz-cyrl": "Рухсат этилган доменлар рўйхатини (allowlist) ёзинг: origin: [\"https://sizning-domen.uz\"]; `*` ёки origin: true'ни credentials билан ишлатманг.",
      ru: "Задайте список разрешённых доменов: origin: [\"https://your-domain.com\"]; не сочетайте `*` или origin: true с credentials.",
      en: "Use an explicit allowlist: origin: [\"https://your-domain.com\"]; never combine `*` or origin: true with credentials.",
    },
  ),
  "auth.client-only": R(
    "medium",
    {
      uz: "Himoyalangan sahifa faqat brauzerda tekshiriladi (client redirect), server/middleware tekshiruvi topilmadi.",
      "uz-cyrl": "Ҳимояланган саҳифа фақат браузерда текширилади (client redirect), сервер/middleware текшируви топилмади.",
      ru: "Защищённая страница проверяется только в браузере (клиентский redirect), проверки на сервере/в middleware не найдено.",
      en: "Protected page is checked only in the browser (client redirect); no server/middleware check found.",
    },
    {
      uz: "Sessiyani serverda tekshiring (middleware.ts / proxy.ts yoki server komponent) va ma'lumotni RLS / API darajasida himoyalang — client redirect'ni chetlab o'tish oson.",
      "uz-cyrl": "Сессияни серверда текширинг (middleware.ts / proxy.ts ёки сервер компонент) ва маълумотни RLS / API даражасида ҳимояланг — client redirect'ни четлаб ўтиш осон.",
      ru: "Проверяйте сессию на сервере (middleware.ts / proxy.ts или серверный компонент) и защищайте данные на уровне RLS / API — клиентский redirect легко обойти.",
      en: "Verify the session on the server (middleware.ts / proxy.ts or a server component) and protect data at the RLS / API level — a client redirect is trivial to bypass.",
    },
  ),
  "auth.local-storage-role": R(
    "high",
    {
      uz: "Rol/kirish holati localStorage'da saqlanadi ({name}) — foydalanuvchi uni o'zi o'zgartira oladi.",
      "uz-cyrl": "Рол/кириш ҳолати localStorage'да сақланади ({name}) — фойдаланувчи уни ўзи ўзгартира олади.",
      ru: "Роль/статус входа хранится в localStorage ({name}) — пользователь может изменить его сам.",
      en: "Role/login state is stored in localStorage ({name}) — the user can change it themselves.",
    },
    {
      uz: "Rolni serverdagi sessiya/JWT claim'dan oling va har so'rovda serverda tekshiring.",
      "uz-cyrl": "Ролни сервердаги сессия/JWT claim'дан олинг ва ҳар сўровда серверда текширинг.",
      ru: "Берите роль из серверной сессии/JWT-claim и проверяйте её на сервере при каждом запросе.",
      en: "Derive the role from the server session/JWT claim and check it on the server for every request.",
    },
  ),
  "key.file": R(
    "high",
    {
      uz: "Kalit/sertifikat fayli repoda: {name}",
      "uz-cyrl": "Калит/сертификат файли репода: {name}",
      ru: "Файл ключа/сертификата в репозитории: {name}",
      en: "Key/certificate file in the repository: {name}",
    },
    {
      uz: "Faylni repodan olib tashlang, .gitignore'ga qo'shing va kalitni yangilang.",
      "uz-cyrl": "Файлни реподан олиб ташланг, .gitignore'га қўшинг ва калитни янгиланг.",
      ru: "Удалите файл из репозитория, добавьте в .gitignore и перевыпустите ключ.",
      en: "Remove the file from the repo, add it to .gitignore and rotate the key.",
    },
  ),
  "public.sensitive-file": R(
    "critical",
    {
      uz: "Maxfiy fayl ommaviy papkada ({name}) — sayt orqali har kim yuklab oladi.",
      "uz-cyrl": "Махфий файл оммавий папкада ({name}) — сайт орқали ҳар ким юклаб олади.",
      ru: "Секретный файл в публичной папке ({name}) — его может скачать любой через сайт.",
      en: "Sensitive file inside a public folder ({name}) — anyone can download it from the site.",
    },
    {
      uz: "Faylni public/ (static/) dan olib tashlang va ichidagi kalitlarni yangilang.",
      "uz-cyrl": "Файлни public/ (static/) дан олиб ташланг ва ичидаги калитларни янгиланг.",
      ru: "Уберите файл из public/ (static/) и смените ключи внутри.",
      en: "Remove the file from public/ (static/) and rotate the keys inside.",
    },
  ),
};

/** Agent (AI) uchun tayyor topshiriq matni — 4 tilda. */
const PROMPT = {
  uz: {
    head: "Xavfsizlik tekshiruvi (sov audit) ish papkasida quyidagi muammolarni topdi. Ularni tuzat:",
    rules: [
      "Har bir muammoni kodda tuzat (fayl:qator ko'rsatilgan), eng muhimidan boshla (critical → high → medium).",
      "Kalit/sir qiymatlarini hech qachon to'liq chop etma va yangi kalit o'ylab topma — env o'zgaruvchisiga ko'chir.",
      "Oshkor bo'lgan kalitlarni provayder panelida yangilash (rotate) kerakligini oxirida foydalanuvchiga ayt — buni o'zing qila olmaysan.",
      "Supabase uchun eski migratsiyani o'zgartirma — yangi migratsiya fayli qo'sh.",
      "Tugatgach, qayta tekshirish uchun `sov audit` ishga tushir (yoki foydalanuvchiga ayt).",
    ],
    more: "…yana {n} ta topilma (qisqartirildi).",
  },
  "uz-cyrl": {
    head: "Хавфсизлик текшируви (sov audit) иш папкасида қуйидаги муаммоларни топди. Уларни тузат:",
    rules: [
      "Ҳар бир муаммони кодда тузат (файл:қатор кўрсатилган), энг муҳимидан бошла (critical → high → medium).",
      "Калит/сир қийматларини ҳеч қачон тўлиқ чоп этма ва янги калит ўйлаб топма — env ўзгарувчисига кўчир.",
      "Ошкор бўлган калитларни провайдер панелида янгилаш (rotate) кераклигини охирида фойдаланувчига айт — буни ўзинг қила олмайсан.",
      "Supabase учун эски миграцияни ўзгартирма — янги миграция файли қўш.",
      "Тугатгач, қайта текшириш учун `sov audit` ишга тушир (ёки фойдаланувчига айт).",
    ],
    more: "…яна {n} та топилма (қисқартирилди).",
  },
  ru: {
    head: "Проверка безопасности (sov audit) нашла в рабочей папке следующие проблемы. Исправь их:",
    rules: [
      "Исправь каждую проблему в коде (указаны файл:строка), начиная с самых важных (critical → high → medium).",
      "Никогда не печатай значения ключей/секретов целиком и не придумывай новые ключи — переноси их в переменные окружения.",
      "В конце скажи пользователю, что скомпрометированные ключи нужно перевыпустить у провайдера — сам ты этого сделать не можешь.",
      "Для Supabase не меняй старые миграции — добавь новый файл миграции.",
      "После исправлений запусти `sov audit` повторно (или попроси пользователя).",
    ],
    more: "…и ещё {n} находок (сокращено).",
  },
  en: {
    head: "The security audit (sov audit) found the following problems in the working folder. Fix them:",
    rules: [
      "Fix each problem in code (file:line given), most important first (critical → high → medium).",
      "Never print key/secret values in full and never invent new keys — move them into environment variables.",
      "At the end, tell the user that leaked keys must be rotated in the provider dashboard — you cannot do that yourself.",
      "For Supabase, do not edit old migrations — add a new migration file.",
      "When done, run `sov audit` again (or ask the user to).",
    ],
    more: "…and {n} more findings (truncated).",
  },
};

// ─────────────────────────────── yordamchilar ───────────────────────────────

/** Sirni qisqartirish: faqat birinchi 4 belgi + "***". To'liq qiymat hech qachon chiqmaydi. */
export function redact(value) {
  const s = String(value ?? "");
  return s.slice(0, 4) + "***";
}

const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (idx) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function entropy(s) {
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  let h = 0;
  for (const n of Object.values(freq)) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const PLACEHOLDER = /(x{4,}|\.{3}|your[_-]?|example|changeme|change[_-]me|placeholder|dummy|sample|fake|redacted|\*{3}|<[^>]*>|\$\{|%s|replace[_-]?me|insert[_-]?|todo|lorem|test[_-]?key|0{8,}|1234567)/i;

function looksPlaceholder(v) {
  return PLACEHOLDER.test(v);
}

function b64urlJson(part) {
  try {
    const s = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(s, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const norm = (p) => p.replace(/\\/g, "/");

// ─────────────────────────────── .gitignore ───────────────────────────────

function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else if (ch === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end === -1) re += "\\[";
      else {
        re += "[" + glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\") + "]";
        i = end;
      }
    } else if (ch === "\\" && i + 1 < glob.length) {
      re += "\\" + glob[++i];
    } else re += ch.replace(/[.+^${}()|]/g, "\\$&");
  }
  return re;
}

/** Oddiy .gitignore talqini (git bo'lmaganda zaxira). */
function parseGitignore(text, base) {
  const rules = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    let neg = false;
    if (line.startsWith("!")) {
      neg = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    if (!line) continue;
    const body = globToRegex(line);
    const re = new RegExp("^" + (anchored ? "" : "(?:.*/)?") + body + "$");
    rules.push({ base, re, neg, dirOnly });
  }
  return rules;
}

function ignoredBy(rules, rel, isDir) {
  let ignored = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    let sub = rel;
    if (r.base) {
      if (!rel.startsWith(r.base + "/")) continue;
      sub = rel.slice(r.base.length + 1);
    }
    if (r.re.test(sub)) ignored = !r.neg;
  }
  return ignored;
}

/** git mavjud bo'lsa — aniq ma'lumot: kuzatilayotgan va e'tiborsiz qoldirilmagan fayllar. */
function gitInfo(root) {
  if (!existsSync(join(root, ".git"))) return null;
  const run = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 15_000, maxBuffer: 128 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  try {
    const tracked = new Set(run(["ls-files", "-z"]).split("\0").filter(Boolean).map(norm));
    const untracked = run(["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean).map(norm);
    const visible = new Set([...tracked, ...untracked]);
    const visibleDirs = new Set();
    for (const f of visible) {
      let i = f.lastIndexOf("/");
      while (i > 0) {
        const d = f.slice(0, i);
        if (visibleDirs.has(d)) break;
        visibleDirs.add(d);
        i = d.lastIndexOf("/");
      }
    }
    return { tracked, visible, visibleDirs };
  } catch {
    return null;
  }
}

// ─────────────────────────────── naqshlar ───────────────────────────────

const PK_BEGIN = "-----BEGIN ";
const PRIVATE_KEY_RE = new RegExp(PK_BEGIN + "(?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----");

/** Aniq formatli kalitlar: [kind, regex, severity]. */
const SECRET_PATTERNS = [
  ["AWS", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "critical"],
  ["Stripe (live)", /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g, "critical"],
  ["Stripe (test)", /\bsk_test_[0-9a-zA-Z]{20,}\b/g, "low"],
  ["OpenAI", /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}/g, "critical"],
  ["OpenAI", /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g, "critical"],
  ["Anthropic", /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}/g, "critical"],
  ["OpenRouter", /\bsk-or-v1-[a-f0-9]{64}\b/g, "critical"],
  ["Groq", /\bgsk_[A-Za-z0-9]{50,}\b/g, "critical"],
  ["GitHub", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, "critical"],
  ["GitHub", /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, "critical"],
  ["Slack", /\bxox[baprs]-[0-9A-Za-z-]{20,}/g, "high"],
  ["Slack webhook", /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/g, "high"],
  ["SendGrid", /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, "critical"],
  ["Resend", /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}\b/g, "high"],
  ["Telegram bot", /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g, "high"],
  ["Google API", /\bAIza[0-9A-Za-z_-]{35}\b/g, "low"],
  ["Supabase secret", /\bsb_secret_[A-Za-z0-9_-]{20,}/g, "critical"],
];
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g;
const AWS_SECRET_RE = /aws_?secret_?access_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})\b/gi;
const GENERIC_RE =
  /\b([A-Za-z0-9_]*(?:secret|passw(?:or)?d|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|jwt[_-]?secret|signing[_-]?key))["']?\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi;
const JWT_LITERAL_RE = /\bjwt\.(?:sign|verify)\s*\([^;]*?,\s*["'`]([^"'`]{6,})["'`]/g;

const PUBLIC_PREFIX = /^(NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_|GATSBY_|PUBLIC_|VUE_APP_)/;
const SECRETISH_NAME =
  /(SECRET|SERVICE_ROLE|SERVICE_KEY|PRIVATE|PASSWORD|PASSWD|DATABASE_URL|DB_URL|POSTGRES|MONGO(?:DB)?_URI|REDIS_URL|OPENAI|ANTHROPIC|OPENROUTER|GROQ|MISTRAL|DEEPSEEK|REPLICATE|ELEVENLABS|ADMIN_KEY|WEBHOOK_SECRET|SK_LIVE|AWS_SECRET|RESEND_API|SENDGRID|TWILIO_AUTH)/;
const CRITICAL_NAME = /(SECRET|SERVICE_ROLE|SERVICE_KEY|PRIVATE|PASSWORD|PASSWD|DATABASE_URL|DB_URL|POSTGRES|MONGO|SK_LIVE|AWS_SECRET)/;

const USE_CLIENT_RE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;
const SERVICE_ROLE_REF = /service_role|SERVICE_ROLE|serviceRole(?:Key)?\b/;
const PUBLIC_DIRS = /(^|\/)(public|static|www|wwwroot)\//;
const TEST_PATH = /(^|\/)(__tests__|__mocks__|tests?|spec|fixtures?|mocks?|e2e|cypress|examples?|docs?|stories)\/|\.(test|spec|stories|e2e)\.[a-z]+$/i;
const SENSITIVE_TABLE = /(user|profile|account|payment|order|invoice|subscription|message|chat|conversation|token|secret|credential|session|transaction|wallet|billing|card|address|phone|email|private|admin|key)/i;

// ─────────────────────────────── skaner ───────────────────────────────

/**
 * Ish papkasini tekshiradi.
 * @param {string} [root] — tekshiriladigan papka (standart: process.cwd())
 * @param {{ limits?: Partial<typeof LIMITS> }} [opts]
 * @returns {Promise<{ root: string, findings: object[], counts: Record<string, number>, ok: boolean, scanned: number, truncated: boolean, durationMs: number }>}
 */
export async function runAudit(root = process.cwd(), opts = {}) {
  const lim = { ...LIMITS, ...(opts.limits ?? {}) };
  const t0 = Date.now();
  const findings = [];
  const seen = new Set();
  let truncated = false;

  const add = (ruleId, file, line, vars = {}, severity) => {
    const rule = RULES[ruleId];
    const key = `${ruleId}|${file}|${line}|${vars.name ?? vars.table ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (findings.length >= lim.maxFindings) {
      truncated = true;
      return;
    }
    const message = {};
    const fix = {};
    for (const l of AUDIT_LANGS) {
      message[l] = fill(rule.msg[l], vars);
      fix[l] = fill(rule.fix[l], vars);
    }
    findings.push({ severity: severity ?? rule.severity, rule: ruleId, file, line, message_uz: message.uz, fix_uz: fix.uz, message, fix });
  };

  const git = gitInfo(root);
  const ignoreRules = [];
  const isIgnored = (rel, isDir) => {
    if (git) return isDir ? !git.visibleDirs.has(rel) && !git.visible.has(rel) : !git.visible.has(rel);
    return ignoredBy(ignoreRules, rel, isDir);
  };
  const isTracked = (rel) => (git ? git.tracked.has(rel) : null);

  // ── 1. Fayllar ro'yxati ──
  const files = []; // { rel, abs, ignored }
  const envFiles = [];
  const walk = (dirAbs, dirRel) => {
    if (files.length >= lim.maxFiles || Date.now() - t0 > lim.maxMs) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    if (!git) {
      const gi = entries.find((e) => e.name === ".gitignore" && e.isFile());
      if (gi) {
        try {
          ignoreRules.push(...parseGitignore(readFileSync(join(dirAbs, ".gitignore"), "utf8"), dirRel));
        } catch {
          /* o'qib bo'lmadi — o'tkazamiz */
        }
      }
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || SKIP_PATHS.includes(rel)) continue;
        if (isIgnored(rel, true)) continue;
        walk(join(dirAbs, e.name), rel);
        continue;
      }
      if (!e.isFile()) continue;
      if (files.length >= lim.maxFiles) {
        truncated = true;
        return;
      }
      const name = e.name;
      const ignored = isIgnored(rel, false);
      if (/^\.env(\..+)?$/i.test(name)) envFiles.push({ rel, abs: join(dirAbs, name), ignored, name });
      files.push({ rel, abs: join(dirAbs, name), ignored, name });
    }
  };
  walk(root, "");

  // ── 2. package.json — loyiha turi ──
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    pkg = {};
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const has = (re) => Object.keys(deps).some((d) => re.test(d));
  const hasServer = has(/^(next|express|fastify|hono|koa|@nestjs\/core|nuxt|@sveltejs\/kit|@remix-run\/.+|astro|@hapi\/hapi|@react-router\/dev)$/);
  const clientOnly = !hasServer && has(/^(vite|react-scripts|expo|@vitejs\/.+|parcel)$/);
  const hasMiddleware = files.some((f) => /^(src\/)?(middleware|proxy)\.(t|j)sx?$/.test(f.rel) || /^(src\/)?(middleware|proxy)\.m?js$/.test(f.rel));
  const supabaseProject = existsSync(join(root, "supabase")) || has(/^@supabase\//);

  // ── 3. .gitignore / .env ──
  const rootGitignore = existsSync(join(root, ".gitignore"));
  const envCovered = git ? null : ignoredBy(ignoreRules, ".env", false) && ignoredBy(ignoreRules, ".env.local", false);
  for (const f of envFiles) {
    const isTemplate = /\.(example|sample|template|dist|defaults?)$/i.test(f.name);
    if (isTemplate) continue;
    const tracked = isTracked(f.rel);
    if (!f.ignored || tracked) add("env.not-ignored", f.rel, 1, { name: f.rel }, tracked ? "critical" : "high");
  }
  const looksLikeApp = Boolean(pkg.name || Object.keys(deps).length) || files.some((f) => /^(requirements\.txt|pyproject\.toml|go\.mod|Gemfile|composer\.json)$/.test(f.rel));
  if (looksLikeApp && !envFiles.some((f) => !/\.(example|sample|template|dist|defaults?)$/i.test(f.name))) {
    // Hali .env yo'q — oldindan himoya: .gitignore uni yashiradimi?
    let covered = envCovered;
    if (git) {
      try {
        const txt = rootGitignore ? readFileSync(join(root, ".gitignore"), "utf8") : "";
        covered = ignoredBy(parseGitignore(txt, ""), ".env", false) && ignoredBy(parseGitignore(txt, ""), ".env.local", false);
      } catch {
        covered = false;
      }
    }
    if (!covered) add("env.gitignore-missing", rootGitignore ? ".gitignore" : "(.gitignore)", 1);
  }

  // ── 4. Fayl tarkibi ──
  let total = 0;
  let scanned = 0;
  const sqlFiles = [];
  for (const f of files) {
    if (Date.now() - t0 > lim.maxMs) {
      truncated = true;
      break;
    }
    const ext = extname(f.name).toLowerCase();
    const isEnv = /^\.env(\..+)?$/i.test(f.name);
    const inPublic = PUBLIC_DIRS.test(f.rel);

    // Ikkilik kalit fayllari (tarkibni o'qimaymiz).
    if (BINARY_KEY_EXT.has(ext)) {
      if (!f.ignored || isTracked(f.rel)) add(inPublic ? "public.sensitive-file" : "key.file", f.rel, 1, { name: f.rel });
      continue;
    }
    if (inPublic && (isEnv || KEY_FILE_NAMES.test(f.name))) add("public.sensitive-file", f.rel, 1, { name: f.rel });

    const isText = TEXT_EXT.has(ext) || isEnv || KEY_FILE_NAMES.test(f.name) || /^(Dockerfile|Procfile|\.npmrc|\.pypirc|\.netrc)$/.test(f.name);
    if (!isText || LOCK_FILES.has(f.name) || /\.min\.(js|css)$/.test(f.name) || /\.map$/.test(f.name)) continue;

    let size = 0;
    try {
      size = lstatSync(f.abs).size;
    } catch {
      continue;
    }
    if (size > lim.maxFileBytes) continue;
    if (total + size > lim.maxTotalBytes) {
      truncated = true;
      break;
    }
    let text;
    try {
      text = await readFile(f.abs, "utf8");
    } catch {
      continue;
    }
    total += size;
    scanned++;
    if (text.slice(0, 1024).includes("\0")) continue;
    if (/sov-audit-ignore-file/.test(text.slice(0, 600))) continue;

    const lineAt = lineIndex(text);
    const lines = text.split("\n");
    const suppressed = (ln) => /sov-audit-ignore/.test(lines[ln - 1] ?? "") || /sov-audit-ignore/.test(lines[ln - 2] ?? "");
    const hit = (ruleId, idx, vars, sev) => {
      const ln = lineAt(idx);
      if (!suppressed(ln)) add(ruleId, f.rel, ln, vars, sev);
    };
    const isCode = CODE_EXT.has(ext);
    const isJs = JS_EXT.has(ext);
    const isTest = TEST_PATH.test(f.rel);
    const isTemplateEnv = isEnv && /\.(example|sample|template|dist|defaults?)$/i.test(f.name);
    // Haqiqiy .env — sirlar o'z joyida (git holati env.not-ignored'da); gitignore'dagi fayllar deploy qilinmaydi.
    const secretScan = !(isEnv && !isTemplateEnv) && !f.ignored;
    const bump = (sev) => (inPublic && (sev === "high" || sev === "medium") ? "critical" : sev);

    if (secretScan) {
      // 4a. GCP service account (JSON ichidagi private_key — alohida qoida, takrorlanmasin).
      const gcp = ext === ".json" && /"type"\s*:\s*"service_account"/.test(text) && /"private_key"\s*:/.test(text);
      if (gcp) hit("secret.gcp-service-account", text.search(/"private_key"\s*:/), {});

      // 4b. Maxfiy kalit bloki.
      const pk = gcp ? null : PRIVATE_KEY_RE.exec(text);
      if (pk) hit("secret.private-key", pk.index, {}, "critical");
      else if (!gcp && (ext === ".pem" || ext === ".key" || KEY_FILE_NAMES.test(f.name)) && /PRIVATE KEY/.test(text)) add("key.file", f.rel, 1, { name: f.rel });

      // 4c. Aniq formatli kalitlar.
      for (const [kind, re, sev] of SECRET_PATTERNS) {
        re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
          const v = m[0];
          if (looksPlaceholder(v) || entropy(v) < 3) continue;
          hit("secret.api-key", m.index, { kind, ev: redact(v) }, bump(sev));
        }
      }
      AWS_SECRET_RE.lastIndex = 0;
      for (const m of text.matchAll(AWS_SECRET_RE)) {
        if (!looksPlaceholder(m[1]) && entropy(m[1]) > 3.5) hit("secret.api-key", m.index, { kind: "AWS secret", ev: redact(m[1]) }, "critical");
      }

      // 4d. JWT: Supabase service_role (anon kaliti ommaviy — o'tkazamiz).
      JWT_RE.lastIndex = 0;
      for (const m of text.matchAll(JWT_RE)) {
        const payload = b64urlJson(m[0].split(".")[1]);
        if (payload && payload.role === "service_role") hit("secret.service-role", m.index, { ev: redact(m[0]) }, "critical");
      }

      // 4e. Umumiy: secret/password/api_key = "…" (faqat kod va konfiguratsiya, testlarsiz).
      if ((isCode || [".json", ".yaml", ".yml", ".toml", ".ini", ".properties", ".tf", ".xml"].includes(ext)) && !isTest && !/(^|\/)(locales?|i18n|lang|translations?)\//i.test(f.rel)) {
        GENERIC_RE.lastIndex = 0;
        for (const m of text.matchAll(GENERIC_RE)) {
          const [, name, v] = m;
          if (looksPlaceholder(v) || /^(https?:|\.{0,2}\/|@\/|process\.env|import\.meta)/.test(v)) continue;
          if (/^[A-Z0-9_]+$/.test(v) || /^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(v) || /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/.test(v)) continue; // ENV_NOMI, camelCase, kebab/i18n kalitlari
          if (!/[0-9]/.test(v) || !/[A-Za-z]/.test(v) || entropy(v) < 3.3) continue;
          if (/(^|_)(public|publishable|anon)(_|$)/i.test(name) || /^(pk_|pk\.)/.test(v)) continue;
          hit("secret.generic", m.index, { name, ev: redact(v) }, bump("high"));
        }
        JWT_LITERAL_RE.lastIndex = 0;
        for (const m of text.matchAll(JWT_LITERAL_RE)) {
          if (!looksPlaceholder(m[1])) hit("secret.jwt-hardcoded", m.index, { ev: redact(m[1]) });
        }
      }
    }

    // 4f. Ommaviy prefiksli maxfiy env nomlari (.env fayllari va kod).
    if (isEnv || isCode || ext === ".json" || ext === ".yml" || ext === ".yaml" || ext === ".toml") {
      const ENV_NAME_RE = isEnv
        ? /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm
        : /(?:process\.env\.|import\.meta\.env\.|process\.env\[["'`]|Constants\.expoConfig\.extra\.)([A-Z][A-Z0-9_]*)|["'`]((?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_)[A-Z0-9_]+)["'`]/g;
      for (const m of text.matchAll(ENV_NAME_RE)) {
        const name = m[1] ?? m[2];
        if (!name || !PUBLIC_PREFIX.test(name)) continue;
        const rest = name.replace(PUBLIC_PREFIX, "");
        if (!SECRETISH_NAME.test(rest) || /(PUBLISHABLE|ANON|PUBLIC_KEY|SITE_KEY)/.test(rest)) continue;
        hit("env.public-secret", m.index, { name }, CRITICAL_NAME.test(rest) ? "critical" : "high");
      }
    }

    // 4g. http:// API manzillari (env qiymatlari va koddagi API chaqiruvlari).
    if (isEnv || isCode) {
      for (const m of text.matchAll(/["'`=]\s*(http:\/\/[^\s"'`<>)]+)/g)) {
        const url = m[1];
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch {
          continue;
        }
        if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|host\.docker\.internal)/.test(host)) continue;
        if (/\.(local|localhost|test|internal|example|invalid|lan|home)$/.test(host) || /(^|\.)(example\.(com|org|net)|w3\.org|schemas\.|xmlsoap\.org|purl\.org|json-schema\.org|ns\.adobe\.com|apache\.org|opensource\.org|schemas\.android\.com)/.test(host) || !host.includes(".")) continue;
        const line = lines[lineAt(m.index) - 1] ?? "";
        const apiLike = isEnv ? /(URL|URI|ENDPOINT|HOST|API|BASE)/i.test(line) : /(fetch|axios|baseURL|base_url|api|endpoint|url\s*[:=]|ws:|request|http\.(get|post)|got\(|ky\()/i.test(line) || /(^api\.|\/api\b|\/v\d\/|\/graphql)/.test(url.replace(/^http:\/\//, ""));
        if (apiLike) hit("net.http-url", m.index, { name: url.length > 80 ? url.slice(0, 80) + "…" : url });
      }
    }

    if (isJs || ext === ".py") {
      const isClient = USE_CLIENT_RE.test(text);

      // 4h. "use client" + server env / service_role.
      if (isClient) {
        for (const m of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["'`]([A-Z][A-Z0-9_]*)["'`]\])/g)) {
          const name = m[1] ?? m[2];
          if (/^(NEXT_PUBLIC_|NODE_ENV$|NEXT_RUNTIME$|VERCEL_ENV$)/.test(name)) continue;
          hit("client.server-env", m.index, { name: `process.env.${name}` }, SECRETISH_NAME.test(name) ? "high" : "medium");
        }
      }
      const clientFile = isClient || (clientOnly && /^(src|app|components|pages|lib|hooks|screens)\//.test(f.rel)) || inPublic;
      if (clientFile) {
        const sr = SERVICE_ROLE_REF.exec(text);
        if (sr) hit("supabase.service-role-client", sr.index, {});
      }

      if (isJs) {
        // 4i. dangerouslySetInnerHTML — JSON-LD (JSON.stringify) va sanitize bilan bo'lsa o'tkazamiz.
        for (const m of text.matchAll(/dangerouslySetInnerHTML\s*=\s*\{/g)) {
          const around = text.slice(m.index, m.index + 240);
          if (/JSON\.stringify|sanitize|DOMPurify|purify|xss\(|escapeHtml/i.test(around)) continue;
          hit("xss.inner-html", m.index, {});
        }
        // 4j. localStorage'dagi rol / kirish holati.
        for (const m of text.matchAll(/localStorage\.(?:getItem|setItem)\(\s*["'`](isAdmin|is_admin|admin|role|userRole|user_role|isLoggedIn|is_logged_in|loggedIn|authenticated|isAuthenticated|isPremium|is_premium|plan)["'`]/g)) {
          hit("auth.local-storage-role", m.index, { name: m[1] });
        }
        // 4k. Faqat brauzerdagi auth guard (client redirect) + middleware yo'q.
        if (isClient && !hasMiddleware && !clientOnly && /(^|\/)(app|pages|src\/app|src\/pages)\/.*(admin|dashboard|account|settings|billing|panel)/i.test(f.rel)) {
          const g = /if\s*\(\s*!\s*(?:user|session|currentUser|isAdmin|isLoggedIn|auth(?:User)?|data\??\.(?:user|session))\b[^)]*\)\s*\{?\s*(?:return\s+)?(?:router\.(?:push|replace)|redirect|navigate|window\.location)/.exec(text);
          if (g) hit("auth.client-only", g.index, {});
        }
      }

      // 4l. eval / new Function (izoh va satr ichidagilarsiz).
      for (const m of text.matchAll(/(?<![.\w$"'`])(eval|new Function)\s*\(/g)) {
        const line = lines[lineAt(m.index) - 1] ?? "";
        if (/^\s*(\/\/|\*|#)/.test(line)) continue;
        hit("code.eval", m.index, { fn: m[1] + "()" }, m[1] === "eval" ? "high" : "medium");
      }

      // 4m. CORS: wildcard/har qanday origin + credentials.
      const credIdx = text.search(/(Access-Control-Allow-Credentials["'`]?\s*[,:]\s*["'`]?true|credentials\s*:\s*true|allow_credentials\s*=\s*True|AllowCredentials\s*\(\s*\))/);
      if (credIdx !== -1) {
        const wild =
          /Access-Control-Allow-Origin["'`]?\s*[,:]\s*["'`]\*["'`]/.exec(text) ||
          /\borigin\s*:\s*(?:["'`]\*["'`]|true)\b/.exec(text) ||
          /allow_origins\s*=\s*\[\s*["']\*["']\s*\]/.exec(text) ||
          /\borigin\s*:\s*\(?\s*(?:origin|_)?\s*,?\s*(?:callback|cb)\s*\)?\s*=>\s*(?:callback|cb)\(\s*null\s*,\s*true\s*\)/.exec(text);
        if (wild && Math.abs(lineAt(wild.index) - lineAt(credIdx)) <= 25) hit("cors.wildcard-credentials", wild.index, { name: wild[0].includes("true") ? "origin: true" : "*" });
      }
    }

    // 4n. Firebase qoidalari.
    if (ext === ".rules" || /^(firestore|storage|database)\.rules(\.json)?$/.test(f.name)) {
      for (const m of text.matchAll(/allow\s+([a-z,\s]+?)\s*(?::\s*if\s+true\s*;|;)/g)) {
        const ops = m[1].replace(/\s+/g, " ").trim();
        const write = /(write|create|update|delete)/.test(ops);
        hit("firebase.open-rules", m.index, { kind: ops, name: ops }, write ? "critical" : "high");
      }
      const tm = /request\.time\s*<\s*timestamp\.date\s*\(/.exec(text);
      if (tm) hit("firebase.test-mode", tm.index, {});
    }
    if (/^database\.rules\.json$|\.rules\.json$/.test(f.name)) {
      for (const m of text.matchAll(/"\.(read|write)"\s*:\s*(?:true|"true")/g)) {
        hit("firebase.open-rules", m.index, { kind: m[1], name: m[1] }, m[1] === "write" ? "critical" : "high");
      }
    }

    if (ext === ".sql") sqlFiles.push({ rel: f.rel, text, lineAt });
  }

  // ── 5. Supabase: RLS va siyosatlar (barcha .sql fayllar migratsiya tartibida) ──
  const sqlText = sqlFiles.map((s) => s.text).join("\n");
  const isSupabaseSql = supabaseProject || /auth\.uid\(\)|auth\.users|enable\s+row\s+level\s+security|supabase/i.test(sqlText);
  if (sqlFiles.length && isSupabaseSql) auditSql(sqlFiles, add);

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const x of findings) counts[x.severity]++;
  return {
    root,
    findings,
    counts,
    ok: counts.critical + counts.high === 0,
    scanned,
    files: files.length,
    truncated,
    durationMs: Date.now() - t0,
  };
}

/** SQL izohlarini olib tashlaydi (satr uzunligi/qator raqamlari saqlanadi). */
function stripSqlComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
}

const IDENT = String.raw`(?:"[^"]+"|[\w$]+)`;
const QNAME = String.raw`(${IDENT}(?:\s*\.\s*${IDENT})?)`;
const unq = (s) => s.replace(/"/g, "").replace(/\s+/g, "").toLowerCase();
const splitName = (q) => {
  const n = unq(q);
  const i = n.indexOf(".");
  return i === -1 ? { schema: "public", table: n } : { schema: n.slice(0, i), table: n.slice(i + 1) };
};

function auditSql(sqlFiles, add) {
  const ordered = [...sqlFiles].sort((a, b) => a.rel.localeCompare(b.rel));
  const tables = new Map(); // "schema.table" -> { created, rls, dropped, createAt, disableAt }
  const events = [];
  let dynamicRls = false;
  for (const f of ordered) {
    const text = stripSqlComments(f.text);
    if (/format\s*\(\s*'[^']*enable\s+row\s+level\s+security|execute\s+'[^']*enable\s+row\s+level\s+security/i.test(text)) dynamicRls = true;
    const push = (re, type) => {
      for (const m of text.matchAll(re)) events.push({ type, name: m[1], m, f, pos: m.index });
    };
    push(new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${QNAME}(?![^;]*?\bpartition\s+of\b)`, "gi"), "create");
    push(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QNAME}\s+(?:enable|force)\s+row\s+level\s+security`, "gi"), "enable");
    push(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QNAME}\s+disable\s+row\s+level\s+security`, "gi"), "disable");
    push(new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${QNAME}`, "gi"), "drop");
    for (const m of text.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QNAME}\s+rename\s+to\s+(${IDENT})`, "gi"))) {
      events.push({ type: "rename", name: m[1], to: m[2], m, f, pos: m.index });
    }
  }
  events.sort((a, b) => a.f.rel.localeCompare(b.f.rel) || a.pos - b.pos);
  for (const ev of events) {
    const { schema, table } = splitName(ev.name);
    const key = `${schema}.${table}`;
    const st = tables.get(key) ?? { schema, table, created: false, rls: false, dropped: false };
    if (ev.type === "create") Object.assign(st, { created: true, dropped: false, rls: st.rls && !st.dropped, createAt: ev });
    else if (ev.type === "enable") Object.assign(st, { rls: true, disableAt: null });
    else if (ev.type === "disable") Object.assign(st, { rls: false, disableAt: ev });
    else if (ev.type === "drop") Object.assign(st, { dropped: true, rls: false, created: false });
    else if (ev.type === "rename") {
      tables.delete(key);
      const to = `${schema}.${unq(ev.to)}`;
      tables.set(to, { ...st, table: unq(ev.to) });
      continue;
    }
    tables.set(key, st);
  }
  for (const st of tables.values()) {
    if (st.schema !== "public" || st.dropped) continue;
    const label = st.table;
    if (st.disableAt) {
      const e = st.disableAt;
      add("supabase.rls-disabled", e.f.rel, e.f.lineAt(e.pos), { table: label });
    } else if (st.created && !st.rls && st.createAt) {
      const e = st.createAt;
      add("supabase.no-rls", e.f.rel, e.f.lineAt(e.pos), { table: label }, dynamicRls ? "medium" : "critical");
    }
  }

  // Siyosatlar: using (true) / with check (true).
  for (const f of ordered) {
    const text = stripSqlComments(f.text);
    const re = new RegExp(String.raw`create\s+policy\s+("[^"]+"|[\w$]+)\s+on\s+${QNAME}([^;]*);`, "gi");
    for (const m of text.matchAll(re)) {
      const body = m[3];
      const usingTrue = /\busing\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(body);
      const checkTrue = /\bwith\s+check\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(body);
      if (!usingTrue && !checkTrue) continue;
      const roles = (/\bto\s+([\w\s,"]+?)(?=\s+using\b|\s+with\b|$)/i.exec(body)?.[1] ?? "public").toLowerCase().replace(/"/g, "");
      if (/^\s*service_role\s*$/.test(roles)) continue;
      const cmd = (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(body)?.[1] ?? "all").toLowerCase();
      const { schema, table } = splitName(m[2]);
      if (schema !== "public") continue;
      const write = cmd !== "select";
      const sensitive = SENSITIVE_TABLE.test(table);
      const sev = write ? (/\banon\b|\bpublic\b/.test(roles) || !/\bto\b/i.test(body) ? "critical" : "high") : sensitive ? "high" : "low";
      add("supabase.policy-true", f.rel, f.lineAt(m.index), { name: m[1].replace(/"/g, ""), table, kind: cmd }, sev);
    }
  }
}

// ─────────────────────────────── chiqish ───────────────────────────────

/** Topilmalar bo'yicha agentga beriladigan topshiriq (til: uz | uz-cyrl | ru | en). */
export function auditPrompt(result, lang = "uz", max = 40) {
  const P = PROMPT[lang] ?? PROMPT.uz;
  const list = result.findings.filter((f) => f.severity !== "low" || result.findings.length <= max);
  const shown = list.slice(0, max);
  const lines = [P.head, "", ...P.rules.map((r, i) => `${i + 1}. ${r}`), ""];
  for (const f of shown) {
    lines.push(`- [${f.severity}] ${f.file}:${f.line} (${f.rule}) — ${f.message[lang] ?? f.message_uz}`);
    lines.push(`  → ${f.fix[lang] ?? f.fix_uz}`);
  }
  if (list.length > shown.length) lines.push(fill(P.more, { n: list.length - shown.length }));
  return lines.join("\n");
}

/**
 * Terminal hisoboti (CLI). `c` — ui.mjs rang funksiyalari (red/amber/dim/…); berilmasa rangsiz.
 * @returns {string}
 */
export function formatAudit(result, c = null, { max = 60 } = {}) {
  const id = (s) => s;
  const col = {
    critical: c?.red ?? id,
    high: c?.amber ?? id,
    medium: c?.violet ?? c?.indigo ?? id,
    low: c?.dim ?? id,
  };
  const dim = c?.dim ?? id;
  const white = c?.white ?? id;
  const ok = c?.emerald ?? c?.green ?? id;
  const LABEL = { critical: "CRITICAL", high: "HIGH    ", medium: "MEDIUM  ", low: "LOW     " };
  const out = [""];
  out.push(`  ${white("Xavfsizlik tekshiruvi")} ${dim(`— ${result.scanned} ta fayl, ${result.durationMs} ms`)}`);
  const cnt = result.counts;
  out.push(
    "  " +
      [`${col.critical("●")} critical ${cnt.critical}`, `${col.high("●")} high ${cnt.high}`, `${col.medium("●")} medium ${cnt.medium}`, `${col.low("●")} low ${cnt.low}`].join(dim("  ·  ")),
  );
  out.push("");
  if (!result.findings.length) {
    out.push(`  ${ok("✓")} Muammo topilmadi. ${dim("(Bu kafolat emas: biznes-mantiq va serverdagi sozlamalarni ham tekshiring.)")}`);
  }
  for (const f of result.findings.slice(0, max)) {
    out.push(`  ${col[f.severity](LABEL[f.severity])} ${white(`${f.file}:${f.line}`)} ${dim(f.rule)}`);
    out.push(`           ${f.message_uz}`);
    out.push(`           ${dim("→ " + f.fix_uz)}`);
  }
  if (result.findings.length > max) out.push(dim(`  …yana ${result.findings.length - max} ta topilma (to'liq ro'yxat: sov audit --json)`));
  if (result.truncated) out.push(dim("  ⚠ Chegara tufayli hammasi tekshirilmadi (fayl soni / hajm / vaqt)."));
  out.push("");
  return out.join("\n");
}
