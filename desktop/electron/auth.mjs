// Brauzer orqali kirish (CLI'dagi `sovereign login` bilan bir xil device-login oqimi):
// POST /api/cli/start → {code, url} → brauzerda tasdiqlash → /api/cli/poll → token.
// Token CLI bilan umumiy ~/.sovereign/config.json ga yoziladi (saveConfig inject qilinadi).

import { hostname, platform } from "node:os";

const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Registrable domen (oxirgi 2 bo'lak) — login URL baseUrl bilan bir saytdami. */
function site(host) {
  return String(host).toLowerCase().split(".").slice(-2).join(".");
}

/**
 * Login URL xavfsizmi: https (localhost uchun http) va baseUrl bilan bir sayt.
 * Server qaytargan ixtiyoriy URL (file:, javascript:, begona sayt) ochilmaydi.
 */
export function safeLoginUrl(url, baseUrl) {
  try {
    const u = new URL(url);
    const b = new URL(baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (!(u.protocol === "https:" || (u.protocol === "http:" && local))) return false;
    return site(u.hostname) === site(b.hostname);
  } catch {
    return false;
  }
}

/**
 * Server qaytargan user code ("ABCD-1234") — faqat shu formatda UI'ga uzatiladi. Aks holda null.
 * Kod URL'da yo'q: foydalanuvchi uni brauzerdagi sahifaga O'ZI teradi (RFC 8628, phishing'ga qarshi).
 */
export function displayUserCode(v) {
  return typeof v === "string" && /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(v) ? v : null;
}

/**
 * @param {{ baseUrl: string, saveConfig: Function, openExternal: (url:string)=>Promise<void>, emit: (ev:object)=>void }} deps
 * @returns {{ promise: Promise<boolean>, cancel: () => void }}
 */
export function startLogin({ baseUrl, saveConfig, openExternal, emit }) {
  const base = baseUrl.replace(/\/$/, "");
  let cancelled = false;
  const promise = (async () => {
    emit({ state: "starting" });
    let code, url, userCode;
    try {
      const res = await fetch(`${base}/api/cli/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // userCode: true — server tasdiqlash kodini qaytaradi, URL'da esa device kodi bo'lmaydi.
        body: JSON.stringify({ device: `${hostname()} (${platform()}) · Cowork`, userCode: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      ({ code, url } = data);
      userCode = displayUserCode(data?.userCode);
    } catch (e) {
      emit({ state: "error", message: e.message });
      return false;
    }
    if (!code || !safeLoginUrl(url, base)) {
      emit({ state: "error", message: "unsafe-url" });
      return false;
    }
    // Yangi server: faqat user code ko'rsatiladi (device kodi maxfiy). Eski server (userCode yo'q):
    // avvalgidek device kodining boshi — eski sahifa uni solishtirish uchun ko'rsatadi.
    const shown = userCode ? { userCode } : { code: String(code).slice(0, 32) };
    emit({ state: "waiting", ...shown });
    openExternal(url).catch(() => emit({ state: "waiting", ...shown, openFailed: true, url }));

    const started = Date.now();
    while (!cancelled && Date.now() - started < TIMEOUT_MS) {
      await sleep(POLL_MS);
      if (cancelled) break;
      try {
        const res = await fetch(`${base}/api/cli/poll?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.status === "approved" && data.token) {
          saveConfig({ baseUrl: base, token: data.token });
          let email = "";
          try {
            const me = await fetch(`${base}/api/cli/me`, { headers: { Authorization: `Bearer ${data.token}` } });
            if (me.ok) {
              const j = await me.json();
              email = j.email || "";
              saveConfig({ email, plan: j.plan, planState: j.plan_state, planExpiresAt: j.plan_expires_at });
            }
          } catch {
            /* profil keyinroq yuklanadi */
          }
          emit({ state: "approved", email });
          return true;
        }
        if (data.status === "expired") {
          emit({ state: "expired" });
          return false;
        }
      } catch {
        /* tarmoq uzilishi — so'rashda davom etamiz */
      }
    }
    emit({ state: cancelled ? "cancelled" : "expired" });
    return false;
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}
