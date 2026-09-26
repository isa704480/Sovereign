import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { resolve, relative, dirname, join, isAbsolute, basename, sep, win32, posix } from "node:path";
import { homedir } from "node:os";
import { exec, spawn } from "node:child_process";
import { c } from "./ui.mjs";

const IS_WIN = process.platform === "win32";

/**
 * Mavjud bo'lgan ENG YAQIN ota-papkani realpath orqali yechib, qolgan (hali
 * yaratilmagan) qismini unga qayta ulaydi. Shu tariqa symlink/junction orqali
 * ish papkasidan qochib chiqish (a/link/b/new.txt) aniqlanadi.
 */
function realResolve(abs) {
  let cur = abs;
  const tail = [];
  for (;;) {
    try {
      // .native — Windows'da 8.3 qisqa nomlarni (SOVERE~1) to'liq nomga ochadi,
      // aks holda himoya ro'yxatlari qisqa nom bilan aylanib o'tilardi.
      const real = realpathSync.native(cur);
      return tail.length ? join(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs; // ildizgacha hech narsa yo'q
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

function isUnc(p) {
  return /^[\\/]{2}/.test(String(p));
}

/** `rel` — root'ga nisbatan yo'l; tashqarida bo'lsa true. */
function relIsOutside(rel) {
  return rel === ".." || rel.startsWith(".." + sep) || rel.startsWith("../") || isAbsolute(rel);
}

/**
 * Yo'lni realpath orqali yechadi (symlink hujumlariga qarshi), lekin THROW
 * QILMAYDI — ish papkasidan tashqarida ekanini `outside` bilan bildiradi.
 * Chaqiruvchi tashqarida bo'lsa foydalanuvchidan ruxsat so'raydi.
 */
export function resolvePath(p, rootDir = process.cwd()) {
  const root = realResolve(resolve(rootDir));
  const abs = resolve(root, String(p ?? "."));
  const real = realResolve(abs);
  const rel = relative(root, real);
  const outside = relIsOutside(rel) || (isUnc(real) && !isUnc(root));
  return { real, rel, outside };
}

// ---- Himoyalangan yo'llar ------------------------------------------------

const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Uy papkasiga nisbatan — ish papkasi ICHIDA bo'lsa ham taqiqlangan. */
const HOME_DENY = [
  ".sovereign", ".ssh", ".aws", ".azure", ".config/gh", ".config/gcloud", ".config/git",
  ".npmrc", ".pypirc", ".gitconfig", ".git-credentials", ".netrc", ".gnupg", ".docker", ".kube",
  ".bashrc", ".zshrc", ".profile", ".bash_profile", ".bash_login", ".zprofile", ".zshenv", ".zlogin",
  ".config/powershell", "documents/powershell", "documents/windowspowershell",
  "onedrive/documents/powershell", "onedrive/documents/windowspowershell",
  // Brauzer profillari (cookie, parol, sessiya)
  ".mozilla", ".config/google-chrome", ".config/chromium", ".config/bravesoftware", ".config/microsoft-edge",
  "library/application support/google/chrome", "library/application support/firefox",
  "library/application support/bravesoftware", "library/application support/microsoft edge",
  "library/safari", "library/keychains", "library/cookies",
  "appdata/local/google/chrome/user data", "appdata/local/microsoft/edge/user data",
  "appdata/local/bravesoftware", "appdata/local/chromium", "appdata/roaming/mozilla",
  "appdata/roaming/opera software", "appdata/roaming/github cli", "appdata/roaming/gcloud",
  "appdata/roaming/microsoft/credentials", "appdata/local/microsoft/credentials",
];

/** Qayerda bo'lishidan qat'i nazar taqiqlangan (normallashtirilgan, `/` bilan). */
const ANYWHERE_DENY = [
  /\/\.ssh(\/|$)/,
  /\/\.git-credentials$/,
  /\/\.netrc$/,
  /\/\.sovereign(\/|$)/,
  /\/documents\/(windows)?powershell(\/|$)/,
  /profile\.ps1$/,
  /\/(google\/chrome|microsoft\/edge|bravesoftware\/brave-browser|chromium)\/user data(\/|$)/,
  /\/mozilla\/firefox(\/|$)/,
  // OS / tizim
  /^\/etc\/(passwd|shadow|gshadow|sudoers)/,
  /^\/boot(\/|$)/,
  /^\/system(\/|$)/,
  /^[a-z]:\/windows(\/|$)/,
  /^[a-z]:\/program files( \(x86\))?(\/|$)/,
  /\/system32(\/|$)/,
];

/**
 * Faqat YOZISH taqiqlangan (o'qish mumkin) — git orqali kod ijrosi. Butun .git
 * (hooks/config emas, commondir/info va h.k. ham) va istalgan chuqurlikdagi .git
 * FAYLI (gitdir yo'naltirish) — "xavfsiz" git status fsmonitor bilan RCE bermasin.
 */
const WRITE_DENY = [/\/\.git(\/|$)/];

let HOME_REAL = null;
function homeDirs() {
  if (!HOME_REAL) {
    const h = homedir();
    HOME_REAL = [...new Set([norm(h), norm(realResolve(h))])];
  }
  return HOME_REAL;
}

/**
 * Ruxsat berilgan taqdirda ham TAQIQLANGAN yo'llar — parol/kalit/OS/brauzer.
 * Bu joylarga foydalanuvchi "ha" desa ham tegilmaydi (ish papkasi ichida ham).
 * @param {string} real  realResolve qilingan absolyut yo'l
 * @param {{write?: boolean, outside?: boolean}} opts
 */
export function isProtected(real, { write = false, outside = false } = {}) {
  const n = norm(real);
  // NTFS muqobil oqimlari (file::$DATA, file:stream) — ro'yxatlarni aylanib o'tish yo'li.
  if (IS_WIN && n.replace(/^[a-z]:/, "").includes(":")) return true;
  for (const h of homeDirs()) {
    for (const d of HOME_DENY) {
      const full = `${h}/${d}`;
      if (n === full || n.startsWith(full + "/")) return true;
    }
  }
  if (ANYWHERE_DENY.some((re) => re.test(n))) return true;
  if (write && WRITE_DENY.some((re) => re.test(n))) return true;
  // Ish papkasidan tashqaridagi .env fayllar (sirlar).
  const base = n.split("/").pop() ?? "";
  if (outside && /^\.env($|\.)/.test(base) && !/\.(example|sample|template)$/.test(base)) return true;
  return false;
}

/**
 * Sessiya "hammasiga ha" (a) bilan ishonchli deb belgilanishi mumkin bo'lgan
 * papkami? Faqat ish papkasi ICHIDA; uy papkasi, disk ildizi yoki himoyalangan
 * yo'l hech qachon emas.
 */
export function isTrustableDir(p) {
  if (!p) return false;
  const r = resolvePath(p);
  if (r.outside) return false;
  if (dirname(r.real) === r.real) return false; // disk ildizi (C:\ yoki /)
  if (homeDirs().includes(norm(r.real))) return false;
  if (isProtected(r.real, { write: true, outside: false })) return false;
  return true;
}

function outsideNote(r) {
  return r.outside ? c.amber("⚠️  ish papkasidan TASHQARIDA — ") : "";
}

// ---- Buyruq klassifikatori -----------------------------------------------

/**
 * Faqat HAQIQATAN o'qish-uchun buyruqlar "safe" (vibe/--yes/"a" bilan avtomatik
 * bajarilishi mumkin). Qolgan HAMMASI — interpretatorlar, paket menejerlari,
 * tarmoq, docker, fayl o'zgartiruvchilar — "risky": har doim tasdiq so'raladi.
 */
const SAFE_READONLY = new Set(["ls", "dir", "pwd", "echo", "cat", "type", "head", "tail", "wc", "grep", "which", "where", "whoami"]);
/** Faqat `<tool> --version` ko'rinishida xavfsiz. */
const VERSION_ONLY = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "bun", "deno", "python", "python3", "py", "pip", "pip3",
  "go", "cargo", "rustc", "git", "tsc", "docker", "java", "dotnet", "gcc", "make",
]);
const GIT_READONLY = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "blame", "describe", "shortlog"]);
/** git'ning fayl yozuvchi yoki tashqi dastur chaqiruvchi opsiyalari. */
const GIT_BAD_ARG = /^(--output|--ext-diff|--textconv|--exec|--upload-pack|--receive-pack|--config-env|-c$|-o$)/i;

// Shell metasimvollari: zanjir, subshell, yo'naltirish, o'zgaruvchi (sh/cmd), uy (~), brace, escape.
// Glob belgilari (*?[]) ham — sh (POSIX) hamda cmd `type`/`dir` va Git-for-Windows'ning
// MSYS cat/grep'i (Windows) ularni o'zi kengaytiradi: tekshiruv literal tokenni ko'radi,
// kengaytirilgan nom esa symlink orqali ish papkasidan tashqaridagi faylni o'qishi mumkin.
const RISKY_CHARS = IS_WIN ? /[;&|$()`<>\n\r~%^@{}!,*?[\]]/ : /[;&|$()`<>\n\r~%^@{}!\\*?[\]]/;

