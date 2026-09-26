/**
 * Status page / health API uchun umumiy turlar va sof funksiyalar
 * (server ham, client ham import qiladi — bu yerda maxfiy narsa yo'q).
 */
export type ComponentStatus = "operational" | "degraded" | "down";

export type HealthComponent = {
  id: string;
  name: string;
  status: ComponentStatus;
  /** O'lchanmagan bo'lsa null (mas. faqat konfiguratsiya tekshiruvi). */
  latencyMs: number | null;
  note?: string;
};

export type HealthSnapshot = {
  ok: boolean;
  checkedAt: string;
  components: HealthComponent[];
};

export type OverallStatus = "operational" | "partial" | "major";

/** Asosiy xizmatlar — bular ishlamasa sayt umuman foydalanib bo'lmaydi. */
const CRITICAL_IDS = new Set(["web", "database"]);

export function overallStatus(components: HealthComponent[]): OverallStatus {
  const down = components.filter((c) => c.status === "down");
  if (down.some((c) => CRITICAL_IDS.has(c.id)) || down.length >= 2) return "major";
  if (down.length > 0 || components.some((c) => c.status === "degraded")) return "partial";
  return "operational";
}

const STATUSES: readonly ComponentStatus[] = ["operational", "degraded", "down"];

/** /api/health javobini ishonchsiz ma'lumot sifatida tekshiradi. */
export function isHealthSnapshot(value: unknown): value is HealthSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.ok !== "boolean" || typeof v.checkedAt !== "string" || !Array.isArray(v.components)) return false;
  return v.components.every((c: unknown) => {
    if (!c || typeof c !== "object") return false;
    const x = c as Record<string, unknown>;
    return (
      typeof x.id === "string" &&
      typeof x.name === "string" &&
      STATUSES.includes(x.status as ComponentStatus) &&
      (x.latencyMs === null || typeof x.latencyMs === "number") &&
      (x.note === undefined || typeof x.note === "string")
    );
  });
}
