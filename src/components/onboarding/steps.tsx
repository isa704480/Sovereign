"use client";

import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  AGE_GROUPS,
  COUNTRIES,
  EXPERIENCE_ZONES,
  INDUSTRIES,
  LANGUAGES,
  PRIORITIES,
  PURPOSES,
  experienceZone,
} from "@/config/onboarding";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useOnboarding } from "@/store/onboarding";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Chip } from "./Chip";
import { OptionCard } from "./OptionCard";

export function StepPurpose() {
  const purposes = useOnboarding((s) => s.purposes);
  const toggle = useOnboarding((s) => s.toggle);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {PURPOSES.map((o) => (
        <OptionCard
          key={o.id}
          emoji={o.emoji}
          label={o.label}
          description={o.description}
          selected={purposes.includes(o.id)}
          onToggle={() => toggle("purposes", o.id)}
        />
      ))}
    </div>
  );
}

function OtherInput({
  open,
  value,
  placeholder,
  onChange,
}: {
  open: boolean;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 12 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="overflow-hidden"
        >
          <Input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={80}
            className="h-11 rounded-xl border-border bg-bg-base/60 px-3.5 text-[15px] focus-visible:border-primary focus-visible:ring-primary/30 md:text-[15px]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StepIndustry() {
  const industries = useOnboarding((s) => s.industries);
  const other = useOnboarding((s) => s.otherIndustry ?? "");
  const toggle = useOnboarding((s) => s.toggle);
  const setOther = useOnboarding((s) => s.setOther);
  const [otherOpen, setOtherOpen] = useState(other.length > 0);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {INDUSTRIES.map((o) => (
          <Chip key={o.id} label={o.label} selected={industries.includes(o.id)} onToggle={() => toggle("industries", o.id)} />
        ))}
        <Chip
          label={otherOpen ? "Boshqa" : "Boshqa ..."}
          selected={otherOpen}
          onToggle={() => {
            if (otherOpen) setOther("otherIndustry", "");
            setOtherOpen((v) => !v);
          }}
        />
      </div>
      <OtherInput open={otherOpen} value={other} placeholder="Sohangizni yozing" onChange={(v) => setOther("otherIndustry", v)} />
    </div>
  );
}

export function StepPriorities() {
  const priorities = useOnboarding((s) => s.priorities);
  const toggle = useOnboarding((s) => s.toggle);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {PRIORITIES.map((o) => (
        <OptionCard
          key={o.id}
          emoji={o.emoji}
          label={o.label}
          description={o.description}
          selected={priorities.includes(o.id)}
          onToggle={() => toggle("priorities", o.id)}
        />
      ))}
    </div>
  );
}

export function StepLanguages() {
  const languages = useOnboarding((s) => s.languages);
  const other = useOnboarding((s) => s.otherLanguage ?? "");
  const toggle = useOnboarding((s) => s.toggle);
  const setOther = useOnboarding((s) => s.setOther);
  const [otherOpen, setOtherOpen] = useState(other.length > 0);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {LANGUAGES.map((o) => (
          <Chip key={o.id} emoji={o.emoji} label={o.label} selected={languages.includes(o.id)} onToggle={() => toggle("languages", o.id)} />
        ))}
        <button
          type="button"
          onClick={() => {
            if (otherOpen) setOther("otherLanguage", "");
            setOtherOpen((v) => !v);
          }}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed px-4 text-sm transition-colors",
            otherOpen ? "border-primary text-primary-soft" : "border-[var(--border-strong)] text-text-muted hover:text-text-primary",
          )}
        >
          <Plus className="size-4" /> Boshqa qo&apos;shish
        </button>
      </div>
      <OtherInput open={otherOpen} value={other} placeholder="Masalan: Turk, Koreys" onChange={(v) => setOther("otherLanguage", v)} />
    </div>
  );
}

export function StepAge() {
  const ageGroup = useOnboarding((s) => s.ageGroup ?? "");
  const setAgeGroup = useOnboarding((s) => s.setAgeGroup);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Yosh guruhi">
      {AGE_GROUPS.map((o) => (
        <OptionCard
          key={o.id}
          emoji={o.emoji}
          label={o.label}
          description={o.description}
          selected={ageGroup === o.id}
          onToggle={() => setAgeGroup(o.id)}
        />
      ))}
    </div>
  );
}

export function StepCountry() {
  const country = useOnboarding((s) => s.country ?? "");
  const other = useOnboarding((s) => s.otherCountry ?? "");
  const setCountry = useOnboarding((s) => s.setCountry);
  const setOtherCountry = useOnboarding((s) => s.setOtherCountry);
  const otherOpen = country === "other";

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Davlat">
        {COUNTRIES.map((o) => (
          <Chip key={o.id} emoji={o.emoji} label={o.label} selected={country === o.id} onToggle={() => setCountry(o.id)} />
        ))}
        <button
          type="button"
          onClick={() => setCountry(otherOpen ? "" : "other")}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed px-4 text-sm transition-colors",
            otherOpen ? "border-primary text-primary-soft" : "border-[var(--border-strong)] text-text-muted hover:text-text-primary",
          )}
        >
          <Plus className="size-4" /> Boshqa davlat
        </button>
      </div>
      <OtherInput open={otherOpen} value={other} placeholder="Davlat nomini yozing" onChange={setOtherCountry} />
    </div>
  );
}

export function StepExperience() {
  const experience = useOnboarding((s) => s.experience);
  const setExperience = useOnboarding((s) => s.setExperience);
  const zone = experienceZone(experience);

  return (
    <div>
      <div className="px-1">
        <Slider
          value={[experience]}
          onValueChange={(v) => setExperience(v[0] ?? 0)}
          min={0}
          max={100}
          step={1}
          aria-label="Tajriba darajasi"
          className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-bg-base [&_[data-slot=slider-thumb]]:shadow-glow [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-bg-hover"
        />
      </div>
      <div className="mt-3 flex justify-between text-xs text-text-muted">
        <span>Birinchi marta</span>
        <span>Har kuni</span>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2">
        {EXPERIENCE_ZONES.map((z) => {
          const active = z.id === zone.id;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setExperience(z.from + 16)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-center text-xs font-medium transition-colors",
                active
                  ? "border-[var(--border-accent)] bg-primary/10 text-text-primary"
                  : "border-border text-text-muted hover:text-text-secondary",
              )}
            >
              {z.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={zone.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="mt-5 flex items-center gap-2 text-sm text-text-secondary"
        >
          <span className="size-1.5 rounded-full bg-primary" />
          {zone.hint}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
