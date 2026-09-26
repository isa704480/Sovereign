"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recommendModel } from "@/lib/recommend-model";
import { getServerT } from "@/lib/i18n-server";

const answersSchema = z.object({
  purposes: z.array(z.string()).min(1),
  industries: z.array(z.string()),
  otherIndustry: z.string().max(80).optional().default(""),
  priorities: z.array(z.string()).min(1),
  languages: z.array(z.string()),
  otherLanguage: z.string().max(80).optional().default(""),
  experience: z.number().min(0).max(100),
  ageGroup: z.string().max(10).optional().default(""),
  country: z.string().max(10).optional().default(""),
  otherCountry: z.string().max(60).optional().default(""),
});

export type OnboardingResult =
  | { ok: true; modelId: string; modelName: string; reason: string }
  | { ok: false; error: string };

export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const t = await getServerT();
  const parsed = answersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: t("auOnbErrIncomplete") };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    if (process.env.NODE_ENV === "development") {
      // Local design preview (/dev/onboarding) without Supabase: recommend, don't persist.
      const rec = recommendModel(parsed.data);
      return { ok: true, modelId: rec.model.id, modelName: rec.model.name, reason: rec.reason };
    }
    return { ok: false, error: t("auErrSupabaseMissing") };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auOnbErrNoSession") };

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

  if (error) {
    // Xom Postgres xatosi UI'ga chiqmaydi.
    console.error("[onboarding] save:", error.message);
    return { ok: false, error: t("p7cOnbSaveFailed") };
  }

  return { ok: true, modelId: rec.model.id, modelName: rec.model.name, reason: rec.reason };
}
