"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnboardingAnswers } from "@/lib/recommend-model";
import { TOTAL_STEPS } from "@/config/onboarding";

interface OnboardingState extends OnboardingAnswers {
  /** 0-based index of the active step; TOTAL_STEPS means "completion". */
  step: number;
  /** +1 when moving forward, -1 when going back (drives slide direction). */
  direction: 1 | -1;
  toggle: (field: "purposes" | "industries" | "priorities" | "languages", id: string) => void;
  setOther: (field: "otherIndustry" | "otherLanguage", value: string) => void;
  setExperience: (value: number) => void;
  setAgeGroup: (id: string) => void;
  setCountry: (id: string) => void;
  setOtherCountry: (value: string) => void;
  next: () => void;
  back: () => void;
  goTo: (step: number) => void;
  reset: () => void;
}

const initial: OnboardingAnswers & { step: number; direction: 1 | -1 } = {
  step: 0,
  direction: 1,
  purposes: [],
  industries: [],
  otherIndustry: "",
  priorities: [],
  languages: ["uz"],
  otherLanguage: "",
  experience: 50,
  ageGroup: "",
  country: "",
  otherCountry: "",
};

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      toggle: (field, id) =>
        set((s) => {
          const list = s[field];
          return {
            [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
          } as Partial<OnboardingState>;
        }),
      setOther: (field, value) => set({ [field]: value } as Partial<OnboardingState>),
      setExperience: (experience) => set({ experience }),
      setAgeGroup: (ageGroup) => set({ ageGroup }),
      setCountry: (country) => set((s) => ({ country, otherCountry: country === "other" ? s.otherCountry : "" })),
      setOtherCountry: (otherCountry) => set({ otherCountry }),
      next: () => set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS), direction: 1 })),
      back: () => set((s) => ({ step: Math.max(s.step - 1, 0), direction: -1 })),
      goTo: (step) =>
        set((s) => ({
          step: Math.max(0, Math.min(step, TOTAL_STEPS)),
          direction: step >= s.step ? 1 : -1,
        })),
      reset: () => set({ ...initial }),
    }),
    {
      name: "sovereign.onboarding",
      skipHydration: true,
      partialize: (s) => ({
        step: s.step,
        purposes: s.purposes,
        industries: s.industries,
        otherIndustry: s.otherIndustry,
        priorities: s.priorities,
        languages: s.languages,
        otherLanguage: s.otherLanguage,
        experience: s.experience,
        ageGroup: s.ageGroup,
        country: s.country,
        otherCountry: s.otherCountry,
      }),
    },
  ),
);

const subscribeHydration = (cb: () => void) => useOnboarding.persist.onFinishHydration(cb);
const getHydrated = () => useOnboarding.persist.hasHydrated();
const getServerHydrated = () => false;

/** Rehydrates from localStorage after mount to avoid SSR mismatches. */
export function useOnboardingHydrated(): boolean {
  useEffect(() => {
    void useOnboarding.persist.rehydrate();
  }, []);
  return useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
}

/** Whether the current step has enough input to continue. */
export function stepIsValid(s: OnboardingAnswers, step: number): boolean {
  switch (step) {
    case 0:
      return s.purposes.length > 0;
    case 1:
      return s.industries.length > 0 || (s.otherIndustry ?? "").trim().length > 0;
    case 2:
      return s.priorities.length > 0;
    case 3:
      return s.languages.length > 0 || (s.otherLanguage ?? "").trim().length > 0;
    case 4:
      return true;
    case 5:
      return (s.ageGroup ?? "").length > 0;
    case 6:
      return /^[A-Z]{2}$/.test(s.country ?? "");
    default:
      return false;
  }
}
