import { spawn } from "node:child_process";
import { hostname, platform } from "node:os";
import { saveConfig } from "./config.mjs";
import { c, logo } from "./ui.mjs";

function openBrowser(url) {
  const p = platform();
  const cmd = p === "win32" ? "cmd" : p === "darwin" ? "open" : "xdg-open";
  const args = p === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Browser device-login: opens the approve page, polls until a token is issued. */
export async function login(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  console.log(`\n  ${logo()} ${c.dim("login")}`);

  let code, url;
  try {
    const res = await fetch(`${base}/api/cli/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: `${hostname()} (${platform()})` }),
    });
    if (!res.ok) throw new Error(`start ${res.status}`);
    ({ code, url } = await res.json());
  } catch (e) {
    console.log(c.red(`\n  Serverga ulanib bo'lmadi: ${e.message}`));
    console.log(c.dim(`  Manzil to'g'rimi? SOVEREIGN_URL bilan o'zgartiring.\n`));
    return false;
  }

  // Brauzer avtomatik ochiladi — URL'ni terminalga ko'rsatmaymiz.
  // Faqat brauzer ochilmasa (Ctrl+click ishlamasa) fallback sifatida chiqamiz.
  const opened = openBrowser(url);
  if (opened) {
    console.log(`  ${c.dim("Brauzerda ochildi — sahifada")} ${c.white("Ruxsat berish")} ${c.dim("bosing.")}`);
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
