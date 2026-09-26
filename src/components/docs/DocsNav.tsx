"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";

export interface DocsNavItem {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

/** Tracks which section heading is currently at the top of the viewport. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    const els = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size > 0) {
          const [first] = [...visible.entries()].sort((a, b) => a[1] - b[1]);
          setActive(first[0]);
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key]);

  return active;
}

function NavList({ items, active, onNavigate }: { items: DocsNavItem[]; active: string | null; onNavigate?: () => void }) {
  const link = (id: string, isActive: boolean, sub: boolean) =>
    cn(
      "block rounded-lg px-3 transition-colors",
      sub ? "py-1 text-[13px]" : "py-1.5 text-sm font-medium",
      isActive ? "bg-primary/15 text-text-primary" : "text-text-secondary hover:bg-white/5 hover:text-text-primary",
    );

  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={onNavigate}
            aria-current={active === item.id ? "location" : undefined}
            className={link(item.id, active === item.id, false)}
          >
            {item.label}
          </a>
          {item.children && (
            <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
              {item.children.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    onClick={onNavigate}
                    aria-current={active === c.id ? "location" : undefined}
                    className={link(c.id, active === c.id, true)}
                  >
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function allIds(items: DocsNavItem[]): string[] {
  return items.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) ?? [])]);
}

/** Desktop: sticky left sidebar. */
export function DocsSidebar({ items }: { items: DocsNavItem[] }) {
  const t = useT();
  const active = useActiveSection(allIds(items));
  return (
    <nav aria-label={t("p7bDEyebrow")} className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8 pr-2">
      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{t("p7bDOnThisPage")}</p>
      <NavList items={items} active={active} />
    </nav>
  );
}

/** Mobile / tablet: collapsible "On this page" menu under the header. */
export function DocsMobileNav({ items }: { items: DocsNavItem[] }) {
  const t = useT();
  const ref = useRef<HTMLDetailsElement>(null);
  const active = useActiveSection(allIds(items));
  const current = items.flatMap((i) => [i, ...(i.children ?? [])]).find((i) => i.id === active);

  return (
    <details ref={ref} className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm text-text-secondary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          <span className="text-text-muted">{t("p7bDOnThisPage")}</span>
          {current && <span className="text-text-primary"> · {current.label}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <nav aria-label={t("p7bDEyebrow")} className="max-h-[70vh] overflow-y-auto border-t border-border px-2 py-3">
        <NavList
          items={items}
          active={active}
          onNavigate={() => {
            if (ref.current) ref.current.open = false;
          }}
        />
      </nav>
    </details>
  );
}
