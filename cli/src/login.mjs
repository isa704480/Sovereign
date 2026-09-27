import { hostname, platform } from "node:os";
import { saveConfig } from "./config.mjs";
import { c, logo } from "./ui.mjs";
import { openBrowser } from "./commands.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Server qaytargan user code ("ABCD-1234") — faqat shu formatda ko'rsatiladi (terminalga
 * ixtiyoriy matn / ANSI ketma-ketlik chiqmasin). Noto'g'ri yoki yo'q → null.
 */
export function displayUserCode(v) {
  return typeof v === "string" && /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(v) ? v : null;
}

/** Tasdiqlash URL'i: faqat http(s), boshqaruv belgilarisiz. */
export function safeUrl(v) {
  if (typeof v !== "string" || v.length > 2048 || /[\u0000-\u001f\u007f-\u009f\s]/.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? v : null;
  } catch {
    return null;
  }
}

/** Kodni ko'zga tashlanadigan ramkada chiqaradi. */
function printUserCode(userCode) {
  const inner = `   ${userCode}   `;
  const bar = "─".repeat(inner.length);
  console.log("");
  console.log(`  ${c.dim("Tasdiqlash kodi — brauzerdagi sahifaga shuni kiriting:")}`);
  console.log(`  ${c.indigo(`┌${bar}┐`)}`);
  console.log(`  ${c.indigo("│")}${c.bold(c.white(inner))}${c.indigo("│")}`);
  console.log(`  ${c.indigo(`└${bar}┘`)}`);
  console.log(`  ${c.amber("Bu kodni hech kimga bermang.")} ${c.dim("Kimdir so'rasa — bu firibgarlik.")}`);
  console.log("");
}

/** Browser device-login: opens the approve page, polls until a token is issued. */
export async function login(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  console.log(`\n  ${logo()} ${c.dim("login")}`);

  let code, url, userCode;
  try {
    const res = await fetch(`${base}/api/cli/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // userCode: true — server tasdiqlash kodini qaytaradi va URL'ga device kodini qo'ymaydi.
      body: JSON.stringify({ device: `${hostname()} (${platform()})`, userCode: true }),
    });
    if (!res.ok) throw new Error(`start ${res.status}`);
    const data = await res.json();
    code = data.code;
    url = safeUrl(data.url);
    userCode = displayUserCode(data.userCode);
    if (typeof code !== "string" || !/^[0-9a-f]{10,128}$/i.test(code) || !url) throw new Error("javob noto'g'ri");
  } catch (e) {
    console.log(c.red(`\n  Serverga ulanib bo'lmadi: ${e.message}`));
    console.log(c.dim(`  Manzil to'g'rimi? SOVEREIGN_URL bilan o'zgartiring.\n`));
    return false;
  }

  if (userCode) printUserCode(userCode);

  // Brauzer avtomatik ochiladi — URL'ni terminalga ko'rsatmaymiz.
  // Faqat brauzer ochilmasa (Ctrl+click ishlamasa) fallback sifatida chiqamiz.
  const opened = openBrowser(url);
  if (opened && userCode) {
    console.log(`  ${c.dim("Brauzerda ochildi — sahifaga yuqoridagi kodni kiriting va")} ${c.white("Ruxsat berish")} ${c.dim("bosing.")}`);
  } else if (opened) {
    // Eski server (user code yo'q): sahifadagi kod bilan solishtirish uchun boshini ko'rsatamiz.
    console.log(`  ${c.dim("Brauzerda ochildi — kod")} ${c.white(String(code).slice(0, 8))} ${c.dim("mosligini tekshirib,")} ${c.white("Ruxsat berish")} ${c.dim("bosing.")}`);
  } else {
    console.log(`  ${c.dim("Brauzer o'z-o'zidan ochilmadi. Ushbu sahifani qo'lda oching:")}`);
    console.log(`  ${c.indigo(url)}`);
  }

  process.stdout.write(`  ${c.dim("Tasdiqlanishini kutmoqda")}`);
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await sleep(2000);
    try {
      const res = await fetch(`${base}/api/cli/poll?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.status === "approved" && data.token) {
        saveConfig({ baseUrl: base, token: data.token });
        // Server tomondan sozlamalarni ham darhol yuklab olamiz (skillar, model, plan)
        try {
          const meRes = await fetch(`${base}/api/cli/me`, {
            headers: { Authorization: `Bearer ${data.token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            saveConfig({
              email: me.email || "",
              enabledSkills: me.enabled_skills ?? [],
              model: me.default_model || undefined,
              plan: me.plan,
              planState: me.plan_state,
              planExpiresAt: me.plan_expires_at,
            });
          }
        } catch { /* ignore sync error, mustaqil davom etadi */ }
        console.log(`\n\n  ${c.green("✓ Ulandi!")} Hisobingiz bilan bog'landi.\n`);
        return true;
      }
      if (data.status === "expired") {
        console.log(c.red("\n\n  Kod eskirdi. Qayta urinib ko'ring.\n"));
        return false;
      }
    } catch {
      /* keep polling */
    }
    process.stdout.write(c.dim("."));
  }
  console.log(c.red("\n\n  Vaqt tugadi. Qayta urinib ko'ring.\n"));
  return false;
}
