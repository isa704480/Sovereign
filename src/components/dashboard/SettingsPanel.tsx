"use client";

import { Download, LogOut, Palette, Settings, ShieldAlert, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import { deleteMyData, exportMyData } from "@/app/actions/account";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { EASE_OUT_EXPO } from "@/lib/motion";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string; avatarUrl?: string | null };
  plan: string;
  dynamicTheme: boolean;
  onToggleDynamicTheme: (v: boolean) => void;
  onUpgrade: () => void;
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--t-text, #F0F2FF)" }}>{title}</div>
        {desc && <div className="text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ background: on ? "var(--t-primary, #5B50F0)" : "color-mix(in srgb, var(--t-text,#fff) 18%, transparent)" }}
    >
      <span className="absolute top-0.5 size-5 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(22px)" : "translateX(2px)" }} />
    </button>
  );
}

export function SettingsPanel({ open, onClose, user, plan, dynamicTheme, onToggleDynamicTheme, onUpgrade }: SettingsPanelProps) {
  const [, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const planName = (isPlanId(plan) ? PLAN_BY_ID[plan] : PLAN_BY_ID.free).name;
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function exportData() {
    setMsg("Tayyorlanmoqda...");
    startTransition(async () => {
      const res = await exportMyData();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sovereign-export.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("Yuklab olindi.");
    });
  }

  function deleteData() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      await deleteMyData();
      try {
        localStorage.removeItem("sovereign.chat");
      } catch {
        /* ignore */
      }
      window.location.reload();
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt flex max-h-[88vh] w-full max-w-lg flex-col rounded-3xl border shadow-lg"
            style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <div className="flex items-center gap-2">
                <Settings className="size-5" style={{ color: "var(--t-accent, #7C6FF7)" }} />
                <span className="font-display text-lg font-bold">Sozlamalar</span>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Yopish" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              {/* Profil */}
              <div className="flex items-center gap-3 py-4">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-full text-base font-bold text-white" style={{ background: "var(--t-primary, #5B50F0)" }}>{initials || "S"}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{user.name}</div>
                  <div className="truncate text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{user.email}</div>
                </div>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--t-primary,#5B50F0) 18%, transparent)", color: "var(--t-accent,#7C6FF7)" }}>{planName}</span>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <div className="pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>Tarif</div>
                <Row title={`${planName} tarif`} desc="Ko'proq model va imkoniyatlar uchun oshiring.">
                  {plan !== "ultra" && (
                    <button type="button" onClick={onUpgrade} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--t-primary, #5B50F0)" }}>
                      <Sparkles className="size-3.5" /> Oshirish
                    </button>
                  )}
                </Row>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <div className="flex items-center gap-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <Palette className="size-3.5" /> Ko&apos;rinish
                </div>
                <Row title="Model atmosferasi" desc="Model almashganda butun interfeys unga moslashadi.">
                  <Toggle on={dynamicTheme} onChange={onToggleDynamicTheme} />
                </Row>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <div className="flex items-center gap-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <ShieldAlert className="size-3.5" /> Ma&apos;lumotlar va maxfiylik
                </div>
                <Row title="Ma'lumotlarni eksport" desc="Barcha suhbat, xotira va profil — JSON (GDPR).">
                  <button type="button" onClick={exportData} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                    <Download className="size-3.5" /> Eksport
                  </button>
                </Row>
                <Row title="Barcha ma'lumotni o'chirish" desc="Suhbatlar va xotira butunlay o'chiriladi.">
                  <button type="button" onClick={deleteData} className="rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: confirmDelete ? "var(--error,#EF4444)" : "var(--t-border, rgba(255,255,255,0.1))", color: "var(--error,#EF4444)" }}>
                    {confirmDelete ? "Tasdiqlash — o'chirish" : "O'chirish"}
                  </button>
                </Row>
                {msg && <p className="pb-2 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{msg}</p>}
              </div>
            </div>

            <div className="border-t px-5 py-3" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <form action={signOut}>
                <button type="submit" className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <LogOut className="size-4" /> Hisobdan chiqish
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
