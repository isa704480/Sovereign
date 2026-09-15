import { MODEL_BY_ID, type SovereignModel } from "@/config/models";

export interface OnboardingAnswers {
  purposes: string[];
  industries: string[];
  otherIndustry?: string;
  priorities: string[];
  languages: string[];
  otherLanguage?: string;
  /** 0..100 */
  experience: number;
}

export interface Recommendation {
  model: SovereignModel;
  reason: string;
}

/**
 * Picks a default model from onboarding answers (ARCHITECTURE.md §5.2 selectOptimalModel
 * adapted to questionnaire signals). Deterministic, no network.
 */
export function recommendModel(a: OnboardingAnswers): Recommendation {
  const has = (list: string[], id: string) => list.includes(id);

  if (has(a.priorities, "price") && !has(a.priorities, "accuracy")) {
    return {
      model: MODEL_BY_ID["llama-3.1-8b:free"],
      reason: "Narx siz uchun muhim — LLaMA to'liq tekin va kundalik ishlar uchun yetarli.",
    };
  }

  if (has(a.purposes, "research") || has(a.industries, "science")) {
    return {
      model: MODEL_BY_ID["sonar-online"],
      reason: "Tadqiqot uchun real-vaqt internet va manbalar bilan javob beruvchi model.",
    };
  }

  const euroLangs = ["de", "fr"];
  if (a.languages.some((l) => euroLangs.includes(l)) && !has(a.languages, "en")) {
    return {
      model: MODEL_BY_ID["mistral-large"],
      reason: "Evropa tillarida eng kuchli model — Mistral.",
    };
  }

  if (
    has(a.industries, "tech") ||
    has(a.industries, "engineering") ||
    (has(a.purposes, "work") && has(a.priorities, "speed"))
  ) {
    return {
      model: MODEL_BY_ID["gpt-4o"],
      reason: "Kod va texnik masalalar uchun tez va aniq — GPT-4o.",
    };
  }

  if (has(a.purposes, "creative") || has(a.industries, "creative") || has(a.industries, "marketing")) {
    return {
      model: MODEL_BY_ID["claude-sonnet-4-5"],
      reason: "Yozish, kontent va nozik tahrir uchun Claude eng yaxshi.",
    };
  }

  return {
    model: MODEL_BY_ID["claude-sonnet-4-5"],
    reason: "Umumiy ish va suhbat uchun eng muvozanatli tanlov — Claude.",
  };
}
