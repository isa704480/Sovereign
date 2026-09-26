// CLI ↔ SOVEREIGN Server sinxronlash — skillar, model, xotira
// Server 1-source-of-truth, CLI mahalliy kesh sifatida ishlaydi.

import { saveConfig } from "./config.mjs";

const timeout = (ms) => new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms));

/** GET /api/cli/me — server tomonidan barcha sozlamalarni oladi. */
export async function fetchMe(config) {
  if (!config?.token || !config?.baseUrl) return null;
  try {
    const url = `${config.baseUrl.replace(/\/$/, "")}/api/cli/me`;
    const res = await Promise.race([
      fetch(url, { headers: { Authorization: `Bearer ${config.token}` } }),
      timeout(4000),
    ]);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** PATCH /api/cli/me — mahalliy o'zgarishlarni serverga yozadi (fire-and-forget). */
export async function pushSettings(config, patch) {
  if (!config?.token || !config?.baseUrl) return false;
  try {
    const url = `${config.baseUrl.replace(/\/$/, "")}/api/cli/me`;
    const res = await Promise.race([
      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(patch),
      }),
      timeout(4000),
    ]);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fon rejimidagi polling — server tarafida qilingan o'zgarishlar (web'dagi
 * skil toggle, tarif yangilanishi) CLI ga har 15 sekundda keladi.
 * onChange({ enabledSkills, planState, ... }) chaqiriladi faqat o'zgarish bo'lganda.
 *
 * `config` — obyekt yoki getter (`() => config`). Getter tavsiya etiladi: /logout
 * va /login'dan keyin har tick JORIY token ishlatiladi (eski akkaunt tokeni tarmoqqa
 * ketmaydi va uning sozlamalari yangi akkaunt konfiguratsiyasiga yozilmaydi).
 */
export function startBackgroundSync(config, onChange, intervalMs = 15000) {
  const current = typeof config === "function" ? config : () => config;
  const snapshot = (cfg) => ({
    skills: JSON.stringify(cfg?.enabledSkills ?? []),
    model: cfg?.model,
    planState: cfg?.planState,
  });
  const start = current();
  let token = start?.token || "";
  let last = snapshot(start);
  const tick = async () => {
    const cfg = current();
    if (!cfg?.token) return; // chiqilgan — so'rov yuborilmaydi
    if (cfg.token !== token) {
      // Boshqa akkaunt: taqqoslash nuqtasi yo'q — server holati to'liq qo'llanadi.
      token = cfg.token;
      last = { skills: undefined, model: undefined, planState: undefined };
    }
    const me = await fetchMe(cfg);
    // So'rov davomida chiqilgan/akkaunt almashgan bo'lsa — eski javob qo'llanmaydi.
    if (!me || current()?.token !== cfg.token) return;
    const skillsStr = JSON.stringify(me.enabled_skills ?? []);
    const changed = {};
    if (skillsStr !== last.skills) {
      changed.enabledSkills = me.enabled_skills ?? [];
      last.skills = skillsStr;
    }
    if (me.default_model && me.default_model !== last.model) {
      changed.model = me.default_model;
      last.model = me.default_model;
    }
    if (me.plan_state !== last.planState) {
      changed.planState = me.plan_state;
      changed.plan = me.plan;
      changed.planExpiresAt = me.plan_expires_at;
      changed.daysLeft = me.days_left;
      last.planState = me.plan_state;
    }
    if (Object.keys(changed).length > 0) {
      saveConfig(changed);
      onChange(changed);
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
