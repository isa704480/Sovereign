// Offline guard. SOV_OFFLINE=1 (yoki --offline) bo'lsa main jarayondagi BARCHA
// fetch so'rovlari faqat localhost'ga ruxsat etiladi — smoke test / demo paytida
// ilova production serverga (memory sync, chat, model katalogi, updater) ulanmaydi.

export const OFFLINE = process.env.SOV_OFFLINE === "1" || process.argv.includes("--offline");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(String(url)).hostname);
  } catch {
    return false;
  }
}

/** Tarmoq so'rovi shu manzilga ruxsat etilganmi. */
export function netAllowed(url) {
  return !OFFLINE || isLocalUrl(url);
}

/** Offline rejimda global fetch'ni localhost bilan cheklaydi (CLI modullari ham shu fetch'ni ishlatadi). */
export function installOfflineGuard() {
  if (!OFFLINE || globalThis.__sovOfflineGuard) return;
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (!isLocalUrl(url)) return Promise.reject(new Error("offline"));
    return real(input, init);
  };
  globalThis.__sovOfflineGuard = true;
}
