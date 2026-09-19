"use client";

import { Brain, FolderOpen, Globe, LogOut, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Search, Settings, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { MODEL_BY_ID } from "@/config/models";
import type { Plan } from "@/config/plans";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { groupByDate, type Conversation } from "@/store/chat";
import { useTheme } from "./theme-context";

interface SidebarProps {
  open: boolean;
  onOpen: () => void;
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
  plan: Plan;
  onUpgrade: () => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
  onOpenKnowledge: () => void;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="tt relative h-5 w-9 shrink-0 rounded-full p-0 transition-colors"
      style={{ background: on ? "var(--t-primary)" : "color-mix(in srgb, var(--t-text) 18%, transparent)" }}
    >
      <span
        className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform duration-200"
        style={{ transform: on ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

export function Sidebar({
  open,
  onOpen,
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
  plan,
  onUpgrade,
  onOpenMemory,
  onOpenSettings,
  onOpenKnowledge,
}: SidebarProps) {
  const { theme, model } = useTheme();
  const [q, setQ] = useState("");
  const openSearch = useCallback(() => {
    onOpen();
    // Focus the desktop panel's input once it has expanded enough to be visible.
    setTimeout(() => document.querySelector<HTMLInputElement>("aside [data-sidebar-search]")?.focus(), 260);
  }, [onOpen]);

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
        <Link href="/" className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-80" title="Bosh sahifa">
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
        </Link>
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
            data-sidebar-search
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

      {/* footer — Apple unified panel: hairline dividers ichida, chegara tashqarida */}
      <div className="px-2 pb-3 pt-2">
        <div
          className="tt overflow-hidden"
          style={{
            border: "1px solid var(--t-border)",
            borderRadius: "14px",
            background: "color-mix(in srgb, var(--t-text) 3%, transparent)",
          }}
        >
          {/* Xotira */}
          <button
            type="button"
            onClick={onOpenMemory}
            className="tt flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
            style={{ color: "var(--t-text)" }}
          >
            <Brain className="size-4" style={{ color: "var(--t-text-muted)" }} />
            <span className="flex-1 text-left">Xotira</span>
          </button>

          <div style={{ height: 1, background: "var(--t-border)" }} />

          {/* Knowledge Base */}
          <button
            type="button"
            onClick={onOpenKnowledge}
            className="tt flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
            style={{ color: "var(--t-text)" }}
          >
            <FolderOpen className="size-4" style={{ color: "var(--t-text-muted)" }} />
            <span className="flex-1 text-left">Knowledge Base</span>
          </button>

          <div style={{ height: 1, background: "var(--t-border)" }} />

          {/* Research rejim (toggle qatori) */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm" style={{ color: "var(--t-text)" }}>
            <Globe className="size-4" style={{ color: "var(--t-text-muted)" }} />
            <span className="flex-1">Research rejim</span>
            <Toggle on={research} onChange={onToggleResearch} label="Research rejim" />
          </div>

          <div style={{ height: 1, background: "var(--t-border)" }} />

          {/* Sozlamalar */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="tt flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
            style={{ color: "var(--t-text)" }}
          >
            <Settings className="size-4" style={{ color: "var(--t-text-muted)" }} />
            <span className="flex-1 text-left">Sozlamalar</span>
          </button>

          <div style={{ height: 1, background: "var(--t-border)" }} />

          {/* Akkaunt tile — WCAG 2.5.5: nested interactive elements yo'q.
             3 alohida tugma flex ichida. Butun profil qismi Settings ochadi. */}
          <div className="flex items-center gap-2 px-2 py-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="tt group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
              aria-label="Sozlamalarni ochish"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: model.primary }}
                >
                  {initials || "S"}
                </span>
              )}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium" style={{ color: "var(--t-text)" }}>
                  {user.name}
                </span>
                <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>
                  <span style={{ color: plan.color }}>{plan.name}</span>
                  {isDev ? " · Dev" : ""}
                </span>
              </span>
            </button>

            {plan.id !== "ultra" && (
              <button
                type="button"
                onClick={onUpgrade}
                className="tt shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
                style={{ color: model.accent }}
                title="Tarifni oshirish"
              >
                Upgrade →
              </button>
            )}

            <form action={signOut} className="shrink-0">
              <button
                type="submit"
                className="rounded-md p-1.5 opacity-60 transition-all hover:bg-[color:var(--surface-hover)] hover:opacity-100"
                style={{ color: "var(--t-text-muted)" }}
                title="Chiqish"
                aria-label="Chiqish"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  const railItems = [
    { label: "Yangi suhbat", Icon: MessageSquarePlus, onClick: onNew, primary: true },
    { label: "Suhbatlarni qidirish", Icon: Search, onClick: openSearch },
    { label: "Xotira", Icon: Brain, onClick: onOpenMemory },
    { label: "Knowledge Base", Icon: FolderOpen, onClick: onOpenKnowledge },
    { label: research ? "Research rejim: yoqilgan" : "Research rejim", Icon: Globe, onClick: () => onToggleResearch(!research), active: research },
    { label: "Sozlamalar", Icon: Settings, onClick: onOpenSettings },
  ];

  // Collapsed desktop state: a slim icon rail that stays visible and expands on click.
  const rail = (
    <div className="flex h-full w-[60px] flex-col items-center gap-1 py-3" style={{ color: "var(--t-text)" }}>
      <button
        type="button"
        onClick={onOpen}
        className="mb-1 rounded-lg p-2 transition-colors hover:bg-white/10"
        style={{ color: "var(--t-text-muted)" }}
        aria-label="Panelni ochish"
        title="Panelni ochish"
      >
        <PanelLeftOpen className="size-5" />
      </button>
      {railItems.map(({ label, Icon, onClick, primary, active }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-label={label}
          title={label}
          aria-pressed={active}
          className={cn("tt flex size-10 items-center justify-center rounded-xl transition-all hover:scale-105", !primary && "hover:bg-white/10")}
          style={
            primary
              ? { background: "var(--t-primary)", color: "#fff", boxShadow: "0 0 16px color-mix(in srgb, var(--t-primary) 35%, transparent)" }
              : {
                  color: active ? "var(--t-primary)" : "var(--t-text-muted)",
                  background: active ? "color-mix(in srgb, var(--t-primary) 16%, transparent)" : undefined,
                }
          }
        >
          <Icon className="size-[18px]" />
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenSettings}
        className="mt-auto rounded-full transition-transform hover:scale-105"
        aria-label="Sozlamalarni ochish"
        title={`${user.name} · ${plan.name}`}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--t-primary)" }}>
            {initials || "S"}
          </span>
        )}
      </button>
    </div>
  );

  return (
    <>
      {/* desktop: full panel ↔ icon rail */}
      <motion.aside
        initial={false}
        animate={{ width: open ? 264 : 60 }}
        transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
        className="tt relative hidden h-full shrink-0 overflow-hidden border-r md:block"
        style={{ background: "var(--t-sidebar)", borderColor: "var(--t-border)" }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0, x: open ? 0 : -16 }}
          transition={{ duration: open ? 0.25 : 0.12, delay: open ? 0.08 : 0, ease: EASE }}
          className="absolute inset-y-0 left-0 w-[264px]"
          style={{ pointerEvents: open ? "auto" : "none" }}
          aria-hidden={!open}
          inert={!open}
        >
          {body}
        </motion.div>
        <motion.div
          initial={false}
          animate={{ opacity: open ? 0 : 1 }}
          transition={{ duration: open ? 0.1 : 0.2, delay: open ? 0 : 0.1, ease: EASE }}
          className="absolute inset-y-0 left-0"
          style={{ pointerEvents: open ? "none" : "auto" }}
          aria-hidden={open}
          inert={open}
        >
          {rail}
        </motion.div>
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