const HARD_BLOCKED = [
  /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\$HOME)/i,
  /:\(\)\s*\{\s*:\|:&\s*\}/,           // fork bomb
  /\bmkfs\b/, /\bdd\s+if=/, /\bshred\b/,
  /\bformat(\.com)?\s+[a-z]:/i,
  /\b(rd|rmdir)\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i,
  /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(sh|bash|zsh|python\d?|node|iex|invoke-expression|powershell|pwsh)\b/i, // pipe-to-shell
  /\b(nc|ncat|socat)\b.*\s-e\s/i,      // reverse shell
  /\/etc\/(passwd|shadow|sudoers)/,
  // Sir/kalit joylari — buyruq orqali ham tegilmaydi.
  /(^|[\s"'=\\/])\.(ssh|aws|azure|kube|docker|gnupg|sovereign)([\\/\s"']|$)/i,
  /\.(git-credentials|npmrc|pypirc|netrc|gitconfig|bashrc|zshrc|bash_profile|zprofile)\b/i,
  /\.config[\\/](gh|gcloud|git)\b/i,
  /(google[\\/]chrome|microsoft[\\/]edge|bravesoftware|mozilla|firefox)[\\/]/i,
  /\b(windows)?powershell[\\/].*profile|profile\.ps1/i,
];

function stripQuotes(t) {
  return t.replace(/["']/g, "");
}

/** Token ichidagi mumkin bo'lgan yo'l bo'laklari (`--out=/x`, `-f/x`, `a,b`). */
function pathCandidates(tok) {
  const out = new Set([tok]);
  for (const part of tok.split(/[=,;]/)) if (part) out.add(part);
  // Yopishgan opsiya qiymati (`-f/x`, `-o../y`) — faqat opsiya ko'rinishidagi tokenda.
  // Oddiy nisbiy yo'l ("src/a.ts") bo'lagi ("/a.ts") absolyut deb olinib, noto'g'ri
  // "tashqarida" bo'lmasin — u yuqorida butunligicha tekshiriladi.
  const sepIdx = tok.search(/[\\/.]/);
  if (sepIdx > 0 && /^[-+]/.test(tok)) out.add(tok.slice(sepIdx));
  const drive = tok.search(/[a-z]:/i);
  if (drive > 0) out.add(tok.slice(drive));
  return [...out];
}

function looksLikePath(p) {
  return (
    isAbsolute(p) || win32.isAbsolute(p) || posix.isAbsolute(p) ||
    /^[a-z]:/i.test(p) || isUnc(p) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(p)
  );
}

/** Argumentlardan biri ish papkasidan tashqariga yoki himoyalangan joyga ishora qiladimi? */
function argsEscape(cmdName, argv) {
  for (const raw of argv) {
    const tok = stripQuotes(raw);
    if (!tok) continue;
    // Windows `dir /b /s` kabi kalitlar yo'l emas.
    if (IS_WIN && cmdName === "dir" && /^\/[a-z?-]{1,3}$/i.test(tok)) continue;
    for (const cand of pathCandidates(tok)) {
      if (!cand || cand === "-" || cand === "--") continue;
      if (IS_WIN && /^[a-z]:(?![\\/])/i.test(cand)) return "Diskka nisbiy yo'l (C:foo)";
      if (cand.startsWith("-") && !looksLikePath(cand)) continue; // oddiy opsiya
      // Nisbiy nomlar ham yechiladi — ish papkasidagi symlink tashqariga olib chiqishi mumkin.
      const r = resolvePath(cand);
      if (r.outside) return `Ish papkasidan tashqaridagi yo'l: ${cand}`;
      if (isProtected(r.real)) return `Himoyalangan yo'l: ${cand}`;
    }
  }
  return null;
}

/**
 * Buyruqni tasniflaydi:
 *  - "blocked" — hech qachon bajarilmaydi;
 *  - "risky"   — HAR DOIM tasdiq (--yes / vibe / "a" ham o'tkazib yubormaydi);
 *  - "safe"    — faqat-o'qish; vibe/--yes/"a" bilan avtomatik bo'lishi mumkin.
 */
export function classifyCommand(command) {
  const cmd = String(command ?? "");
  for (const re of HARD_BLOCKED) if (re.test(cmd)) return { level: "blocked", reason: `Xavfli naqsh: ${re}` };
  if (!cmd.trim()) return { level: "risky", reason: "Bo'sh buyruq" };
  if (RISKY_CHARS.test(cmd)) return { level: "risky", reason: "Shell metasimvoli (zanjir/yo'naltirish/o'zgaruvchi)" };

  const argv = cmd.trim().split(/\s+/);
  const name = stripQuotes(argv[0]);
  const lname = IS_WIN ? name.toLowerCase() : name;
  const rest = argv.slice(1);

  // Birinchi so'z yo'l bo'lmasligi kerak (./ls, /tmp/x/cat ...).
  if (/[\\/]/.test(name)) return { level: "risky", reason: "Dastur yo'l orqali chaqirilgan" };

  let known = false;
  if (VERSION_ONLY.has(lname) && rest.length === 1 && ["--version", "-v", "-V"].includes(stripQuotes(rest[0]))) {
    return { level: "safe", reason: "" };
  }
  if (lname === "go" && rest.length === 1 && rest[0] === "version") return { level: "safe", reason: "" };

  if (lname === "git") {
    const sub = stripQuotes(rest[0] ?? "");
    if (!GIT_READONLY.has(sub)) return { level: "risky", reason: `git ${sub || ""} — faqat-o'qish emas`.trim() };
    if (rest.slice(1).some((a) => GIT_BAD_ARG.test(stripQuotes(a)))) return { level: "risky", reason: "git: fayl yozuvchi/tashqi dastur opsiyasi" };
    known = true;
  } else if (SAFE_READONLY.has(lname)) {
    if (lname === "grep" && rest.some((a) => /^(-[a-zA-Z]*R|--dereference-recursive)/.test(stripQuotes(a)))) {
      return { level: "risky", reason: "grep -R symlinklarga ergashadi" };
    }
    known = true;
  }
  if (!known) return { level: "risky", reason: `Faqat-o'qish ro'yxatida yo'q: ${name}` };

  const esc = argsEscape(lname, rest);
  if (esc) return { level: "risky", reason: esc };
  return { level: "safe", reason: "" };
}

/**
 * FULL AUTO rejimida ham bajarilmaydigan (lekin so'ralmaydigan — darhol rad
 * etiladigan) buyruqlar: kodni tashqariga chiqaradigan yoki tizimni o'zgartiradigan
 * amallar. Ish papkasi ichidagi yozish/test/o'rnatish esa tasdiqsiz bajariladi.
 */
// Dastur nomidan keyin .exe/.cmd/.ps1 va oraliq flaglar bo'lishi mumkin (`git.exe -c x push`,
// `npm.cmd publish`) — shuning uchun fe'l shu buyruq bo'lagining ISTALGAN joyida qidiriladi
// (xato-musbat xavfsiz tomonga: ortiqcha rad etiladi, o'tkazib yuborilmaydi).
const SEG = String.raw`[^\n;&|]*`;
const EXE = String.raw`(?:\.exe|\.cmd|\.bat|\.ps1)?`;
const FULL_AUTO_DENY = [
  [new RegExp(String.raw`\bgit${EXE}\b${SEG}(?:^|\s)push(?:\s|$)`, "i"), "git push"],
  [new RegExp(String.raw`\bgit${EXE}\b${SEG}\bremote\b${SEG}\b(add|set-url)\b`, "i"), "git remote"],
  [new RegExp(String.raw`\bgit${EXE}\b${SEG}(?:^|\s)-c\s+\S*(credential|extraheader|sshcommand|askpass)`, "i"), "git credential/header"],
  [new RegExp(String.raw`\b(npm|pnpm|yarn|bun|npx)${EXE}\b${SEG}(?:^|\s)(publish|unpublish|login|logout|adduser|token|owner|deprecate|dist-tag)(?:\s|$)`, "i"), "paket nashri / npm akkaunt"],
  [new RegExp(String.raw`\b(npm|pnpm|yarn|bun)${EXE}\s+(?:run\s+)?(deploy|release|publish)\b`, "i"), "deploy/release skripti"],
  // Bu CLI'lar standart holatda ham deploy qiladi (`npx vercel` — preview deploy).
  [new RegExp(String.raw`\b(vercel|netlify|railway|heroku|wrangler|flyctl|fly|surge|gh|amplify|now)${EXE}\b`, "i"), "deploy / GitHub CLI"],
  [new RegExp(String.raw`\b(firebase|supabase)${EXE}\b${SEG}\b(deploy|login|secrets?|push|link)\b`, "i"), "deploy / sir"],
  [/(?:^|\s)--prod(?:uction)?\b/i, "--prod"],
  [new RegExp(String.raw`\b(sudo|su|doas|runas|gsudo)${EXE}\b`, "i"), "admin huquqi"],
  [new RegExp(String.raw`\b(shutdown|reboot|halt|poweroff|setx|bcdedit|diskpart|schtasks|crontab|launchctl|systemctl|reg${EXE}\s+(add|delete|import))\b`, "i"), "tizim sozlamasi"],
  [new RegExp(String.raw`\b(docker|podman)${EXE}\b${SEG}(?:^|\s)(login|push)(?:\s|$)`, "i"), "registry login/push"],
  // Tarmoq orqali fayl/ma'lumot uzatish (kodni tashqariga chiqarish yo'li).
  [new RegExp(String.raw`\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|scp|sftp|ftp|rsync|ssh|nc|ncat|socat|telnet)${EXE}\b`, "i"), "tarmoq uzatish"],
  // Kodlangan/yashirin buyruq — matn tekshiruvini chetlab o'tadi.
  [new RegExp(String.raw`\b(powershell|pwsh)${EXE}\b${SEG}\s-(e|ec|en|enc|encodedcommand)\b`, "i"), "kodlangan PowerShell"],
  [/\b(base64|certutil)\b[^\n]*(-d\b|--decode|-decode)/i, "kodlangan buyruq"],
];

/**
 * Buyruq matnidagi yo'llar ish papkasidan TASHQARIGA yoki himoyalangan joyga
 * olib chiqadimi (Full auto uchun — faqat-o'qish ro'yxatida bo'lmagan buyruqlar
 * uchun ham). Sabab yoki null.
 */
function commandPathEscape(cmd) {
  if (/(^|[\s"'=(])~([\\/\s"']|$)/.test(cmd)) return "uy papkasi (~)";
  if (/\$(\{?HOME\b|env:|\{?USERPROFILE\b|\{?APPDATA\b)|%[A-Z_]+%/i.test(cmd)) return "muhit o'zgaruvchisi orqali yo'l";
  for (const raw of cmd.split(/[\s;&|<>()"'`,]+/)) {
    const tok = raw.trim();
    if (!tok || tok.includes("://")) continue; // URL — yo'l emas
    if (IS_WIN && /^\/[a-z?]{1,3}$/i.test(tok)) continue; // Windows kaliti (/c, /s, /b)
    for (const cand of pathCandidates(tok)) {
      if (!cand || cand === "-" || cand === "--") continue;
      if (cand.startsWith("-") && !looksLikePath(cand)) continue;
      if (!looksLikePath(cand) && !/[\\/]/.test(cand)) continue; // oddiy so'z
      let r;
      try {
        r = resolvePath(cand);
      } catch {
        return `noto'g'ri yo'l: ${cand}`;
      }
      if (r.outside) return `ish papkasidan tashqarida: ${cand}`;
      if (isProtected(r.real)) return `himoyalangan yo'l: ${cand}`;
    }
  }
  return null;
}

/**
 * FULL AUTO — foydalanuvchi o'zi yoqqan rejim: ish papkasi ichidagi amallar tasdiqsiz
 * bajariladi. Model vazifani oxirigacha (test o'tguncha) olib borishi kerak.
 * Faqat so'rov vaqtida qo'shiladi — sessiya tarixiga yozilmaydi.
 */
export const FULL_AUTO_RULE = [
  "FULL AUTO REJIM YOQIQ: foydalanuvchi har amalni tasdiqlamaydi — ish papkasi ichidagi fayl yozish, papka yaratish, paket o'rnatish va test/build buyruqlari DARHOL bajariladi.",
  "Vazifani OXIRIGACHA olib bor: kod yoz → ishga tushir yoki testla → xato bo'lsa sababini o'qib tuzat → qayta tekshir. Test/build o'tmaguncha 'tayyor' dema. Foydalanuvchiga savol berma — oqilona standart tanla.",
  "YAKUNLASHDAN OLDIN foydalanuvchi talablarini BITTALAB solishtir (sonlar — mas. 'kamida 6 ta test', fayl nomlari va joyi, funksiya nomlari, skriptlar): kerak bo'lsa faylni qayta o'qi yoki test chiqishidagi sonni tekshir. Birortasi bajarilmagan bo'lsa — tuzat; tuzatib bo'lmasa, xulosada ochiq ayt.",
  "Ish papkasidan TASHQARIDAGI yo'llar, git push, npm publish, deploy, sudo va tizim sozlamalari bu rejimda AVTOMATIK RAD ETILADI — ularga urinma; kerak bo'lsa oxirida foydalanuvchiga qo'lda qilishni ayt.",
  "Interaktiv kiritish kutadigan buyruqlardan qoch (stdin yopiq): `--yes`/`-y`, `CI=1` kabi interaktivsiz variantlarni ishlat; dev-serverlarni (to'xtamaydigan jarayonlar) ishga tushirma.",
].join(" ");

/** Model "davom etaman" deb vositasiz to'xtagan bo'lsa (uz lotin/kirill, ru, en). */
const CONTINUE_INTENT =
  /(tekshiraman|tuzataman|boshlayman|davom etaman|ko'rib chiqaman|yozaman|qayta urinaman|текшираман|тузатаман|бошлайман|давом этаман|проверю|исправлю|сейчас (посмотрю|исправлю)|продолжу|let me|i'll (check|fix|try|now)|i will (check|fix|try|now)|next,? i)/i;

/** Ishga tushirib tekshirsa bo'ladigan kod fayllari (hujjat/konfiguratsiya emas). */
const CODE_EXT = /\.(m?[jt]sx?|cjs|cts|mts|py|go|rs|java|kt|rb|php|cs|cpp|cc|c|h|hpp|swift|dart|vue|svelte|lua|sh|ps1)$/i;
/** Test/build natijasiga ta'sir qiladigan konfiguratsiya fayllari (package.json, tsconfig...). */
const BUILD_CONFIG = /(^|[\\/])(package\.json|tsconfig[^\\/]*\.json|pyproject\.toml|setup\.cfg|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?)$/i;
/** Yozilgandan keyin test/build natijasini eskirtiradigan fayl. */
export function isCodeFile(path) {
  const p = String(path ?? "");
  return CODE_EXT.test(p) || BUILD_CONFIG.test(p);
}

/** Full auto'da bir navbatdagi avtomatik "davom et" eslatmalari chegarasi. */
export const FULL_AUTO_MAX_NUDGES = 3;

/**
 * FULL AUTO: model vositasiz javob bilan to'xtaganda — vazifa haqiqatan tugaganmi?
 * Oxirgi buyruq xato bilan tugagan yoki model "tekshiraman" deb to'xtagan bo'lsa,
 * modelga beriladigan eslatma matni; aks holda null (navbat tugaydi).
 */
export function fullAutoNudge(entries, finalText, state = {}) {
  const list = entries ?? [];
  const lastCmd = [...list].reverse().find((e) => e.tool === "run_command" && e.status !== "declined" && e.status !== "skipped");
  // Kod o'zgartirildi, lekin keyin hech narsa ishga tushirilmadi — bir marta "tekshir" deymiz.
  const ranIdx = lastCmd ? list.lastIndexOf(lastCmd) : -1;
  const codeWriteIdx = list.findLastIndex((e) => e.tool === "write_file" && e.status === "ok" && isCodeFile(e.target));
  if (codeWriteIdx > ranIdx && !state.verifyNudged) {
    state.verifyNudged = true;
    return "[Avtomatik eslatma — FULL AUTO] Kodni o'zgartirding, lekin undan keyin hech narsa ishga tushirmading. Loyihada test yoki build bo'lsa — hozir ishga tushir va natijaga qarab tuzat; bo'lmasa kodni qisqa ishga tushirib tekshir. Tekshirib bo'lmasa — buni ochiq ayt. Tekshirmay turib 'testlar o'tdi' dema.";
  }
  // "Testlar o'tdi" deyilgan, lekin jurnal buni tasdiqlamaydi (test yo'q / eskirgan / yiqilgan) —
  // yakuniy ogohlantirish (testClaimIssue) bilan bir xil mezon; bir marta qayta tekshirtiramiz.
  const claim = !state.claimNudged ? testClaimIssue(finalText, list) : null;
  if (claim) {
    state.claimNudged = true;
    return `[Avtomatik eslatma — FULL AUTO] ${testClaimText(claim)} Test/build buyrug'ini HOZIR qayta ishga tushir va natijaga qarab xulosa yoz; tekshirib bo'lmasa — 'testlar o'tdi' dema, buni ochiq ayt.`;
  }
  if (lastCmd?.status === "failed") {
    return (
      `[Avtomatik eslatma — FULL AUTO] Vazifa hali tugamagan: oxirgi buyruq \`${lastCmd.target}\` xato bilan tugadi` +
      (lastCmd.exit != null ? ` (exit ${lastCmd.exit})` : "") +
      (lastCmd.detail ? `: ${lastCmd.detail}` : "") +
      ". To'xtama va savol berma: xato sababini o'qi, tuzat va buyruqni qayta ishga tushir. Tuzatib bo'lmasa — nima uchunligini ochiq aytib yakunla."
    );
  }
  if (CONTINUE_INTENT.test(String(finalText ?? "").slice(-300))) {
    return "[Avtomatik eslatma — FULL AUTO] Sen davom etishingni aytding, lekin vosita chaqirmading. Hozir kerakli vositani chaqir; ish haqiqatan tugagan bo'lsa — vosita natijalari tasdiqlagan yakuniy xulosani yoz.";
  }
  return null;
}

/** FULL AUTO'da ham rad etiladigan buyruq bo'lsa — sababi (o'zbekcha), aks holda null. */
export function fullAutoDenyReason(command) {
  const cmd = String(command ?? "");
  // Bo'shliqli qo'shtirnoq ichidagi matn (commit xabari va h.k.) — argument, fe'l emas;
  // qolgan qo'shtirnoqlar olib tashlanadi (`git "push"` = `git push`).
  const verbs = cmd.replace(/"[^"]*\s[^"]*"|'[^']*\s[^']*'/g, " _ ").replace(/["']/g, "");
  for (const [re, why] of FULL_AUTO_DENY) if (re.test(verbs)) return why;
  return commandPathEscape(cmd);
}

/** OpenAI-style tool schema advertised to the model. */
export const TOOL_SCHEMA = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "Papkadagi fayl va papkalar ro'yxatini beradi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Papka yo'li (default: joriy)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Fayl tarkibini o'qiydi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Faylga yozadi (kerak bo'lsa papkalarni ham yaratadi). Mavjud faylni almashtiradi. Ish papkasidan tashqaridagi yo'l ham mumkin — foydalanuvchidan ruxsat so'raladi.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_dir",
      description: "Papka yaratadi (ichma-ich). Ish papkasidan tashqaridagi yo'l ham mumkin — foydalanuvchidan ruxsat so'raladi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Terminal buyrug'ini ish papkasida bajaradi (foydalanuvchi tasdig'i bilan).",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
];

function tree(dir, prefix = "", depth = 0, max = 2) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir).filter((e) => e !== "node_modules" && e !== ".git" && !e.startsWith(".next"));
  } catch {
    return "";
  }
  entries.sort();
  for (const e of entries) {
    const full = join(dir, e);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      /* ignore */
    }
    out.push(`${prefix}${isDir ? "📁 " : "   "}${e}`);
    if (isDir && depth < max) out.push(tree(full, prefix + "  ", depth + 1, max));
  }
  return out.filter(Boolean).join("\n");
}

/**
 * Runs one tool call. `confirm(question)` must return a boolean promise for
 * side-effectful ops (write_file, make_dir, run_command).
 */
/**
 * Keyinroq avtomatik ishga tushadigan fayllar: prompt-injection orqali agent
 * shularga yozsa, kod foydalanuvchi keyingi `npm install`, VS Code task yoki
 * git commit'da bajarilib ketadi. Ish papkasi ichida bo'lsa ham tasdiq kerak.
 */
const AUTO_RUN_FILES = new Set([
  "package.json", ".npmrc", ".yarnrc", ".yarnrc.yml", "makefile", "justfile",
  "taskfile.yml", "taskfile.yaml", ".envrc", "pyproject.toml", "setup.py", "setup.cfg",
  ".pre-commit-config.yaml", "lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".gitlab-ci.yml",
  // pnpm/bun install va run'da, IDE loyiha importida (Gradle/Maven/MSBuild, rust-analyzer
  // build.rs), mise papkaga kirganda, Codespaces/Gitpod ochilganda bajariladi.
  ".pnpmfile.cjs", "bunfig.toml", ".devcontainer.json", ".gitpod.yml",
  "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "gradlew", "mvnw", "pom.xml",
  "directory.build.props", "directory.build.targets", "build.rs", ".mise.toml", "mise.toml",
]);
const AUTO_RUN_DIRS = [".vscode", ".idea", ".github", ".husky", ".devcontainer", ".circleci", ".gitlab", ".claude", ".cargo", ".mvn", ".mise"];
/** IDE/linter/git-hook avtomatik yuklaydigan konfiglar (eslint.config.mjs, .prettierrc.js, lint-staged ...). */
const AUTO_RUN_CONFIG = /^(eslint\.config\.|\.eslintrc|prettier\.config\.|\.prettierrc|stylelint\.config\.|\.stylelintrc|lint-staged\.config\.|\.lintstagedrc|commitlint\.config\.|\.commitlintrc|tailwind\.config\.)/;
/** Windows'da nomi bilan chaqirilsa ishga tushadigan fayllar (git.bat, npm.cmd ...). */
const EXEC_EXT = /\.(bat|cmd|com|exe|ps1|psm1|vbs|vbe|wsf|wsh|msc|cpl|scr|lnk)$/;
function isAutoRunPath(real) {
  const rel = relative(process.cwd(), real).split(sep).join("/").toLowerCase();
  const parts = rel.split("/");
  const base = parts[parts.length - 1] ?? "";
  if (AUTO_RUN_FILES.has(base) || base.startsWith(".env") || AUTO_RUN_CONFIG.test(base) || EXEC_EXT.test(base)) return true;
  // Istalgan chuqurlikda (apps/web/.vscode/tasks.json ham).
  return parts.some((seg) => AUTO_RUN_DIRS.includes(seg));
}

const COMMAND_TIMEOUT_MS = 120_000;

/** Ishlab turgan buyruqlar — CLI chiqib ketsa (ikkinchi Ctrl+C) ular ham to'xtatiladi. */
const RUNNING = new Set();
let exitHook = false;
function track(child) {
  RUNNING.add(child);
  child.once("exit", () => RUNNING.delete(child));
  if (!exitHook) {
    exitHook = true;
    process.once("exit", () => {
      for (const ch of RUNNING) killTree(ch);
    });
  }
}

/**
 * Buyruqni butun jarayon daraxti bilan to'xtatadi (shell + uning bolalari:
 * npm, node, ping...). Windows'da taskkill ABSOLYUT yo'l bilan — ish papkasidagi
 * soxta taskkill.exe ishga tushmasin.
 */
function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (IS_WIN) {
      const sys = process.env.SystemRoot || process.env.windir || "C:\\Windows";
      const k = spawn(join(sys, "System32", "taskkill.exe"), ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      k.on("error", () => child.kill());
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill();
    } catch {
      /* allaqachon tugagan */
    }
  }
}

/** Model yuborgan matnni terminalda xavfsiz ko'rsatish: boshqaruv belgilari ko'rinadigan bo'ladi. */
export function visible(s) {
  return String(s ?? "").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (ch) => "\\x" + ch.charCodeAt(0).toString(16).padStart(2, "0"));
}

/**
 * @param {string} name
 * @param {object} args
 * @param {(question: string, forcePrompt?: boolean, meta?: object) => Promise<boolean>} confirm
 * @param {{ signal?: AbortSignal }} [opts]  ixtiyoriy: Ctrl+C bilan run_command'ni to'xtatish
 */
export async function runTool(name, args, confirm, opts = {}) {
  switch (name) {
    case "list_dir": {
      const r = resolvePath(args.path ?? ".");
      if (isProtected(r.real, { outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l, ochilmaydi.`;
      if (r.outside) {
        const ok = await confirm(`${outsideNote(r)}ro'yxat ko'rilsinmi: ${c.white(r.real)}?`, /*forcePrompt=*/ true, { tool: "list_dir", path: r.real, dir: true, outside: true });
        if (!ok) return "Foydalanuvchi rad etdi (ish papkasidan tashqaridagi papka).";
      }
      return tree(r.real) || "(bo'sh)";
    }
    case "read_file": {
      const r = resolvePath(args.path);
      if (isProtected(r.real, { outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l (kalit/parol/tizim), o'qilmaydi.`;
      if (r.outside) {
        const ok = await confirm(`${outsideNote(r)}o'qilsinmi: ${c.white(r.real)}?`, /*forcePrompt=*/ true, { tool: "read_file", path: r.real, outside: true });
        if (!ok) return "Foydalanuvchi rad etdi (ish papkasidan tashqaridagi fayl).";
      }
      if (!existsSync(r.real)) return `XATO: "${args.path}" topilmadi.`;
      const content = readFileSync(r.real, "utf8");
      return content.length > 60_000 ? content.slice(0, 60_000) + "\n... (qisqartirildi)" : content;
    }
    case "write_file": {
      const r = resolvePath(args.path);
      // Ishga tushganda kod bajaradigan fayllar (npm skriptlari, VS Code tasks, CI,
      // git hooks, .env) — vibe/"a" rejimida ham HAR DOIM so'raladi.
      const autoRun = !r.outside && isAutoRunPath(r.real);
      if (isProtected(r.real, { write: true, outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l (kalit/parol/tizim/git hook), yozilmaydi.`;
      const exists = existsSync(r.real);
      const ok = await confirm(
        `${outsideNote(r)}${exists ? "Almashtirilsinmi" : "Yaratilsinmi"}: ${c.white(visible(r.outside ? r.real : args.path))} (${(args.content ?? "").length} belgi)?`,
        /*forcePrompt=*/ r.outside || autoRun,
        { tool: "write_file", path: r.outside ? r.real : args.path, content: args.content ?? "", exists, outside: r.outside, autoRun },
      );
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(dirname(r.real), { recursive: true });
      writeFileSync(r.real, args.content ?? "");
      console.log(`  ${c.green(exists ? "✎ o'zgartirildi" : "＋ yaratildi")} ${c.dim(r.outside ? r.real : args.path)}`);
      return `OK: ${args.path} yozildi.`;
    }
    case "make_dir": {
      const r = resolvePath(args.path);
      if (isProtected(r.real, { write: true, outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l, yaratilmaydi.`;
      const ok = await confirm(
        `${outsideNote(r)}Papka yaratilsinmi: ${c.white(visible(r.outside ? r.real : args.path))}?`,
        /*forcePrompt=*/ r.outside,
        { tool: "make_dir", path: r.outside ? r.real : args.path, dir: true, outside: r.outside },
      );
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(r.real, { recursive: true });
      console.log(`  ${c.green("📁 yaratildi")} ${c.dim(r.outside ? r.real : args.path)}`);
      return `OK: ${args.path} papkasi yaratildi.`;
    }
    case "run_command": {
      const cls = classifyCommand(args.command ?? "");
      // Terminal boshqaruv belgilari (ESC va h.k.) tasdiq oynasida ko'rinadigan buyruqni
      // soxtalashtirishi mumkin — bunday buyruq umuman bajarilmaydi.
      if (/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(args.command ?? "")) {
        return "XATO: Buyruqda terminal boshqaruv belgilari bor — xavfsizlik uchun bajarilmaydi.";
      }
      if (cls.level === "blocked") {
        return `XATO: Bu buyruq xavfli sifatida bloklandi (${cls.reason}). Boshqa yechim ishlab bering.`;
      }
      // Faqat "safe" (faqat-o'qish) buyruq avtomatik tasdiqlanishi mumkin;
      // "risky" — `--yes`, vibe yoki "a" bilan ham HAR DOIM so'raladi.
      const label =
        cls.level === "safe"
          ? `Buyruq bajarilsinmi: ${c.amber(visible(args.command))}?`
          : `⚠️  ${cls.reason.toUpperCase()} — bajarilsinmi: ${c.amber(visible(args.command))}?`;
      const cmdMeta = { tool: "run_command", command: args.command, risky: cls.level !== "safe" };
      const ok = cls.level === "safe"
        ? await confirm(label, false, cmdMeta)
        : await confirm(label, /*forcePrompt=*/ true, cmdMeta);
      if (!ok) return "Foydalanuvchi rad etdi.";
      if (opts.signal?.aborted) return "XATO (exit ?):\nBekor qilindi (Ctrl+C) — buyruq ishga tushirilmadi.";
      // Asinxron (exec) — spinner va Ctrl+C ishlaydi; natija formati execSync bilan bir xil.
      return await new Promise((resolveRun) => {
        let child;
        let stopReason = null; // "abort" | "timeout"
        let timer = null;
        const onAbort = () => {
          stopReason ??= "abort";
          killTree(child);
        };
        try {
          child = exec(
            args.command,
            {
              cwd: process.cwd(),
              encoding: "utf8",
              maxBuffer: 16 * 1024 * 1024,
              windowsHide: true,
              // POSIX: alohida jarayon guruhi — bekor qilinganda butun daraxt to'xtaydi.
              detached: !IS_WIN,
              // Windows cmd.exe buyruqni avval JORIY papkadan qidiradi — agent yaratgan
              // git.bat "xavfsiz" git status o'rniga ishga tushmasin.
              env: IS_WIN ? { ...process.env, NoDefaultCurrentDirectoryInExePath: "1" } : process.env,
            },
            (err, stdout, stderr) => {
              clearTimeout(timer);
              opts.signal?.removeEventListener("abort", onAbort);
              if (!err && !stopReason) return resolveRun(`EXIT 0\n${String(stdout ?? "").slice(0, 20_000)}`);
              const code = typeof err?.code === "number" ? err.code : "?";
              const why =
                stopReason === "abort"
                  ? "Bekor qilindi (Ctrl+C) — jarayon to'xtatildi."
                  : stopReason === "timeout"
                    ? "Vaqt tugadi (120 s) — jarayon to'xtatildi."
                    : String(stderr ?? "") || err?.message || "";
              resolveRun(`XATO (exit ${code}):\n${String(stdout ?? "") + why}`.slice(0, 20_000));
            },
          );
        } catch (err) {
          return resolveRun(`XATO (exit ?):\n${err?.message ?? err}`);
        }
        track(child);
        timer = setTimeout(() => {
          stopReason ??= "timeout";
          killTree(child);
        }, COMMAND_TIMEOUT_MS);
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        // execSync kabi: stdin darhol yopiladi — kiritish kutuvchi buyruq osilib qolmasin.
        child.stdin?.end();
      });
    }
    default:
      return `Noma'lum vosita: ${name}`;
  }
}

// ---- Harakatlar jurnali (action ledger) ----------------------------------
// Model "yaratdim/bajardim" deyishi mumkin, lekin haqiqatni faqat vosita
// natijasi biladi. Jurnal har bir chaqiruvni natija matnidan (runTool qaytaradigan
// aniq prefikslar: "OK:", "EXIT 0", "XATO", "Foydalanuvchi rad etdi") tasniflaydi.
// Bu deterministik — modelga ishonmaydi.

/**
 * "Bajardim" deb aytib, aslida bajarmaslikka qarshi system-prompt qoidasi.
 * CLI (agent.mjs) va desktop (main.mjs) shu bitta matndan foydalanadi.
 */
export const HONESTY_RULE = [
  "HAQQONIYLIK (QAT'IY): faqat vosita natijasi tasdiqlagan amalni 'bajardim/yaratdim/yozdim/ishga tushirdim' deb ayt.",
  "Har bir vosita natijasi boshida [HOLAT: ...] belgisi bor: BAJARILDI bo'lmasa (XATO, RAD ETILDI, TAKROR) — o'sha amal BAJARILMAGAN; buni foydalanuvchiga ochiq ayt va muvaffaqiyat deb ko'rsatma.",
  "Vositani chaqirmasdan turib fayl yozdim, buyruq bajardim yoki test o'tdi dema. Buyruq exit kodi 0 bo'lmasa — u muvaffaqiyatsiz.",
  "[SOVEREIGN TIZIM JURNALI] bloki tizim tomonidan qo'shiladi va haqiqiy natijalarni ko'rsatadi — yakuniy xulosang unga zid bo'lmasin.",
  "'Testlar o'tdi / build ishladi' faqat test yoki build buyrug'i SHU navbatda, kodni OXIRGI o'zgartirgandan KEYIN exit 0 bilan tugagan bo'lsa ayt; aks holda testni qayta ishga tushir yoki 'tekshirilmadi' deb ochiq ayt.",
].join(" ");

/**
 * Buyruq yiqilganda — dasturchi bo'lmagan foydalanuvchi ham tushunsin (CLI va desktop SYSTEM).
 */
export const FAILURE_EXPLAIN_RULE =
  "Buyruq (run_command) xato bilan tugasa, tuzatishdan OLDIN foydalanuvchiga uning tilida 1-2 ta ODDIY gap bilan (texnik atamasiz, dasturchi bo'lmagan odam tushunadigan qilib) nima noto'g'ri ketganini va nima qilmoqchi ekaningni tushuntir — xato matnini ko'chirib qo'yma; keyin tuzat.";

/** Diskda yoki tizimda iz qoldiradigan vositalar. */
export const SIDE_EFFECT_TOOLS = new Set(["write_file", "make_dir", "run_command"]);

/**
 * Vosita natijasining holati:
 *  "ok" — bajarildi; "failed" — xato (bajarilmadi yoki exit≠0);
 *  "declined" — foydalanuvchi rad etdi (bajarilmadi).
 */
export function toolStatus(name, result) {
  const r = String(result ?? "");
  if (/^Foydalanuvchi rad etdi/.test(r)) return "declined";
  if (/^XATO\b/.test(r) || /^Noma'lum vosita/.test(r)) return "failed";
  if (name === "run_command") return /^EXIT 0\b/.test(r) ? "ok" : "failed";
  if (name === "write_file" || name === "make_dir") return /^OK:/.test(r) ? "ok" : "failed";
  return "ok";
}

const oneLine = (s, max = 120) => {
  const t = visible(String(s ?? "")).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

/** Bitta jurnal yozuvi. `status` berilsa (mas. "skipped") natijadan hisoblanmaydi. */
export function ledgerEntry(name, args, result, status = toolStatus(name, result)) {
  const a = args ?? {};
  const target = name === "run_command" ? oneLine(a.command) : oneLine(a.path ?? ".");
  const r = String(result ?? "");
  let exit = null;
  if (name === "run_command") {
    const m = /^EXIT (\d+)/.exec(r) ?? /^XATO \(exit ([^)]+)\)/.exec(r);
    if (m) exit = m[1];
  }
  const detail = status === "failed" ? oneLine(r.replace(/^XATO(\s*\(exit [^)]+\))?:?\s*/, ""), 160) : "";
  return { tool: name, target, status, exit, detail };
}

/** Modelga yuboriladigan natija boshiga qo'yiladigan aniq holat belgisi. */
export function statusTag(status) {
  switch (status) {
    case "ok":
      return "[HOLAT: BAJARILDI]";
    case "declined":
      return "[HOLAT: RAD ETILDI — bu amal BAJARILMADI]";
    case "skipped":
      return "[HOLAT: TAKROR — qayta bajarilmadi]";
    default:
      return "[HOLAT: XATO — bu amal BAJARILMADI yoki muvaffaqiyatsiz tugadi]";
  }
}

const ACTION_VERB = {
  write_file: { ok: "fayl yozildi", failed: "fayl YOZILMADI (xato)", declined: "fayl YOZILMADI (rad etildi)", skipped: "fayl — takror chaqiruv, o'tkazib yuborildi" },
  make_dir: { ok: "papka yaratildi", failed: "papka YARATILMADI (xato)", declined: "papka YARATILMADI (rad etildi)", skipped: "papka — takror chaqiruv, o'tkazib yuborildi" },
  run_command: { ok: "buyruq bajarildi", failed: "buyruq MUVAFFAQIYATSIZ", declined: "buyruq BAJARILMADI (rad etildi)", skipped: "buyruq — takror chaqiruv, o'tkazib yuborildi" },
  read_file: { ok: "o'qildi", failed: "o'qilmadi (xato)", declined: "o'qilmadi (rad etildi)", skipped: "takror o'qish" },
  list_dir: { ok: "ko'rildi", failed: "ko'rilmadi (xato)", declined: "ko'rilmadi (rad etildi)", skipped: "takror ko'rish" },
};

/**
 * Jurnalni qatorlarga aylantiradi (rangsiz). Muvaffaqiyatli o'qishlar bitta
 * qatorga yig'iladi; qolgan har bir amal alohida qator.
 * @returns {{status: string, text: string}[]}
 */
export function ledgerLines(entries) {
  const lines = [];
  let reads = 0;
  for (const e of entries ?? []) {
    if (!SIDE_EFFECT_TOOLS.has(e.tool) && e.status === "ok") {
      reads++;
      continue;
    }
    if (!SIDE_EFFECT_TOOLS.has(e.tool) && e.status === "skipped") continue;
    const verb = ACTION_VERB[e.tool]?.[e.status] ?? `${e.tool}: ${e.status}`;
    let text = `${verb}: ${e.target}`;
    if (e.tool === "run_command" && e.exit != null) text += ` (exit ${e.exit})`;
    if (e.status === "failed" && e.detail && e.tool !== "run_command") text += ` — ${e.detail}`;
    lines.push({ status: e.status, text });
  }
  if (reads) lines.push({ status: "ok", text: `${reads} ta o'qish/ko'rish amali bajarildi` });
  return lines;
}

/** Foydalanuvchiga xulosa ko'rsatishga arziydimi (iz qoldiruvchi amal yoki muammo bo'lsa). */
export function ledgerWorthShowing(entries) {
  return (entries ?? []).some((e) => SIDE_EFFECT_TOOLS.has(e.tool) || e.status === "failed" || e.status === "declined");
}

/** Modelga beriladigan faktlar jurnali (vosita natijasiga qo'shiladi). */
export function ledgerForModel(entries) {
  const lines = ledgerLines(entries);
  if (!lines.length) return "";
  const mark = { ok: "✓", failed: "✕", declined: "⊘", skipped: "↺" };
  return [
    "[SOVEREIGN TIZIM JURNALI — shu navbatda vositalar orqali HAQIQATDA sodir bo'lgan amallar. Foydalanuvchiga faqat shunga mos xulosa ber: ✓ bo'lmagan amalni 'bajardim/yaratdim' dema, ✕/⊘ bo'lsa buni ochiq ayt.]",
    ...lines.map((l) => `${mark[l.status] ?? "•"} ${l.text}`),
  ].join("\n");
}

/**
 * Bitta agent navbati uchun kuzatuvchi: vositani ishga tushiradi, natijaga
 * [HOLAT] belgisini qo'yadi, jurnal yuritadi va takror chaqiruvlarni to'g'ri
 * boshqaradi. Eski mantiq har qanday takrorni "allaqachon bajarilgan" deb
 * qaytarardi — hatto birinchi urinish rad etilgan/xato bo'lsa ham (model buni
 * muvaffaqiyat deb tushunardi) va fayl o'zgargandan keyin testni qayta
 * ishga tushirishni ham to'sardi.
 *
 * @param {(name: string, args: object) => Promise<string>} exec  vositani bajaruvchi
 */
export function createTurnTracker(exec) {
  const entries = [];
  const seen = new Map(); // fp -> { status, mutation, detail }
  const repeats = new Map(); // fp -> { fails, writes, skips } — takroriy sikl (doom loop) hisoblagichi
  let mutation = 0; // muvaffaqiyatli iz qoldiruvchi amallar soni
  const tracker = {
    entries,
    /** Takroriy sikl aniqlansa: { kind: "command"|"write"|"repeat", tool, target, count }. */
    loop: null,
    async run(name, args) {
      const r = await runOnce(name, args);
      if (!tracker.loop) tracker.loop = detectLoop(name, args, r.status, r.result);
      return r;
    },
    /** Modelga beriladigan jurnal (ko'rsatishga arzimasa — bo'sh). */
    forModel() {
      return ledgerWorthShowing(entries) ? ledgerForModel(entries) : "";
    },
  };

  function detectLoop(name, args, status, result) {
    const fp = `${name}:${JSON.stringify(args ?? {})}`;
    const cnt = repeats.get(fp) ?? { fails: 0, writes: 0, skips: 0 };
    repeats.set(fp, cnt);
    const target = name === "run_command" ? oneLine(args?.command) : oneLine(args?.path ?? ".");
    // Bir xil buyruq qayta-qayta AYNAN BIR XIL xato bilan yiqilyapti (o'zgarishsiz takror ham
    // hisoblanadi). Xato matni o'zgarsa — tuzatish jarayoni ketyapti (yoz → testla → tuzat),
    // hisoblagich qaytadan boshlanadi: full auto'dagi haqiqiy tuzatish sikli to'xtatilmaydi.
    if (name === "run_command" && (status === "failed" || (status === "skipped" && seen.get(fp)?.status === "failed"))) {
      // To'liq chiqish solishtiriladi; raqamlar (vaqt, duration_ms, PID) har safar o'zgaradi — normallashtiriladi.
      const detail = status === "failed" ? String(result ?? "").replace(/\d+(\.\d+)?/g, "#") : cnt.lastDetail;
      cnt.fails = cnt.fails > 0 && detail === cnt.lastDetail ? cnt.fails + 1 : 1;
      cnt.lastDetail = detail;
      if (cnt.fails >= LOOP_MAX) return { kind: "command", tool: name, target, count: cnt.fails };
    }
    // Aynan bir xil tarkib bilan bitta fayl qayta-qayta yozilyapti (A→B→A "tuzatish" tebranishi ham).
    if (name === "write_file" && (status === "ok" || status === "skipped")) {
      if (++cnt.writes >= LOOP_MAX) return { kind: "write", tool: name, target, count: cnt.writes };
    }
    // Hech narsa o'zgarmagan holda aynan bir xil chaqiruv qayta-qayta.
    if (status === "skipped" && ++cnt.skips >= LOOP_MAX) return { kind: "repeat", tool: name, target, count: cnt.skips + 1 };
    return null;
  }

  async function runOnce(name, args) {
    const fp = `${name}:${JSON.stringify(args ?? {})}`;
    const prev = seen.get(fp);
    if (prev && (prev.status === "declined" || prev.mutation === mutation)) {
      const msg =
        prev.status === "ok"
          ? "Bu amal shu navbatda allaqachon MUVAFFAQIYATLI bajarilgan va shundan beri hech narsa o'zgarmagan. Boshqa qadamga o't yoki ishni yakunla."
          : prev.status === "declined"
            ? "Bu amalni foydalanuvchi shu navbatda RAD ETGAN — u BAJARILMAGAN. Qayta so'rama; foydalanuvchiga rad etilganini ayt."
            : `Bu amal shu navbatda XATO bergan${prev.detail ? ` (${prev.detail})` : ""} va shundan beri hech narsa o'zgarmagan — u BAJARILMAGAN. Sababini tuzat yoki foydalanuvchiga ayt.`;
      return { status: "skipped", result: msg, content: `${statusTag("skipped")}\n${msg}` };
    }
    let result;
    try {
      result = String(await exec(name, args));
    } catch (err) {
      result = `XATO: ${err?.message ?? err}`;
    }
    const status = toolStatus(name, result);
    if (status === "ok" && SIDE_EFFECT_TOOLS.has(name)) mutation++;
    const entry = ledgerEntry(name, args, result, status);
    seen.set(fp, { status, mutation, detail: entry.detail || (entry.exit != null ? `exit ${entry.exit}` : "") });
    entries.push(entry);
    return { status, result, entry, content: `${statusTag(status)}\n${result}` };
  }
  return tracker;
}

// Modelning "bajardim" turidagi da'volari (uz lotin/kirill, ru, en).
const CLAIM_RE =
  /(yaratdim|yozdim|saqladim|o['‘’ʻ`]?zgartirdim|yangiladim|qo['‘’ʻ`]?shdim|o['‘’ʻ`]?rnatdim|ishga tushirdim|bajardim|tuzatdim|o['‘’ʻ`]?chirdim|яратдим|ёздим|сақладим|ўзгартирдим|бажардим|создал|записал|сохранил|обновил|установил|запустил|исправил|удалил|\bI(?:'ve| have)? (?:created|written|wrote|saved|updated|installed|ran|executed|fixed|deleted)\b|\b(?:created|saved|installed|executed)\b)/i;

// Halol "bajarilmadi" iboralari — bunday qatordagi fayl nomi da'vo emas.
const NEG_RE =
  /(yozilmadi|yaratilmadi|bajarilmadi|saqlanmadi|rad et|xato|muvaffaqiyatsiz|ruxsat berilmadi|ёзилмади|яратилмади|бажарилмади|рад эт|хато|не (удалось|создан|записан|сохранён|выполн)|отклон|ошибк|not (created|written|saved)|fail|declin|denied|error)/i;

/**
 * Oxirgi javob bajarilgan ish haqida gapiradimi-yu, jurnal buni tasdiqlamaydimi?
 * Qaytaradi: null (muammo yo'q) yoki ogohlantirish matni.
 */
export function unsupportedClaim(finalText, entries) {
  const text = String(finalText ?? "");
  if (!text.trim() || !CLAIM_RE.test(text)) return null;
  const list = entries ?? [];
  const okEffects = list.filter((e) => SIDE_EFFECT_TOOLS.has(e.tool) && e.status === "ok");
  if (!okEffects.length) {
    return "Javobda amal bajarilgandek aytilgan, lekin bu navbatda birorta fayl yozilmadi, papka yaratilmadi yoki buyruq muvaffaqiyatli bajarilmadi.";
  }
  // Tilga olingan, lekin hech qachon muvaffaqiyatli yozilmagan fayl/papka.
  const okTargets = new Set(okEffects.map((e) => e.target));
  const missed = [];
  for (const e of list) {
    if (e.tool === "run_command" || !SIDE_EFFECT_TOOLS.has(e.tool)) continue;
    if (e.status === "ok" || okTargets.has(e.target)) continue;
    const base = e.target.split(/[\\/]/).pop();
    if (!base || base.length <= 2 || missed.includes(e.target)) continue;
    // Faylni tilga olgan qatorlarning hammasi uni "yozilmadi/rad etildi" deb halol aytsa — muammo yo'q.
    const mentions = text.split("\n").filter((l) => l.includes(base));
    if (mentions.length && !mentions.every((l) => NEG_RE.test(l))) missed.push(e.target);
  }
  return missed.length ? `Javobda tilga olingan, lekin aslida yozilmagan: ${missed.join(", ")}.` : null;
}

// ---- "Testlar o'tdi" da'vosi — eskirgan/tasdiqlanmagan natija ----------------
// Audit: "testlar o'tdi" da'volarining ~35% noto'g'ri — ko'pincha kod oxirgi test
// ishga tushirilgandan KEYIN o'zgartirilgan. Jurnalga qarab deterministik tekshiramiz.

/** Test/build/typecheck buyrug'imi (evristika; lint hisoblanmaydi). */
const VERIFY_CMD_RE = new RegExp(
  [
    String.raw`\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|tests|build|check|typecheck|type-check|verify|ci)(?![\w-])`,
    String.raw`\b(?:npm|pnpm|yarn)\s+t(?![\w-])`,
    String.raw`\b(?:npx|pnpx|bunx|pnpm\s+exec|yarn)\s+(?:vitest|jest|mocha|ava|tap|tsc|playwright|cypress|vue-tsc|next\s+build|vite\s+build)\b`,
    String.raw`(?:^|[\s;&|(])(?:vitest|jest|mocha|pytest|tsc|vue-tsc|ava|phpunit|rspec|ctest|tox|nox)(?![\w-])`,
    String.raw`\bpython3?\s+-m\s+(?:pytest|unittest)\b`,
    String.raw`\bnode\s+(?:[^\s;&|]+\s+)*--test\b`,
    String.raw`\b(?:go|cargo)\s+(?:test|build|vet|check)\b`,
    String.raw`\bdeno\s+(?:test|check)\b`,
    String.raw`\bdotnet\s+(?:test|build)\b`,
    String.raw`\b(?:mvn|mvnw|gradle|gradlew)\b[^;&|]*\b(?:test|verify|build|package|check)\b`,
    String.raw`\bmake\s+(?:test|check|build)\b`,
    String.raw`\b(?:bundle\s+exec\s+)?rake\s+(?:test|spec)\b`,
    String.raw`\bflutter\s+(?:test|build)\b`,
    String.raw`\bswift\s+(?:test|build)\b`,
  ].join("|"),
  "i",
);

/** Buyruq test yoki build'mi (jurnaldagi `target` bilan ham ishlaydi). */
export function isVerifyCommand(command) {
  return VERIFY_CMD_RE.test(String(command ?? ""));
}

const AP = "['‘’ʻ`]?";
const APC = "'‘’ʻ`"; // belgi sinfi ichida
const NL = String.raw`(?<!\p{L})`; // kirill/lotin uchun so'z boshi (\b faqat ASCII)
const NR = String.raw`(?!\p{L})`;
// "Testlar o'tdi / build ishladi" da'vosi (uz lotin, uz kirill, ru, en). Gap darajasida tekshiriladi.
const TEST_CLAIM_RE = new RegExp(
  [
    // en
    String.raw`\b(?:tests?|specs?|test suites?|unit tests|e2e tests|checks)\s+(?:now\s+|all\s+|still\s+|also\s+)?(?:are\s+|is\s+)?(?:pass(?:es|ed|ing)?|succeed(?:s|ed)?|green|working)\b`,
    String.raw`\b(?:all|\d+)\s+(?:\w+\s+)?tests?\s+(?:\w+\s+)?pass(?:ed|es|ing)?\b`,
    String.raw`\bpass(?:es|ed|ing)?\s+all\s+(?:the\s+)?(?:\w+\s+)?tests\b`,
    String.raw`\b(?:the\s+)?(?:build|compilation|typecheck|type-check|type check|tsc)\s+(?:now\s+|also\s+)?(?:is\s+|was\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|successful|works?|working|green|clean)\b`,
    String.raw`\b(?:builds|compiles)\s+(?:successfully|fine|cleanly|without (?:any\s+)?errors)\b`,
    String.raw`\btests?\s+(?:ran|run)\s+successfully\b`,
    // uz lotin
    String.raw`\btest\w*\s+(?:[\w${APC}]+\s+){0,2}?o${AP}t(?:di|yapti|moqda|adi|ib\s+ketdi)\b`,
    String.raw`\btest\w*\s+(?:ham\s+)?muvaffaqiyatli\b`,
    String.raw`\b(?:build|yig${AP}ish|kompilyatsiya)\w*\s+(?:[\w${APC}]+\s+)?(?:muvaffaqiyatli|ishla(?:di|yapti|moqda)|o${AP}t(?:di|adi))\b`,
    // uz kirill
    String.raw`${NL}тест\p{L}*\s+(?:\p{L}+\s+){0,2}?ўт(?:ди|япти|моқда|ади)${NR}`,
    String.raw`${NL}тест\p{L}*\s+(?:ҳам\s+)?муваффақиятли${NR}`,
    String.raw`${NL}(?:билд|йиғиш|компиляция)\p{L}*\s+(?:\p{L}+\s+)?(?:муваффақиятли|ишла(?:ди|япти|моқда)|ўт(?:ди|ади))${NR}`,
    // ru
    String.raw`${NL}тест\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:прош(?:ли|ёл|ел)|проход(?:ят|ит)|пройден\p{L}*|зел[её]н\p{L}*|успешн\p{L}*)${NR}`,
    String.raw`${NL}(?:сборка|билд|компиляция|проверка типов)\s+(?:\p{L}+\s+)?(?:прош(?:ла|ёл|ел)|проходит|успешн\p{L}*|работает|зел[её]н\p{L}*)${NR}`,
    String.raw`${NL}(?:собирается|компилируется)\s+(?:успешно|без ошибок)${NR}`,
  ].join("|"),
  "iu",
);
// Inkor / shart / taxmin — bunday gap da'vo emas ("testlar o'tmadi", "if tests pass", "должны пройти").
const TEST_HEDGE_RE = new RegExp(
  [
    String.raw`\b(?:not|never|no|cannot|unable|without|should|would|could|might|may|if|once|until|unless|whether|expect(?:ed)?|hopefully|to (?:verify|confirm|check|make sure|ensure))\b`,
    String.raw`n['’]t\b`,
    String.raw`\b(?:emas|agar|kerak|mumkin|ehtimol|balki|hali|tekshirilmadi)\b`,
    String.raw`\w+m[ae](?:di|dim|gan|ganman|ydi|ymiz)\b`,
    String.raw`${NL}(?:эмас|агар|керак|мумкин|эҳтимол|балки|ҳали)${NR}`,
    String.raw`\p{L}+ма(?:ди|дим|ган|йди)${NR}`,
    String.raw`${NL}(?:не|нет|ни|если|ли|должн\p{L}*|может|могут|возможно|проверьте|убедитесь)${NR}`,
  ].join("|"),
  "iu",
);

/** Javobda "testlar o'tdi / build ishladi" degan tasdiq (inkor/shartsiz) bormi. */
export function claimsTestsPass(text) {
  const sentences = String(text ?? "").split(/(?<=[.!?…])\s+|\n+/);
  return sentences.some((s) => TEST_CLAIM_RE.test(s) && !TEST_HEDGE_RE.test(s));
}

/**
 * "Testlar o'tdi" da'vosini jurnal bilan solishtiradi. Qaytaradi: null (muammo yo'q) yoki
 *  { code: "noTest" }                         — test/build umuman ishga tushirilmagan;
 *  { code: "testFailed", command }            — test/build ishga tushgan, lekin muvaffaqiyatli emas;
 *  { code: "stale", command, files: [...] }   — oxirgi muvaffaqiyatli test/build'dan KEYIN kod yozilgan.
 */
export function testClaimIssue(finalText, entries) {
  if (!claimsTestsPass(finalText)) return null;
  const list = entries ?? [];
  const isVerify = (e) => e.tool === "run_command" && isVerifyCommand(e.target);
  const okIdx = list.findLastIndex((e) => isVerify(e) && e.status === "ok");
  if (okIdx === -1) {
    const failed = list.findLast((e) => isVerify(e) && e.status === "failed");
    return failed ? { code: "testFailed", command: failed.target } : { code: "noTest" };
  }
  const files = [];
  for (const e of list.slice(okIdx + 1)) {
    if (e.tool === "write_file" && e.status === "ok" && isCodeFile(e.target) && !files.includes(e.target)) files.push(e.target);
  }
  return files.length ? { code: "stale", command: list[okIdx].target, files } : null;
}

/** testClaimIssue natijasining o'zbekcha matni (CLI; desktop o'zi tarjima qiladi). */
export function testClaimText(issue) {
  if (!issue) return "";
  if (issue.code === "noTest") return "Javobda testlar/build o'tdi deyilgan, lekin bu navbatda birorta test yoki build buyrug'i ishga tushirilmadi — da'vo tekshirilmagan.";
  if (issue.code === "testFailed") return `Javobda testlar/build o'tdi deyilgan, lekin bu navbatdagi test/build buyrug'i muvaffaqiyatli tugamagan (${issue.command}).`;
  return `Javobda testlar o'tdi deyilgan, lekin oxirgi muvaffaqiyatli test/build (${issue.command}) ishga tushirilgandan KEYIN kod o'zgartirilgan (${issue.files.join(", ")}) — natija eskirgan, testlar qayta ishga tushirilmagan.`;
}

// ---- Takroriy sikl (doom loop) ---------------------------------------------
/** Bir xil buyruq shuncha marta yiqilsa / bir xil fayl shuncha marta yozilsa — navbat to'xtatiladi. */
export const LOOP_MAX = 3;

/** Takroriy sikl haqidagi o'zbekcha izoh (CLI; desktop o'zi tarjima qiladi). */
export function loopText(loop) {
  if (!loop) return "";
  const head = "Takroriy sikl aniqlandi — qadamlar behuda sarflanmasligi uchun navbat to'xtatildi: ";
  const tail = " Boshqa yondashuvni ayting yoki xatoni birga ko'rib chiqaylik.";
  if (loop.kind === "command") return `${head}\`${loop.target}\` buyrug'i ${loop.count} marta xato bilan tugadi.${tail}`;
  if (loop.kind === "write") return `${head}${loop.target} fayli ${loop.count} marta aynan bir xil tarkib bilan yozildi (bir xil "tuzatish" takrorlanyapti).${tail}`;
  return `${head}bir xil amal (${loop.target}) hech narsa o'zgarmagan holda ${loop.count} marta chaqirildi.${tail}`;
}

// ---- Token hisobi va byudjet -------------------------------------------------
/** Xabar(lar) hajmidan taxminiy token soni (server `usage` qaytarmasa). Rasm — ~1000 token. */
export function estimateTokens(messages) {
  let chars = 0;
  let images = 0;
  for (const m of Array.isArray(messages) ? messages : [messages]) {
    if (!m) continue;
    if (typeof m.content === "string") chars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (typeof p?.text === "string") chars += p.text.length;
        else if (p?.type === "image_url") images++;
      }
    }
    for (const tc of m.tool_calls ?? []) chars += String(tc?.function?.arguments ?? "").length + 20;
  }
  return Math.ceil(chars / 4) + images * 1000;
}

/**
 * Bitta navbatning token hisoblagichi. `add(usage, sent, reply)` — server/provayder `usage`
 * bo'lsa o'shani, bo'lmasa taxminni qo'shadi. `budget` (0 = cheklovsiz).
 */
export function createUsageMeter(budget = 0) {
  const b = Number(budget);
  const meter = {
    budget: Number.isFinite(b) && b > 0 ? Math.floor(b) : 0,
    prompt: 0,
    completion: 0,
    rounds: 0,
    estimated: false,
    get tokens() {
      return meter.prompt + meter.completion;
    },
    add(usage, sent, reply) {
      meter.rounds++;
      const p = Number(usage?.prompt_tokens);
      const c2 = Number(usage?.completion_tokens);
      if (Number.isFinite(p) && Number.isFinite(c2) && p + c2 > 0) {
        meter.prompt += p;
        meter.completion += c2;
      } else {
        meter.estimated = true;
        meter.prompt += estimateTokens(sent);
        meter.completion += estimateTokens(reply);
      }
    },
    /** Byudjet tugadimi. */
    over() {
      return meter.budget > 0 && meter.tokens >= meter.budget;
    },
    snapshot() {
      return { tokens: meter.tokens, prompt: meter.prompt, completion: meter.completion, rounds: meter.rounds, estimated: meter.estimated, budget: meter.budget };
    },
  };
  return meter;
}

/** 1234 → "1.2k", 999 → "999". */
export function formatTokens(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

// The server caps a single message at 40k chars; a big cwd (e.g. the home folder)
// can produce 50k+ of tree, so keep the overview short — the agent can list_dir more.
const CONTEXT_MAX = 6_000;

export function contextSummary() {
  let t = tree(process.cwd()) || "(bo'sh)";
  if (t.length > CONTEXT_MAX) {
    t = `${t.slice(0, CONTEXT_MAX).replace(/\n[^\n]*$/, "")}\n… (qisqartirildi — batafsil uchun list_dir ishlating)`;
  }
  return `Joriy ish papkasi: ${process.cwd()}\nTuzilma:\n${t}`;
}
