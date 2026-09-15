"use client";

import { ExternalLink, Globe, X } from "lucide-react";
import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

interface SourcesPanelProps {
  citations: string[];
  query?: string;
  updatedAt?: string;
  onClose: () => void;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ago(iso?: string) {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.round(diff / 60000);
  if (m < 1) return "hozirgina";
  if (m < 60) return `${m} daqiqa oldin`;
  return `${Math.round(m / 60)} soat oldin`;
}

export function SourcesPanel({ citations, query, updatedAt, onClose }: SourcesPanelProps) {
  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="tt hidden w-[300px] shrink-0 flex-col border-l lg:flex"
      style={{ background: "var(--t-sidebar)", borderColor: "var(--t-border)" }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--t-border)" }}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
          <Globe className="size-3.5" style={{ color: "var(--t-primary)" }} /> Manbalar
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Yopish">
          <X className="size-4" />
        </button>
      </div>

      <ol className="flex-1 space-y-1 overflow-y-auto p-3">
        {citations.map((url, i) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="tt group flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-white/5"
              style={{ borderRadius: "var(--t-radius)" }}
            >
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                style={{ background: "color-mix(in srgb, var(--t-primary) 20%, transparent)", color: "var(--t-accent)" }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" style={{ color: "var(--t-text)" }}>
                  {hostOf(url)}
                </span>
                <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>
                  {url}
                </span>
              </span>
              <ExternalLink className="mt-1 size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
            </a>
          </li>
        ))}
      </ol>

      <div className="space-y-2 px-4 py-3 text-xs" style={{ borderTop: "1px solid var(--t-border)", color: "var(--t-text-muted)" }}>
        {query && (
          <div>
            <div className="mb-0.5 uppercase tracking-wider">Qidiruv so&apos;zi</div>
            <div className="line-clamp-2" style={{ color: "var(--t-text)" }}>
              &ldquo;{query}&rdquo;
            </div>
          </div>
        )}
        {updatedAt && <div>Oxirgi yangilash: {ago(updatedAt)}</div>}
      </div>
    </motion.aside>
  );
}
