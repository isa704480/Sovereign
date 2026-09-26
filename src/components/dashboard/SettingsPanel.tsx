"use client";

import {Download, Keyboard, LogOut, Palette, Settings, ShieldAlert, Sparkles, X} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import {
  deleteMyData,
  exportMyData,
  getTrainingOptIn,
  setTrainingOptIn as saveTrainingOptIn,
} from "@/app/actions/account";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { LANGS, translate } from "@/lib/i18n";
import { useChat, useT } from "@/store/chat";
import { useDialogA11y } from "./use-dialog-a11y";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string; avatarUrl?: string | null };
  plan: string;
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

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-6 w-11 shrink-0 rounded-full p-0 transition-colors disabled:opacity-50"
      style={{ background: on ? "var(--t-primary, #5B50F0)" : "color-mix(in srgb, var(--t-text,#fff) 18%, transparent)" }}
    >
      {/* left-0.5 pins the knob to the track; without it the button's centered content box shifts it out. */}
      <span
        className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; aria?: string; lang?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.aria}
          lang={o.lang}
          onClick={() => onChange(o.value)}
          className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
          style={{
            background: value === o.value ? "var(--t-primary, #5B50F0)" : "transparent",
            color: value === o.value ? "#fff" : "var(--t-text-muted, #9BA3CC)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({ open, onClose, user, plan, onUpgrade }: SettingsPanelProps) {
  const [, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { panelRef, titleId, dialogProps } = useDialogA11y(open, onClose);

  // Panel yopilganda "O'chirishni tasdiqlash" qurolsizlanadi — keyingi ochilishda
  // bitta bosish hamma narsani o'chirib yubormasin (render vaqtida, effektsiz).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setConfirmDelete(false);
      setMsg(null);
    }
  }
  const planName = (isPlanId(plan) ? PLAN_BY_ID[plan] : PLAN_BY_ID.free).name;
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  // Yangi sozlamalar — chat matn o'lchami, zichlik, streaming, enter, motion
  const fontSize = useChat((s) => s.fontSize);
  const setFontSize = useChat((s) => s.setFontSize);
  const density = useChat((s) => s.density);
  const setDensity = useChat((s) => s.setDensity);
  const enterToSend = useChat((s) => s.enterToSend);
  const setEnterToSend = useChat((s) => s.setEnterToSend);
  const streamingSpeed = useChat((s) => s.streamingSpeed);
  const setStreamingSpeed = useChat((s) => s.setStreamingSpeed);
  const reducedMotion = useChat((s) => s.reducedMotion);
  const setReducedMotion = useChat((s) => s.setReducedMotion);
  const autoScroll = useChat((s) => s.autoScroll);
  const setAutoScroll = useChat((s) => s.setAutoScroll);
  const lang = useChat((s) => s.lang);
  const setLang = useChat((s) => s.setLang);
  const t = useT();

  // null — hali server javobi kelmagan: switch o'chirilgan holda turadi, taxminiy "yoqilgan" ko'rsatilmaydi.
  const [trainingOptIn, setTrainingOptIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getTrainingOptIn()
      .then((v) => alive && setTrainingOptIn(v))
      .catch(() => alive && setMsg(translate(lang, "stLoadFailed")));
    return () => {
      alive = false;
    };
  }, [open, lang]);

  function changeTraining(v: boolean) {
    const prev = trainingOptIn;
    setTrainingOptIn(v);
    startTransition(async () => {
      const res = await saveTrainingOptIn(v).catch(() => ({ ok: false }));
      if (!res.ok) {
        // Saqlanmadi — switch haqiqiy holatga qaytadi.
        setTrainingOptIn(prev);
        setMsg(t("stSaveFailed"));
      }
    });
  }

  function exportData() {
    setMsg(t("preparing"));
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
      setMsg(t("downloaded"));
    });
  }

  function deleteData() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    startTransition(async () => {
      const res = await deleteMyData().catch(() => ({ ok: false }));
      if (!res.ok) {
        // Server o'chirmadi — "o'chirildi" deb ko'rsatib qayta yuklamaymiz.
        setMsg(t("stDeleteFailed"));
        return;
      }
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
        >
          <motion.div
            ref={panelRef}
            {...dialogProps}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt flex max-h-[88vh] w-full max-w-lg flex-col rounded-3xl border shadow-lg outline-none"
            style={{ background: "var(--t-surface, #0D1033)", borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <div className="flex items-center gap-2">
                <Settings className="size-5" style={{ color: "var(--t-accent, #7C6FF7)" }} />
                <h2 id={titleId} className="font-display text-lg font-bold">{t("settings")}</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t("close")} style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
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
                <div className="pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{t("plan")}</div>
                <Row title={`${planName} ${t("planWord")}`} desc={t("planUpgradeDesc")}>
                  {plan !== "ultra" && (
                    <button type="button" onClick={onUpgrade} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--t-primary, #5B50F0)" }}>
                      <Sparkles className="size-3.5" /> {t("upgrade")}
                    </button>
                  )}
                </Row>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <div className="flex items-center gap-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <Palette className="size-3.5" /> {t("appearance")}
                </div>
                <Row title={t("language")} desc={t("languageHint")}>
                  <Segmented
                    label={t("language")}
                    value={lang}
                    options={LANGS.map((l) => ({ value: l.id, label: l.short, aria: l.label, lang: l.htmlLang }))}
                    onChange={setLang}
                  />
                </Row>
                <Row title={t("fontSizeTitle")} desc={t("fontSizeDesc")}>
                  <Segmented
                    label={t("fontSizeTitle")}
                    value={fontSize}
                    options={[
                      { value: "sm", label: "S", aria: t("stFontSmall") },
                      { value: "md", label: "M", aria: t("stFontMedium") },
                      { value: "lg", label: "L", aria: t("stFontLarge") },
                    ]}
                    onChange={setFontSize}
                  />
                </Row>
                <Row title={t("densityTitle")} desc={t("densityDesc")}>
                  <Segmented
                    label={t("densityTitle")}
                    value={density}
                    options={[
                      { value: "compact", label: t("densityCompact") },
                      { value: "comfortable", label: t("densityComfortable") },
                    ]}
                    onChange={setDensity}
                  />
                </Row>
                <Row title={t("reducedMotionTitle")} desc={t("reducedMotionDesc")}>
                  <Toggle on={reducedMotion} onChange={setReducedMotion} label={t("reducedMotionTitle")} />
                </Row>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <div className="flex items-center gap-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <Keyboard className="size-3.5" /> {t("chatBehavior")}
                </div>
                <Row title={t("enterToSendTitle")} desc={t("enterToSendDesc")}>
                  <Toggle on={enterToSend} onChange={setEnterToSend} label={t("enterToSendTitle")} />
                </Row>
                <Row title={t("streamingTitle")} desc={t("streamingDesc")}>
                  <Segmented
                    label={t("streamingTitle")}
                    value={streamingSpeed}
                    options={[
                      { value: "natural", label: t("streamingNatural") },
                      { value: "instant", label: t("streamingInstant") },
                    ]}
                    onChange={setStreamingSpeed}
                  />
                </Row>
                <Row title={t("autoScrollTitle")} desc={t("autoScrollDesc")}>
                  <Toggle on={autoScroll} onChange={setAutoScroll} label={t("autoScrollTitle")} />
                </Row>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                <div className="flex items-center gap-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <ShieldAlert className="size-3.5" /> {t("dataPrivacy")}
                </div>
                <Row
                  title={t("trainingTitle")}
                  desc={t("trainingDesc")}
                >
                  <Toggle
                    on={trainingOptIn ?? false}
                    disabled={trainingOptIn === null}
                    label={t("trainingTitle")}
                    onChange={changeTraining}
                  />
                </Row>
                <Row title={t("exportTitle")} desc={t("exportDesc")}>
                  <button type="button" onClick={exportData} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
                    <Download className="size-3.5" /> {t("exportBtn")}
                  </button>
                </Row>
                <Row title={t("deleteAllTitle")} desc={t("deleteAllDesc")}>
                  <button type="button" onClick={deleteData} className="rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: confirmDelete ? "var(--error,#EF4444)" : "var(--t-border, rgba(255,255,255,0.1))", color: "var(--error,#EF4444)" }}>
                    {confirmDelete ? t("confirmDelete") : t("delete")}
                  </button>
                </Row>
                {msg && <p role="status" className="pb-2 text-xs" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>{msg}</p>}
              </div>
            </div>

            <div className="border-t px-5 py-3" style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))" }}>
              <form action={signOut}>
                <button type="submit" className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: "var(--t-text-muted, #9BA3CC)" }}>
                  <LogOut className="size-4" /> {t("logout")}
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
