"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LangSwitcher } from "@/components/docs/LangSwitcher";
import { fmt, type TKey } from "@/lib/i18n";
import {
  isHealthSnapshot,
  overallStatus,
  type ComponentStatus,
  type HealthComponent,
  type HealthSnapshot,
  type OverallStatus,
} from "@/lib/status/types";
import { useT } from "@/store/chat";

type T = (key: TKey) => string;

const REFRESH_MS = 60_000;
const CLOCK_TICK_MS = 5_000;

const COLORS: Record<ComponentStatus, string> = {
  operational: "#22C55E",
  degraded: "#F59E0B",
  down: "#EF4444",
};

const STATUS_LABEL: Record<ComponentStatus, TKey> = {
  operational: "p7bSOperational",
  degraded: "p7bSDegraded",
  down: "p7bSDown",
};

const OVERALL: Record<OverallStatus, { text: TKey; color: string }> = {
  operational: { text: "p7bSAllOk", color: COLORS.operational },
  partial: { text: "p7bSPartial", color: COLORS.degraded },
  major: { text: "p7bSMajor", color: COLORS.down },
};

/** API JSON'i inglizcha qoladi (orqaga moslik) — nom id bo'yicha, izoh matni bo'yicha tarjima qilinadi. */
const COMPONENT_NAME = new Map<string, TKey>([
  ["web", "p7bSCWeb"],
  ["database", "p7bSCDatabase"],
  ["ai", "p7bSCAi"],
  ["images", "p7bDImgTitle"],
  ["payments", "p7bSCPayments"],
]);

/** src/lib/status/health.ts dagi qat'iy izohlar. Noma'lum izoh — o'zgarishsiz ko'rsatiladi. */
const NOTE_KEY = new Map<string, TKey>([
  ["Not configured", "p7bSNNotConfigured"],
  ["Slow responses", "p7bSNSlow"],
  ["Service unavailable", "p7bSNUnavailable"],
  ["Unexpected response", "p7bSNUnexpected"],
  ["Not responding", "p7bSNNotResponding"],
  ["Some models may be unavailable", "p7bSNSomeModels"],
  ["Using fallback provider", "p7bSNFallback"],
  ["Some payment methods not configured", "p7bSNSomePayments"],
  ["Check failed", "p7bSNCheckFailed"],
]);

function componentName(c: HealthComponent, t: T): string {
  const key = COMPONENT_NAME.get(c.id);
  return key ? t(key) : c.name;
}

function componentNote(note: string, t: T): string {
  const key = NOTE_KEY.get(note);
  return key ? t(key) : note;
}

const LINKS: { href: string; label: TKey }[] = [
  { href: "https://soveregn.xyz", label: "chHome" },
  { href: "https://app.soveregn.xyz/app", label: "p7bDOpenApp" },
  { href: "https://docs.soveregn.xyz", label: "p4dNavDocs" },
];

// ---- Soat: SSR'da null (hydration mos kelishi uchun), brauzerda har 5s yangilanadi.
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, CLOCK_TICK_MS);
  return () => clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS;
const clockServerSnapshot = () => null;

