import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * OmniRoute "o'zini tiklash".
 *
 * OmniRoute (v3.8.5x) xotira to'lsa "resource pressure" himoyasiga tushadi va
 * xotira bo'shagach ham 100% so'rovlarni 503 bilan rad etib turaveradi — faqat
 * restart tuzatadi (github.com/diegosouzapw/OmniRoute/issues/13821). Shu bois:
 *   1) chat/CLI shunday javob olsa → darhol Railway API orqali restart;
 *   2) cron har 10 daqiqada tekshiradi (GitHub Actions);
 *   3) har kecha profilaktik restart (Vercel cron) — xotira to'planmaydi.
 * Restartlar orasida kamida COOLDOWN_MS — restart sikliga tushib qolmaslik uchun.
 *
 * Env: RAILWAY_API_TOKEN (akkaunt/workspace token) yoki RAILWAY_PROJECT_TOKEN,
 *      RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT_ID.
 */
const RAILWAY_GQL = "https://backboard.railway.com/graphql/v2";
const COOLDOWN_MS = 15 * 60 * 1000;
const KV_KEY = "omniroute_restart";

export function isWatchdogConfigured(): boolean {
  return Boolean(
    (process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_PROJECT_TOKEN) &&
      process.env.RAILWAY_SERVICE_ID &&
      process.env.RAILWAY_ENVIRONMENT_ID,
  );
}

/** OmniRoute'ning "tiqilib qolgan" holati: resource-pressure 503 yoki jarayon javob bermayapti (502). */
export function isOmniStuck(status: number, message = ""): boolean {
  if (status === 502) return true;
  return status === 503 && /resource.pressure/i.test(message);
}

async function railway<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.RAILWAY_API_TOKEN) headers.Authorization = `Bearer ${process.env.RAILWAY_API_TOKEN}`;
  else headers["Project-Access-Token"] = process.env.RAILWAY_PROJECT_TOKEN!;
  const res = await fetch(RAILWAY_GQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || `Railway ${res.status}`);
  }
  return json.data as T;
}

/** Oxirgi restart vaqti (Supabase system_kv) — barcha serverless instansiyalar uchun umumiy. */
async function lastRestartAt(): Promise<number> {
  try {
    const { data } = await createServiceClient().from("system_kv").select("value").eq("key", KV_KEY).maybeSingle();
    const at = (data?.value as { at?: string } | null)?.at;
    return at ? new Date(at).getTime() : 0;
  } catch {
    return 0;
  }
}

async function markRestart(reason: string): Promise<void> {
  try {
    await createServiceClient()
      .from("system_kv")
      .upsert({ key: KV_KEY, value: { at: new Date().toISOString(), reason }, updated_at: new Date().toISOString() });
  } catch {
    /* jurnal ixtiyoriy */
  }
}

export type RestartResult = { restarted: boolean; reason: string; detail?: string };

/**
 * Railway'dagi OmniRoute'ni restart qiladi (cooldown bilan). `force` — kechki
 * profilaktik restart uchun (cooldown baribir amal qiladi).
 */
export async function restartOmniRoute(reason: string): Promise<RestartResult> {
  if (!isWatchdogConfigured()) return { restarted: false, reason, detail: "RAILWAY_* env sozlanmagan" };
  const since = Date.now() - (await lastRestartAt());
  if (since < COOLDOWN_MS) {
    return { restarted: false, reason, detail: `cooldown (${Math.round(since / 60000)} daqiqa oldin restart bo'lgan)` };
  }
  // Boshqa instansiyalar ham shu zahoti restart qilmasin — avval belgilaymiz.
  await markRestart(reason);
  try {
    const data = await railway<{ deployments: { edges: { node: { id: string; status: string } }[] } }>(
      `query latest($input: DeploymentListInput!) { deployments(input: $input, first: 1) { edges { node { id status } } } }`,
      { input: { serviceId: process.env.RAILWAY_SERVICE_ID, environmentId: process.env.RAILWAY_ENVIRONMENT_ID } },
    );
    const dep = data.deployments.edges[0]?.node;
    if (!dep) return { restarted: false, reason, detail: "deployment topilmadi" };
    try {
      await railway(`mutation restart($id: String!) { deploymentRestart(id: $id) }`, { id: dep.id });
    } catch {
      // Restart qo'llanmasa (mas. deploy tugamagan) — to'liq qayta deploy.
      await railway(`mutation redeploy($id: String!) { deploymentRedeploy(id: $id) { id } }`, { id: dep.id });
    }
    console.warn(`[omniroute-watchdog] restart: ${reason} (deployment ${dep.id}, status ${dep.status})`);
    return { restarted: true, reason, detail: dep.id };
  } catch (e) {
    return { restarted: false, reason, detail: e instanceof Error ? e.message : "Railway xatosi" };
  }
}

/** Chat/CLI OmniRoute'dan xato olganda chaqiriladi — tiqilib qolgan bo'lsa fonda restart. */
export function healOmniRouteIfStuck(status: number, message: string): void {
  if (!isOmniStuck(status, message)) return;
  void restartOmniRoute(`auto: ${status} ${message.slice(0, 80)}`).catch(() => {});
}

/** Kichik haqiqiy so'rov bilan tekshiradi (/models "200" bersa ham chat 503 bo'lishi mumkin). */
export async function probeOmniRoute(): Promise<{ healthy: boolean; status: number; message: string }> {
  const base = (process.env.OMNIROUTE_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return { healthy: false, status: 0, message: "OMNIROUTE_BASE_URL yo'q" };
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY ?? ""}` },
      body: JSON.stringify({
        model: process.env.OMNIROUTE_PROBE_MODEL ?? "auto/best-free",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text().catch(() => "");
    // Provayder xatosi (400/404/429) — OmniRoute tirik; faqat 502/503-pressure "tiqilgan".
    return { healthy: !isOmniStuck(res.status, text), status: res.status, message: text.slice(0, 200) };
  } catch (e) {
    return { healthy: false, status: 502, message: e instanceof Error ? e.message : "timeout" };
  }
}
