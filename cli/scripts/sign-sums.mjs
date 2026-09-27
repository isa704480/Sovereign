// CLI relizidagi SHA256SUMS imzosi — RSA-3072, PKCS#1 v1.5 + SHA-256. Qo'llanma: docs/SIGNING.md.
//
// Nega RSA (Ed25519 emas): install.sh macOS'dagi LibreSSL `openssl` bilan, install.ps1 esa
// Windows PowerShell 5.1 (.NET Framework) bilan qo'shimcha dasturlarsiz tekshira olishi kerak —
// ikkalasida ham faqat RSA-SHA256 hamma joyda bor.
//
//   node scripts/sign-sums.mjs keygen <papka>        → <papka>/cli-sums-rsa.pem (yopiq, 0600) +
//                                                     install.sh va install.ps1 uchun ochiq kalit ekranga
//   node scripts/sign-sums.mjs sign <yopiq.pem | --env> <SHA256SUMS>   → <SHA256SUMS>.sig (base64)
//                                                     (--env: kalit CLI_SIGNING_KEY env'dan — CI)
//   node scripts/sign-sums.mjs verify <SHA256SUMS> [ochiq.pem]         → o'rnatilgan (yoki berilgan) kalit bilan
//   node scripts/sign-sums.mjs status                → "embedded" | "none" (install.sh/.ps1 kalitlari mosligi)
//
// Ochiq kalit public/install.sh (SUMS_PUBKEY) va public/install.ps1 ($sumsPubKeyXml) ga qo'yiladi.
// Ikkalasi bo'sh — installer'lar bugungidek faqat SHA256 bilan tekshiradi.

import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SH = join(REPO, "public", "install.sh");
const PS1 = join(REPO, "public", "install.ps1");

const b64u2b64 = (s) => Buffer.from(s, "base64url").toString("base64");
const pubKey = (k) => (k?.type === "public" ? k : createPublicKey(k));
const spki = (k) => pubKey(k).export({ type: "spki", format: "pem" });
const normPem = (s) => String(s ?? "").replace(/\\n/g, "\n").trim() + "\n";

/** RSA ochiq kalit → .NET RSAKeyValue XML (install.ps1 uchun). */
export function toXml(pub) {
  const { n, e } = pubKey(pub).export({ format: "jwk" });
  return `<RSAKeyValue><Modulus>${b64u2b64(n)}</Modulus><Exponent>${b64u2b64(e)}</Exponent></RSAKeyValue>`;
}

/** .NET RSAKeyValue XML → PEM (SPKI). */
export function fromXml(xml) {
  const m = /<Modulus>([^<]+)<\/Modulus>\s*<Exponent>([^<]+)<\/Exponent>/.exec(xml);
  if (!m) throw new Error("RSAKeyValue XML noto'g'ri");
  const u = (s) => Buffer.from(s.trim(), "base64").toString("base64url");
  return spki({ key: { kty: "RSA", n: u(m[1]), e: u(m[2]) }, format: "jwk" });
}

/** Installer'larga o'rnatilgan kalitlar. { sh, ps1 } — bo'sh bo'lsa "". */
export function embeddedKeys(shText = readFileSync(SH, "utf8"), ps1Text = readFileSync(PS1, "utf8")) {
  const sh = /^SUMS_PUBKEY='([^']*)'/m.exec(shText);
  const ps = /^\s*\$sumsPubKeyXml = '([^']*)'/m.exec(ps1Text);
  if (!sh || !ps) throw new Error("install.sh (SUMS_PUBKEY) yoki install.ps1 ($sumsPubKeyXml) konstantasi topilmadi");
  return { sh: sh[1].trim(), ps1: ps[1].trim() };
}

/** Ikkala installer bir xil kalitni ishlatadimi? Qaytaradi: PEM yoki "" (ikkalasi bo'sh). */
export function embeddedKey(keys = embeddedKeys()) {
  if (!keys.sh && !keys.ps1) return "";
  if (!keys.sh || !keys.ps1) throw new Error("kalit faqat bitta installer'da — install.sh va install.ps1 ikkalasiga qo'ying");
  const a = spki(keys.sh);
  if (a !== fromXml(keys.ps1)) throw new Error("install.sh va install.ps1 dagi ochiq kalitlar har xil");
  return a;
}

export const signSums = (data, key) => sign("sha256", data, key);

export function verifySums(data, sigText, pub) {
  try {
    const txt = Buffer.from(sigText).toString("utf8").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(txt)) return false;
    return verify("sha256", Buffer.from(data), pubKey(pub), Buffer.from(txt, "base64"));
  } catch {
    return false;
  }
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "keygen") {
      const dir = args[0] || die("papka ko'rsatilmadi");
      const file = join(dir, "cli-sums-rsa.pem");
      if (existsSync(file)) die(`${file} allaqachon bor — ustiga yozilmaydi`);
      mkdirSync(dir, { recursive: true });
      const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
      writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
      console.log(`Yopiq kalit: ${file} (repo'ga qo'ymang; faqat CLI_SIGNING_KEY secret'iga)\n`);
      console.log("public/install.sh → SUMS_PUBKEY='...' ichiga (qatorlari bilan):\n");
      console.log(spki(publicKey));
      console.log("public/install.ps1 → $sumsPubKeyXml = '...' ichiga (bitta qator):\n");
      console.log(toXml(publicKey));
    } else if (cmd === "sign") {
      const [keyArg, file] = args;
      if (!keyArg || !file) die("foydalanish: sign <yopiq.pem | --env> <SHA256SUMS>");
      let key;
      try {
        key = createPrivateKey(keyArg === "--env" ? normPem(process.env.CLI_SIGNING_KEY) : readFileSync(keyArg));
      } catch {
        die("yopiq kalitni o'qib bo'lmadi (PKCS#8/PKCS#1 PEM, RSA kutilgan)");
      }
      if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength < 3072) die("kalit RSA-3072 (yoki kattaroq) emas");
      const pub = spki(key);
      const emb = embeddedKey();
      if (emb && emb !== pub) die("yopiq kalit install.sh / install.ps1 dagi ochiq kalitga mos EMAS");
      const data = readFileSync(file);
      const sig = signSums(data, key).toString("base64") + "\n";
      if (!verifySums(data, sig, pub)) die("imzo o'z-o'zini tekshiruvdan o'tmadi");
      writeFileSync(`${file}.sig`, sig);
      console.log(`✓ ${file}.sig${emb ? " (installer kaliti bilan mos)" : " (installer'larda kalit hali yo'q)"}`);
    } else if (cmd === "verify") {
      const [file, pubFile] = args;
      if (!file) die("foydalanish: verify <SHA256SUMS> [ochiq.pem]");
      const pub = pubFile ? readFileSync(pubFile, "utf8") : embeddedKey();
      if (!pub) die("installer'larda ochiq kalit yo'q — ochiq.pem bering");
      const ok = verifySums(readFileSync(file), readFileSync(`${file}.sig`), pub);
      console.log(ok ? "✓ imzo to'g'ri" : "✗ imzo NOTO'G'RI");
      process.exit(ok ? 0 : 1);
    } else if (cmd === "status") {
      console.log(embeddedKey() ? "embedded" : "none");
    } else {
      die("buyruqlar: keygen | sign | verify | status");
    }
  } catch (e) {
    die(String(e?.message ?? e));
  }
}
