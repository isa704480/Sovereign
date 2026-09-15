"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_MISSING_MESSAGE } from "@/lib/supabase/env";
import { recommendModel } from "@/lib/recommend-model";

const answersSchema = z.object({
  purposes: z.array(z.string()).min(1),
  industries: z.array(z.string()),
  otherIndustry: z.string().max(80).optional().default(""),
  priorities: z.array(z.string()).min(1),
  languages: z.array(z.string()),
  otherLanguage: z.string().max(80).optional().default(""),
  experience: z.number().min(0).max(100),
});

export type OnboardingResult =
  | { ok: true; modelId: string; modelName: string; reason: string }
  | { ok: false; error: string };

export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const parsed = answersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Javoblar to'liq emas." };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    if (process.env.NODE_ENV === "development") {
      // Local design preview (/dev/onboarding) without Supabase: recommend, don't persist.
      const rec = recommendModel(parsed.data);
      return { ok: true, modelId: rec.model.id, modelName: rec.model.name, reason: rec.reason };
    }
    return { ok: false, error: SUPABASE_MISSING_MESSAGE };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessiya topilmadi. Qayta kiring." };

  const answers = parsed.data;
  const rec = recommendModel(answers);

  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding: { ...answers, completedAt: new Date().toISOString(), version: 1 },
      onboarding_completed: true,
      default_model: rec.model.id,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: `Saqlashda xato: ${error.message}` };

  return { ok: true, modelId: rec.model.id, modelName: rec.model.name, reason: rec.reason };
}
