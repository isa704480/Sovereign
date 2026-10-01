"use client";

/**
 * Admin: so'rovnoma javoblari kartasi.
 * admin_onboarding_full_stats() (migration 0044) natijasini ko'rsatadi:
 *  - Registratsiya funnel (jami → boshlagan → tugatgan)
 *  - Har savol uchun foiz paneli (maqsad, soha, ustuvorlik, til, tajriba)
 *  - Davlatlar va yosh guruhlari
 *  - Tavsiya qilingan modellar
 */

import { countryFlag, countryName } from "@/config/countries";
import { MODEL_BY_ID } from "@/config/models";

// ── Tiplar ──────────────────────────────────────────────────────────────────

interface SurveyItem {
  id: string;
  cnt: number;
  pct: number;
}

interface AgeItem {
  age_group: string;
  cnt: number;
  pct: number;
}

interface CountryItem {
  country: string;
  cnt: number;
  pct: number;
}

interface ExperienceItem {
  zone: "beginner" | "intermediate" | "expert";
  cnt: number;
  pct: number;
}

interface ModelItem {
  model: string;
  cnt: number;
  pct: number;
}

interface PlanItem {
  plan: string;
  cnt: number;
}

export interface SurveyStats {
  funnel: {
    total_registered: number;
    started_onboarding: number;
    completed_onboarding: number;
    registered_7d: number;
    registered_30d: number;
    completed_30d: number;
  };
  by_purpose: SurveyItem[];
  by_industry: SurveyItem[];
  by_priority: SurveyItem[];
  by_language: SurveyItem[];
  by_experience: ExperienceItem[];
  by_country: CountryItem[];
  by_age: AgeItem[];
  recommended_models: ModelItem[];
  by_plan: PlanItem[];
  total_completed: number;
}

// ── Yordam funksiyalar ───────────────────────────────────────────────────────

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}
function num(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

// Label xaritalari — onboarding/config/onboarding.ts bilan mos
const PURPOSE_LABELS: Record<string, string> = {
  work: "Ish / Biznes",
  research: "Tadqiqot",
  creative: "Ijodiy",
  personal: "Shaxsiy",
};
const PURPOSE_ICONS: Record<string, string> = {
  work: "💼", research: "🔬", creative: "🎨", personal: "💬",
};

const INDUSTRY_LABELS: Record<string, string> = {
  tech: "Texnologiya", business: "Biznes", education: "Ta'lim",
  health: "Sog'liqni saqlash", law: "Huquq", finance: "Moliya",
  marketing: "Marketing", engineering: "Muhandislik",
  science: "Ilmiy tadqiqot", creative: "Ijodiy sohalar",
};

const PRIORITY_LABELS: Record<string, string> = {
  speed: "Tezlik ⚡", accuracy: "Aniqlik 🎯",
  privacy: "Maxfiylik 🔒", price: "Narx 💰",
};

const LANGUAGE_LABELS: Record<string, string> = {
  uz: "O'zbek 🇺🇿", ru: "Русский 🇷🇺", en: "English 🇺🇸",
  de: "Deutsch 🇩🇪", fr: "Français 🇫🇷", ar: "العربية 🇸🇦",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Yangi boshlovchi", intermediate: "O'rta", expert: "Ekspert",
};
const EXPERIENCE_COLORS: Record<string, string> = {
  beginner: "#10D4A0", intermediate: "#5B50F0", expert: "#FF7000",
};

const AGE_LABELS: Record<string, string> = {
  u18: "18 gacha", "18-24": "18–24", "25-34": "25–34",
  "35-44": "35–44", "45-54": "45–54", "55+": "55+",
};

const PLAN_COLORS: Record<string, string> = {
  free: "#9BA3CC", starter: "#10D4A0", pro: "#5B50F0", ultra: "#FF7000",
};
const PLAN_LABELS: Record<string, string> = {
  free: "Free", starter: "Basic", pro: "Pro", ultra: "Ultra",
};

// ── Kichik komponentlar ──────────────────────────────────────────────────────

/** Foiz paneli — label + bar + foiz + son */
function BarRow({
  label, pct: p, count, color = "#5B50F0", maxPct = 100,
}: {
  label: string;
  pct: number;
  count: number;
  color?: string;
  maxPct?: number;
}) {
  const width = maxPct > 0 ? Math.min(100, (p / maxPct) * 100) : p;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 truncate text-xs text-white/70" title={label}>
        {label}
      </div>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <div className="w-12 text-right text-xs tabular-nums text-white/60">{pct(p)}</div>
      <div className="w-8 text-right text-xs tabular-nums text-white/40">{num(count)}</div>
    </div>
  );
}

