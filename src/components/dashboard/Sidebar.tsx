"use client";

import { Brain, FolderOpen, Globe, LogOut, MessageSquarePlus, PanelLeftClose, Search, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { MODEL_BY_ID } from "@/config/models";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { groupByDate, type Conversation } from "@/store/chat";
import { useTheme } from "./theme-context";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  conversations: Record<string, Conversation>;
  order: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  research: boolean;
  onToggleResearch: (on: boolean) => void;
  user: { name: string; email: string; avatarUrl?: string | null };
  isDev?: boolean;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="tt relative h-5 w-9 rounded-full transition-colors"
      style={{ background: on ? "var(--t-primary)" : "color-mix(in srgb, var(--t-text) 18%, transparent)" }}
    >
      <span
        className="absolute top-0.5 size-4 rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

export function Sidebar({
  open,
  onClose,
  conversations,
  order,
  activeId,
  onSelect,
  onNew,
  onDelete,
  research,
  onToggleResearch,
  user,
  isDev,
}: SidebarProps) {
  const { theme, model } = useTheme();
  const [q, setQ] = useState("");

  const filteredOrder = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return order;
    return order.filter((id) => conversations[id]?.title.toLowerCase().includes(needle));
  }, [q, order, conversations]);

  const groups = useMemo(() => groupByDate(filteredOrder, conversations), [filteredOrder, conversations]);
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const body = (
    <div className="flex h-full flex-col" style={{ color: "var(--t-text)" }}>
      {/* header */}
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 items-center justify-center rounded-lg text-sm"
            style={{ background: `color-mix(in srgb, ${model.primary} 20%, transparent)`, color: model.primary }}
          >
            {theme.glyph}
          </span>
          <span className={cn("text-[15px] font-semibold", theme.id === "sovereign" && "font-display tracking-[0.12em]")}>
            {theme.wordmark}
          </span>
          {theme.badge && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${model.primary} 22%, transparent)`, color: model.accent }}>
              {theme.badge}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} aria-label="Yopish">
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="tt flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: model.primary, borderRadius: "var(--t-radius)", boxShadow: `0 0 20px color-mix(in srgb, ${model.primary} 35%, transparent)` }}
        >
          <MessageSquarePlus className="size-4" /> Yangi suhbat
        </button>
        <label
          className="tt mt-2 flex items-center gap-2 border px-2.5 py-2 text-sm"
          style={{ borderColor: "var(--t-border)", borderRadius: "var(--t-radius)", background: "color-mix(in srgb, var(--t-text) 4%, transparent)" }}
        >
          <Search className="size-4 shrink-0" style={{ color: "var(--t-text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suhbatlarni qidirish"
            className="w-full bg-transparent text-sm outline-none placeholder:opacity-60"
          />
        </label>
      </div>

      {/* list */}
      <div className="mt-3 flex-1 overflow-y-auto px-2">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs" style={{ color: "var(--t-text-muted)" }}>
            {q ? "Hech narsa topilmadi" : "Hali suhbatlar yo'q"}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
              {g.label}
            </div>
            {g.ids.map((id) => {
              const c = conversations[id];
              const m = MODEL_BY_ID[c.modelId];
              const active = id === activeId;
              return (
                <div key={id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    className="tt flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                    style={{
                      borderRadius: "var(--t-radius)",
                      background: active ? `color-mix(in srgb, ${model.primary} 16%, transparent)` : "transparent",
                      color: active ? "var(--t-text)" : "var(--t-text-muted)",
                    }}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: m?.primary ?? "var(--t-primary)" }} />
                    <span className="truncate pr-6">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                    style={{ color: "var(--t-text-muted)" }}
                    aria-label="O'chirish"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* footer */}
      <div className="space-y-1 px-2 pb-2 pt-2" style={{ borderTop: "1px solid var(--t-border)" }}>
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm opacity-60" style={{ color: "var(--t-text-muted)" }} title="Phase 3" disabled>
          <Brain className="size-4" /> Xotira <span className="ml-auto text-[10px]">tez orada</span>
        </button>
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm opacity-60" style={{ color: "var(--t-text-muted)" }} title="Phase 4" disabled>
          <FolderOpen className="size-4" /> Knowledge Base <span className="ml-auto text-[10px]">tez orada</span>
        </button>
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm" style={{ color: "var(--t-text-muted)" }}>
          <Globe className="size-4" /> Research rejim
          <span className="ml-auto">
            <Toggle on={research} onChange={onToggleResearch} label="Research rejim" />
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2.5 px-3 py-2" style={{ borderTop: "1px solid var(--t-border)" }}>
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: model.primary }}>
              {initials || "S"}
            </span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-[11px]" style={{ color: "var(--t-text-muted)" }}>
              {isDev ? "Dev rejim" : "Free"} · <span style={{ color: model.accent }}>Upgrade →</span>
            </span>
          </span>
          <form action={signOut}>
            <button type="submit" className="rounded-md p-1.5 transition-colors hover:bg-white/10" style={{ color: "var(--t-text-muted)" }} title="Chiqish">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop */}
      <motion.aside
        initial={false}
        animate={{ width: open ? 264 : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="tt hidden h-full shrink-0 overflow-hidden border-r md:block"
        style={{ background: "var(--t-sidebar)", borderColor: "var(--t-border)" }}
      >
        <div className="h-full w-[264px]">{body}</div>
      </motion.aside>

      {/* mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={onClose}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.28, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="tt h-full w-[280px] border-r"
              style={{ background: "var(--t-sidebar)", borderColor: "var(--t-border)" }}
            >
              {body}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
