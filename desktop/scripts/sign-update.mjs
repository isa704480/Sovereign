// Yangilanish manifestini (latest.yml / latest-linux.yml) Ed25519 bilan imzolash — OFFLINE, qo'lda.
// Yopiq kalit GitHub Actions secret'iga QO'YILMAYDI (aks holda buzilgan workflow ham imzolay oladi).
//
//   node scripts/sign-update.mjs keygen <papka>          → <papka>/update-ed25519.pem (yopiq, 0600) + ochiq kalit ekranga
//   node scripts/sign-update.mjs sign <yopiq.pem> <latest.yml> [...]  → har biri uchun <fayl>.sig (base64)
//   node scripts/sign-update.mjs verify <ochiq.pem> <latest.yml>      → imzoni tekshiradi
//
// Ochiq kalit desktop/electron/update-sig.mjs dagi UPDATE_PUBKEY_PEM ga qo'yiladi; .sig fayllar
// relizga latest*.yml bilan birga yuklanadi (aks holda yangi ilovalar yangilanishni yuklamaydi).

import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { verifyManifest } from "../electron/update-sig.mjs";

const [cmd, ...args] = process.argv.slice(2);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (cmd === "keygen") {
  const dir = args[0] || die("papka ko'rsatilmadi");
  const file = join(dir, "update-ed25519.pem");
  if (existsSync(file)) die(`${file} allaqachon bor — ustiga yozilmaydi`);
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`Yopiq kalit: ${file} (repo'ga, bulutga va CI'ga qo'ymang)`);
  console.log("Ochiq kalit (UPDATE_PUBKEY_PEM):\n" + publicKey.export({ type: "spki", format: "pem" }));
} else if (cmd === "sign") {
  const [keyFile, ...files] = args;
  if (!keyFile || !files.length) die("foydalanish: sign <yopiq.pem> <latest.yml> [...]");
  const key = createPrivateKey(readFileSync(keyFile));
  for (const f of files) {
    const sig = sign(null, readFileSync(f), key);
    writeFileSync(`${f}.sig`, sig.toString("base64") + "\n");
    console.log(`✓ ${f}.sig`);
  }
} else if (cmd === "verify") {
  const [pubFile, file] = args;
  if (!pubFile || !file) die("foydalanish: verify <ochiq.pem> <latest.yml>");
  const ok = verifyManifest(readFileSync(file), readFileSync(`${file}.sig`), readFileSync(pubFile, "utf8"));
  console.log(ok ? "✓ imzo to'g'ri" : "✗ imzo NOTO'G'RI");
  process.exit(ok ? 0 : 1);
} else {
  die("buyruqlar: keygen | sign | verify");
}