/** Section sarlavhasi */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-white/50">
      {children}
    </h3>
  );
}

/** Funnel qadami */
function FunnelStep({
  label, count, total, color,
}: { label: string; count: number; total: number; color: string }) {
  const p = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
        {num(count)}
      </div>
      <div className="text-center text-xs text-white/60">{label}</div>
      {total > 0 && count !== total && (
        <div className="text-[11px] tabular-nums text-white/40">{pct(p)}</div>
      )}
    </div>
  );
}

// ── Asosiy komponent ──────────────────────────────────────────────────────────

export function OnboardingSurveyCard({ data }: { data: SurveyStats | null }) {
  if (!data) {
    return (
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/60">
          {"So'rovnoma statistikasi"}
        </h2>
        <p className="mt-4 text-sm text-white/40">
          {"Ma'lumot yo'q. Migration 0044 ni Supabase'ga qo'llang."}
        </p>
      </section>
    );
  }

  const { funnel, by_purpose, by_industry, by_priority, by_language,
    by_experience, by_country, by_age, recommended_models, by_plan,
    total_completed } = data;

  // Foiz panellari uchun maksimal qiymat (100% ga normalizatsiya emas — haqiqiy foizlar)
  const maxPct = 100;

  return (
    <section className="mt-8 space-y-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/60">
          {"So'rovnoma statistikasi"}
        </h2>
        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/50">
          {num(total_completed)} javob
        </span>
      </div>

      {/* ── Funnel ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Registratsiya funnel</SectionTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FunnelStep
            label="Jami ro'yxatdan o'tgan"
            count={funnel.total_registered}
            total={funnel.total_registered}
            color="#EBEEFA"
          />
          <FunnelStep
            label="So'rovnoma boshlagan"
            count={funnel.started_onboarding}
            total={funnel.total_registered}
            color="#5B50F0"
          />
          <FunnelStep
            label="So'rovnoma tugatgan"
            count={funnel.completed_onboarding}
            total={funnel.total_registered}
            color="#10D4A0"
          />
          <FunnelStep
            label="Oxirgi 30 kunda yangi"
            count={funnel.registered_30d}
            total={funnel.total_registered}
            color="#F5AA3C"
          />
        </div>
        {/* Funnel progress bar */}
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
          {funnel.total_registered > 0 && (
            <>
              <div
                className="bg-[#5B50F0] transition-all"
                style={{ width: `${(funnel.started_onboarding / funnel.total_registered) * 100}%` }}
              />
              <div
                className="bg-[#10D4A0] transition-all"
                style={{ width: `${(funnel.completed_onboarding / funnel.total_registered) * 100}%` }}
              />
            </>
          )}
        </div>
        <div className="mt-1.5 flex gap-4 text-[11px] text-white/40">
          <span>
            <span className="inline-block size-2 rounded-full bg-[#5B50F0] mr-1" />
            {"So'rovnoma boshlagan"}
          </span>
          <span>
            <span className="inline-block size-2 rounded-full bg-[#10D4A0] mr-1" />
            Tugatgan
          </span>
        </div>
      </div>

      {/* ── Tarif taqsimoti ─────────────────────────────────────────── */}
      {by_plan.length > 0 && (
        <div>
        <SectionTitle>{"Tarif bo'yicha foydalanuvchilar"}</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {by_plan.map((p) => (
              <div
                key={p.plan}
                className="flex items-center gap-2 rounded-full border px-4 py-2"
                style={{ borderColor: `${PLAN_COLORS[p.plan] ?? "#5B50F0"}40` }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: PLAN_COLORS[p.plan] ?? "#5B50F0" }}
                />
                <span className="text-sm text-white/80">
                  {PLAN_LABELS[p.plan] ?? p.plan}
                </span>
                <span className="text-sm font-semibold tabular-nums text-white">
                  {num(p.cnt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Savollar (2 ustun grid) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

        {/* Maqsad */}
        {by_purpose.length > 0 && (
          <div>
            <SectionTitle>Maqsad nima?</SectionTitle>
            <div className="space-y-2">
              {by_purpose.map((item) => (
                <BarRow
                  key={item.id}
                  label={`${PURPOSE_ICONS[item.id] ?? ""} ${PURPOSE_LABELS[item.id] ?? item.id}`}
                  pct={item.pct}
                  count={item.cnt}
                  color="#5B50F0"
                  maxPct={maxPct}
                />
              ))}
            </div>
          </div>
        )}

        {/* Ustuvorlik */}
        {by_priority.length > 0 && (
          <div>
            <SectionTitle>Eng muhimi nima?</SectionTitle>
            <div className="space-y-2">
              {by_priority.map((item) => (
                <BarRow
                  key={item.id}
                  label={PRIORITY_LABELS[item.id] ?? item.id}
                  pct={item.pct}
                  count={item.cnt}
                  color="#FF7000"
                  maxPct={maxPct}
                />
              ))}
            </div>
          </div>
        )}

        {/* Soha */}
        {by_industry.length > 0 && (
          <div>
            <SectionTitle>Qaysi soha?</SectionTitle>
            <div className="space-y-2">
              {by_industry.map((item) => (
                <BarRow
                  key={item.id}
                  label={INDUSTRY_LABELS[item.id] ?? item.id}
                  pct={item.pct}
                  count={item.cnt}
                  color="#10D4A0"
                  maxPct={maxPct}
                />
              ))}
            </div>
          </div>
        )}

        {/* Til */}
        {by_language.length > 0 && (
          <div>
            <SectionTitle>Qaysi tilda ishlaydi?</SectionTitle>
            <div className="space-y-2">
              {by_language.map((item) => (
                <BarRow
                  key={item.id}
                  label={LANGUAGE_LABELS[item.id] ?? item.id}
                  pct={item.pct}
                  count={item.cnt}
                  color="#8B7DFF"
                  maxPct={maxPct}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tajriba darajasi */}
        {by_experience.length > 0 && (
          <div>
            <SectionTitle>Tajriba darajasi</SectionTitle>
            <div className="space-y-2">
              {by_experience.map((item) => (
                <BarRow
                  key={item.zone}
                  label={EXPERIENCE_LABELS[item.zone] ?? item.zone}
                  pct={item.pct}
                  count={item.cnt}
                  color={EXPERIENCE_COLORS[item.zone] ?? "#5B50F0"}
                  maxPct={maxPct}
                />
              ))}
            </div>
          </div>
        )}

        {/* Yosh guruhlari */}
        {by_age.length > 0 && (
          <div>
            <SectionTitle>Yosh guruhlari</SectionTitle>
            <div className="space-y-2">
              {by_age.map((item) => (
                <BarRow
                  key={item.age_group}
                  label={AGE_LABELS[item.age_group] ?? item.age_group}
                  pct={item.pct}
                  count={item.cnt}
                  color="#F5AA3C"
                  maxPct={maxPct}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Davlatlar (top-20) ───────────────────────────────────────── */}
      {by_country.length > 0 && (
        <div>
          <SectionTitle>Davlatlar (top {by_country.length})</SectionTitle>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0A0B12] text-[11px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Davlat</th>
                  <th className="px-3 py-2 text-right font-normal">Foydalanuvchi</th>
                  <th className="px-3 py-2 text-right font-normal">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {by_country.map((c) => (
                  <tr key={c.country}>
                    <td className="px-3 py-2 text-white/80">
                      <span className="mr-2">{countryFlag(c.country)}</span>
                      {countryName(c.country) ?? c.country}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/60">
                      {num(c.cnt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/50">
                      {pct(c.pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tavsiya qilingan modellar ────────────────────────────────── */}
      {recommended_models.length > 0 && (
        <div>
      <SectionTitle>{"Tavsiya qilingan model (onboarding'dan keyin)"}</SectionTitle>
          <div className="space-y-2">
            {recommended_models.map((item) => {
              const m = MODEL_BY_ID[item.model];
              const label = m?.name ?? item.model;
              const color = m?.primary ?? "#5B50F0";
              return (
                <BarRow
                  key={item.model}
                  label={label}
                  pct={item.pct}
                  count={item.cnt}
                  color={color}
                  maxPct={maxPct}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
