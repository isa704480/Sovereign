"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  isHealthSnapshot,
  overallStatus,
  type ComponentStatus,
  type HealthSnapshot,
  type OverallStatus,
} from "@/lib/status/types";

const REFRESH_MS = 60_000;
const CLOCK_TICK_MS = 5_000;

const COLORS: Record<ComponentStatus, string> = {
  operational: "#22C55E",
  degraded: "#F59E0B",
  down: "#EF4444",
};

const STATUS_LABEL: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
};

const OVERALL: Record<OverallStatus, { text: string; color: string }> = {
  operational: { text: "All systems operational", color: COLORS.operational },
  partial: { text: "Partial outage", color: COLORS.degraded },
  major: { text: "Major outage", color: COLORS.down },
};

const LINKS = [
  { href: "https://soveregn.xyz", label: "Home" },
  { href: "https://app.soveregn.xyz/app", label: "Open app" },
  { href: "https://docs.soveregn.xyz", label: "Docs" },
];

// ---- Soat: SSR'da null (hydration mos kelishi uchun), brauzerda har 5s yangilanadi.
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, CLOCK_TICK_MS);
  return () => clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS;
const clockServerSnapshot = () => null;

function relativeTime(iso: string, now: number | null): string {
  if (now === null) return "just now";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
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
  const [data, setData] = useState<HealthSnapshot | null>(initial);
  const [error, setError] = useState<string | null>(initial ? null : "Status is temporarily unavailable.");
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
        setError("Too many requests. Showing the last known status.");
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const json: unknown = await res.json();
      if (!isHealthSnapshot(json)) throw new Error("bad payload");
      setData(json);
      setError(null);
    } catch {
      setError("Could not refresh status. Showing the last known status.");
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
              Status
            </span>
          </a>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#9BA3CC] transition-colors hover:border-[#5B50F0]/60 hover:text-[#F0F2FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B50F0] disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
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
              {overall?.text ?? "Status unavailable"}
            </h1>
          </div>
          <p className="mt-2 text-sm text-[#9BA3CC]">
            {data ? (
              <>
                Last checked{" "}
                <time dateTime={data.checkedAt} suppressHydrationWarning>
                  {relativeTime(data.checkedAt, now)}
                </time>
                {" · "}Refreshes every 60 seconds
              </>
            ) : (
              "We couldn't load the current status. Retrying automatically."
            )}
          </p>
          {error && data && <p className="mt-2 text-sm text-[#F59E0B]">{error}</p>}
        </section>

        {data && (
          <section aria-labelledby="components-heading">
            <h2 id="components-heading" className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#9BA3CC]">
              Components
            </h2>
            <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              {data.components.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-x-3 px-4 py-4 sm:gap-x-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.name}</p>
                    {c.note && <p className="mt-0.5 text-sm text-[#9BA3CC]">{c.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pt-0.5 text-sm sm:gap-4">
                    <span className="font-[family-name:var(--font-dm-mono)] text-[#9BA3CC] tabular-nums">
                      {c.latencyMs === null ? (
                        <span aria-label="Latency not measured">—</span>
                      ) : (
                        <>
                          <span className="sr-only">Latency </span>
                          {c.latencyMs} ms
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-2 font-medium" style={{ color: COLORS[c.status] }}>
                      <Dot color={COLORS[c.status]} />
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-col gap-4 border-t border-white/[0.06] pt-6 text-sm text-[#9BA3CC] sm:flex-row sm:items-center sm:justify-between">
          <p>Checks run from our servers and are cached for up to 60 seconds.</p>
          <nav aria-label="SOVEREIGN links" className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded text-[#F0F2FF] underline-offset-4 hover:text-[#5B50F0] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B50F0]"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </footer>
      </div>
    </main>
  );
}
