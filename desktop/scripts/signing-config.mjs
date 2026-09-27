// Kod imzosi konfiguratsiyasi (CI) — secret'lar BOR bo'lsagina imzolangan build.
//
//   node scripts/signing-config.mjs <--win|--mac|--linux> <chiqish.json>
//
// Imzo uchun kerakli env to'liq bo'lsa, package.json "build" + imzo sozlamalarini
// <chiqish.json> ga yozadi (electron-builder --config <chiqish.json> bilan ishlatiladi) va
// stdout'ga rejimni chiqaradi (azure | pfx | developer-id | developer-id+notarize).
// Aks holda fayl YOZILMAYDI, "unsigned" chiqadi — workflow
// package.json'dagi konfiguratsiya bilan (bugungidek, imzosiz) yig'adi.
//
// Windows (ikkidan biri):
//   A) Azure Trusted Signing: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET +
//      AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_PROFILE, WIN_PUBLISHER_NAME
//   B) Klassik PFX: WIN_CSC_LINK (+ WIN_CSC_KEY_PASSWORD), ixtiyoriy WIN_PUBLISHER_NAME
//   Imzolanganda verifyUpdateCodeSignature: true — ilova keyingi yangilanishlar ham shu
//   nashriyotchi (publisherName) imzosi bilan kelishini talab qiladi. Imzosiz build'da false
//   qoladi (aks holda imzosiz yangilanishlar o'rnatilmay qolardi).
// macOS: CSC_LINK (Developer ID Application .p12, base64) (+ CSC_KEY_PASSWORD) →
//   Developer ID imzo + hardened runtime + build/mac-entitlements.plist;
//   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID ham bo'lsa — notarizatsiya.
//
// Secret qiymatlari faylga YOZILMAYDI — electron-builder ularni env'dan o'zi o'qiydi.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const AZURE_SECRETS = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];
const AZURE_VARS = ["AZURE_SIGNING_ENDPOINT", "AZURE_SIGNING_ACCOUNT", "AZURE_SIGNING_PROFILE", "WIN_PUBLISHER_NAME"];
const APPLE_NOTARY = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];

const has = (env, k) => typeof env[k] === "string" && env[k].trim() !== "";

/** GitHub Actions ogohlantirishi (CI tashqarisida oddiy matn). */
function warn(msg) {
  console.error(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `WARNING: ${msg}`);
}

/**
 * package.json "build" + env → imzolangan konfiguratsiya yoki null (imzosiz, bugungidek).
 * Sof funksiya (fayl yozmaydi) — test uchun.
 */
export function signingConfig(platform, env = process.env, base = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).build) {
  const cfg = structuredClone(base);

  if (platform === "--win") {
    const azure = [...AZURE_SECRETS, ...AZURE_VARS];
    const got = azure.filter((k) => has(env, k));
    if (got.length === azure.length) {
      cfg.win = {
        ...cfg.win,
        azureSignOptions: {
          publisherName: env.WIN_PUBLISHER_NAME.trim(),
          endpoint: env.AZURE_SIGNING_ENDPOINT.trim(),
          codeSigningAccountName: env.AZURE_SIGNING_ACCOUNT.trim(),
          certificateProfileName: env.AZURE_SIGNING_PROFILE.trim(),
        },
        verifyUpdateCodeSignature: true,
      };
      cfg.forceCodeSigning = true;
      return { config: cfg, mode: "azure" };
    }
    if (got.length && !(got.length === 1 && got[0] === "WIN_PUBLISHER_NAME")) {
      warn(`Azure Trusted Signing: to'liq emas, yo'q: ${azure.filter((k) => !has(env, k)).join(", ")} — Azure imzosi o'tkazib yuborildi`);
    }
    if (has(env, "WIN_CSC_LINK")) {
      cfg.win = { ...cfg.win, verifyUpdateCodeSignature: true };
      // publisherName berilmasa electron-builder uni sertifikat subject'idan o'zi oladi.
      if (has(env, "WIN_PUBLISHER_NAME")) cfg.win.signtoolOptions = { ...cfg.win.signtoolOptions, publisherName: env.WIN_PUBLISHER_NAME.trim() };
      cfg.forceCodeSigning = true;
      return { config: cfg, mode: "pfx" };
    }
    return null;
  }

  if (platform === "--mac") {
    if (!has(env, "CSC_LINK")) {
      if (APPLE_NOTARY.some((k) => has(env, k))) warn("Apple notarizatsiya secret'lari bor, lekin MAC_CSC_LINK (Developer ID .p12) yo'q — imzosiz (ad-hoc) build");
      return null;
    }
    const notarize = APPLE_NOTARY.every((k) => has(env, k));
    if (!notarize) warn(`Notarizatsiya o'tkazib yuborildi, yo'q: ${APPLE_NOTARY.filter((k) => !has(env, k)).join(", ")}`);
    const ent = join(ROOT, "build", "mac-entitlements.plist");
    const mac = { ...cfg.mac, hardenedRuntime: true, entitlements: ent, entitlementsInherit: ent, notarize };
    delete mac.identity; // "-" = ad-hoc; o'chirilsa CSC_LINK'dagi Developer ID ishlatiladi
    cfg.mac = mac;
    cfg.forceCodeSigning = true;
    return { config: cfg, mode: notarize ? "developer-id+notarize" : "developer-id" };
  }

  return null; // Linux AppImage — imzo yo'q
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [platform, out] = process.argv.slice(2);
  if (!platform || !out) {
    console.error("foydalanish: node scripts/signing-config.mjs <--win|--mac|--linux> <chiqish.json>");
    process.exit(2);
  }
  const res = signingConfig(platform);
  if (res) {
    writeFileSync(out, JSON.stringify(res.config, null, 2));
    console.error(`code signing: ${res.mode}`);
    console.log(res.mode);
  } else {
    console.error("code signing: o'chiq (secret'lar yo'q) — imzosiz build");
    console.log("unsigned");
  }
}
