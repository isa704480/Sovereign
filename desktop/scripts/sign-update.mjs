// Yangilanish manifestini (latest.yml / latest-mac.yml / latest-linux.yml) Ed25519 bilan imzolash.
// Batafsil: docs/SIGNING.md.
//
//   node scripts/sign-update.mjs keygen <papka>          → <papka>/update-ed25519.pem (yopiq, 0600) + ochiq kalit ekranga
//   node scripts/sign-update.mjs sign <yopiq.pem> <latest.yml> [...]  → har biri uchun <fayl>.sig (base64)
//   node scripts/sign-update.mjs sign --env <latest.yml> [...]        → kalit UPDATE_SIGNING_KEY env'dan (CI)
//   node scripts/sign-update.mjs verify <ochiq.pem> <latest.yml>      → imzoni tekshiradi
//   node scripts/sign-update.mjs verify-embedded <latest.yml> [...]   → ilovaga o'rnatilgan kalit bilan
//                                                                      (UPDATE_PUBKEY_PEM bo'sh — talab yo'q, 0)
//
// Ikki usul: (1) OFFLINE — yopiq kalit faqat sizning kompyuteringizda, .sig qo'lda yuklanadi
// (eng xavfsiz); (2) CI — yopiq kalit UPDATE_SIGNING_KEY secret'ida, publish job'i o'zi imzolaydi.
// Ochiq kalit desktop/electron/update-sig.mjs dagi UPDATE_PUBKEY_PEM ga qo'yiladi; shundan keyin
// .sig'siz yoki noto'g'ri imzoli relizni ilova YUKLAMAYDI.

import { generateKeyPairSync, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { verifyManifest, UPDATE_PUBKEY_PEM } from "../electron/update-sig.mjs";

const [cmd, ...args] = process.argv.slice(2);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

/** Secret'ga "\n" matn ko'rinishida qo'yilgan PEM'ni ham qabul qiladi. */
const normPem = (s) => String(s ?? "").replace(/\\n/g, "\n").trim() + "\n";
const spki = (k) => createPublicKey(k).export({ type: "spki", format: "pem" });

if (cmd === "keygen") {
  const dir = args[0] || die("papka ko'rsatilmadi");
  const file = join(dir, "update-ed25519.pem");
  if (existsSync(file)) die(`${file} allaqachon bor — ustiga yozilmaydi`);
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`Yopiq kalit: ${file} (repo'ga va bulutga qo'ymang; CI usulida faqat UPDATE_SIGNING_KEY secret'iga)`);
  console.log("Ochiq kalit (UPDATE_PUBKEY_PEM):\n" + publicKey.export({ type: "spki", format: "pem" }));
} else if (cmd === "sign") {
  const [keyArg, ...files] = args;
  if (!keyArg || !files.length) die("foydalanish: sign <yopiq.pem | --env> <latest.yml> [...]");
  let key;
  try {
    key = createPrivateKey(keyArg === "--env" ? normPem(process.env.UPDATE_SIGNING_KEY) : readFileSync(keyArg));
  } catch {
    die("yopiq kalitni o'qib bo'lmadi (PKCS#8 PEM, Ed25519 kutilgan)");
  }
  if (key.asymmetricKeyType !== "ed25519") die("kalit Ed25519 emas");
  const pub = spki(key);
  // Ilovaga o'rnatilgan ochiq kalit boshqa bo'lsa — bunday imzoni ilovalar baribir rad etadi.
  if (UPDATE_PUBKEY_PEM && spki(UPDATE_PUBKEY_PEM) !== pub) {
    die("yopiq kalit desktop/electron/update-sig.mjs dagi UPDATE_PUBKEY_PEM ga mos EMAS");
  }
  for (const f of files) {
    const data = readFileSync(f);
    const sig = sign(null, data, key);
    if (!verifyManifest(data, sig, pub)) die(`${f}: imzo o'z-o'zini tekshiruvdan o'tmadi`);
    writeFileSync(`${f}.sig`, sig.toString("base64") + "\n");
    console.log(`✓ ${f}.sig`);
  }
} else if (cmd === "verify") {
  const [pubFile, file] = args;
  if (!pubFile || !file) die("foydalanish: verify <ochiq.pem> <latest.yml>");
  const ok = verifyManifest(readFileSync(file), readFileSync(`${file}.sig`), readFileSync(pubFile, "utf8"));
  console.log(ok ? "✓ imzo to'g'ri" : "✗ imzo NOTO'G'RI");
  process.exit(ok ? 0 : 1);
} else if (cmd === "verify-embedded") {
  if (!UPDATE_PUBKEY_PEM) {
    console.log("UPDATE_PUBKEY_PEM bo'sh — manifest imzosi talab qilinmaydi");
    process.exit(0);
  }
  if (!args.length) die("tekshiriladigan latest*.yml topilmadi");
  let bad = 0;
  for (const f of args) {
    const ok = existsSync(`${f}.sig`) && verifyManifest(readFileSync(f), readFileSync(`${f}.sig`));
    console.log(`${ok ? "✓" : "✗"} ${f}${ok ? "" : " — .sig yo'q yoki imzo NOTO'G'RI"}`);
    if (!ok) bad++;
  }
  process.exit(bad ? 1 : 0);
} else {
  die("buyruqlar: keygen | sign | verify | verify-embedded");
}