function relativeTime(iso: string, now: number | null, t: T): string {
  if (now === null) return t("p7bSJustNow");
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return t("p7bSUnknown");
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return t("p7bSJustNow");
  if (s < 60) return fmt(t("p7bSSecAgo"), { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? t("p7bSMinAgo1") : fmt(t("p7bSMinAgo"), { n: m });
  const h = Math.floor(m / 60);
  return h === 1 ? t("p7bSHourAgo1") : fmt(t("p7bSHourAgo"), { n: h });
}

function Dot({ color }: { color: string }) {
  return (
    <span aria-hidden="true" className="relative inline-flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inset-0 rounded-full opacity-40 blur-[3px]" style={{ backgroundColor: color }} />
      <span className="relative h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

export function StatusBoard({ initial }: { initial: HealthSnapshot | null }) {
  const t = useT();
  const [data, setData] = useState<HealthSnapshot | null>(initial);
  const [error, setError] = useState<TKey | null>(initial ? null : "p7bSErrUnavailable");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, clockServerSnapshot);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store", headers: { Accept: "application/json" } });
      if (res.status === 429) {
        setError("p7bSErr429");
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const json: unknown = await res.json();
      if (!isHealthSnapshot(json)) throw new Error("bad payload");
      setData(json);
      setError(null);
    } catch {
      setError("p7bSErrRefresh");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const overall = data ? OVERALL[overallStatus(data.components)] : null;
  const [checkedBefore, checkedAfter = ""] = t("p7bSLastChecked").split("{time}");

  return (
    <main className="flex-1 bg-[#060812] text-[#F0F2FF]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="https://soveregn.xyz"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5B50F0]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- kichik statik SVG logo */}
            <img src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <span className="font-[family-name:var(--font-syne)] text-lg font-bold tracking-wide">SOVEREIGN</span>
            <span className="rounded-full border border-[#5B50F0]/40 bg-[#5B50F0]/15 px-2 py-0.5 text-xs font-medium text-[#C9C4FF]">
              {t("p7bSBadge")}
            </span>
          </a>
          <div className="flex items-center gap-2">
            <LangSwitcher className="h-[34px] border-white/10 text-[#9BA3CC] hover:border-[#5B50F0]/60 focus-visible:outline-[#5B50F0]" />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#9BA3CC] transition-colors hover:border-[#5B50F0]/60 hover:text-[#F0F2FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B50F0] disabled:opacity-60"
            >
              {loading ? t("p7bSRefreshing") : t("p7bSRefresh")}
            </button>
          </div>
        </header>

        <section
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-2xl border p-5 sm:p-6"
          style={{
            borderColor: `${overall?.color ?? "#9BA3CC"}55`,
            background: `linear-gradient(135deg, ${overall?.color ?? "#9BA3CC"}1f, transparent 70%)`,
          }}
        >
          <div className="flex items-center gap-3">
            <Dot color={overall?.color ?? "#9BA3CC"} />
            <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold sm:text-2xl">
              {overall ? t(overall.text) : t("p7bSUnavailable")}
            </h1>
          </div>
          <p className="mt-2 text-sm text-[#9BA3CC]">
            {data ? (
              <>
                {checkedBefore}
                <time dateTime={data.checkedAt} suppressHydrationWarning>
                  {relativeTime(data.checkedAt, now, t)}
                </time>
                {checkedAfter}
                {" · "}
                {t("p7bSRefreshEvery")}
              </>
            ) : (
              t("p7bSLoadFail")
            )}
          </p>
          {error && data && <p className="mt-2 text-sm text-[#F59E0B]">{t(error)}</p>}
        </section>

        {data && (
          <section aria-labelledby="components-heading">
            <h2 id="components-heading" className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#9BA3CC]">
              {t("p7bSComponents")}
            </h2>
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              {data.components.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-x-3 px-4 py-4 sm:gap-x-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{componentName(c, t)}</p>
                    {c.note && <p className="mt-0.5 text-sm text-[#9BA3CC]">{componentNote(c.note, t)}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pt-0.5 text-sm sm:gap-4">
                    <span className="font-[family-name:var(--font-dm-mono)] text-[#9BA3CC] tabular-nums">
                      {c.latencyMs === null ? (
                        <span aria-label={t("p7bSLatencyNA")}>—</span>
                      ) : (
                        <>
                          <span className="sr-only">{t("p7bSLatency")} </span>
                          {fmt(t("p7bSMs"), { n: c.latencyMs })}
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-2 font-medium" style={{ color: COLORS[c.status] }}>
                      <Dot color={COLORS[c.status]} />
                      {t(STATUS_LABEL[c.status])}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-col gap-4 border-t border-white/[0.06] pt-6 text-sm text-[#9BA3CC] sm:flex-row sm:items-center sm:justify-between">
          <p>{t("p7bSFooter")}</p>
          <nav aria-label={t("p7bSLinksAria")} className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded text-[#F0F2FF] underline-offset-4 hover:text-[#5B50F0] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B50F0]"
              >
                {t(l.label)}
              </a>
            ))}
          </nav>
        </footer>
      </div>
    </main>
  );
}
