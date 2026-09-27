"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  siClaude,
  siDeepseek,
  siGooglegemini,
  siMeta,
  siMistralai,
  siNvidia,
  siQwen,
  siZdotai,
  type SimpleIcon,
} from "simple-icons";
import { FadeIn } from "@/components/motion/FadeIn";
import { MODEL_BY_ID, TOTAL_MODELS_CLAIM, type SovereignModel } from "@/config/models";
import { fmt, pick } from "@/lib/i18n";
import { modelProvider } from "@/lib/locales/chat-data";
import { TIER_TEXT } from "@/lib/locales/plans";
import { useLang, useT } from "@/store/chat";
import { SectionHeading } from "./SectionHeading";

/**
 * Har laboratoriyaning hozirgi flagmani — config/models.ts katalogidan (nom, laboratoriya, tarif).
 * O'ylab topilgan ko'rsatkich/ball YO'Q: o'lchangan taqqoslash /compare sahifasida.
 * Belgilar bir rangli (simple-icons, CC0); belgisi yo'q laboratoriya uchun harf.
 */
const FLAGSHIPS: { id: string; icon?: SimpleIcon }[] = [
  { id: "claude-opus-5", icon: siClaude },
  { id: "gpt-6-astra" },
  { id: "gemini-3-8-flash", icon: siGooglegemini },
  { id: "grok-4-6" },
  { id: "deepseek-v4-pro", icon: siDeepseek },
  { id: "qwen3-8-max", icon: siQwen },
  { id: "mistral-medium-3-5", icon: siMistralai },
  { id: "glm-5-3", icon: siZdotai },
  { id: "llama-4-scout", icon: siMeta },
  { id: "nemotron-ultra-free", icon: siNvidia },
];

const ROWS = FLAGSHIPS.flatMap(({ id, icon }) => {
  const model = MODEL_BY_ID[id];
  return model ? [{ model, icon }] : [];
});

function Mark({ model, icon }: { model: SovereignModel; icon?: SimpleIcon }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-white/[0.03] text-text-secondary"
    >
      {icon ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" focusable="false">
          <path d={icon.path} />
        </svg>
      ) : (
        <span className="font-mono text-sm font-medium">{model.provider.charAt(0)}</span>
      )}
    </span>
  );
}

export function ModelShowcase() {
  const t = useT();
  const lang = useLang();
  return (
    <section
      id="models"
      aria-labelledby="models-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading
        id="models-title"
        eyebrow={t("navModels")}
        title={t("ldShowcaseTitle")}
        sub={fmt(t("ldShowcaseSub"), { n: TOTAL_MODELS_CLAIM })}
      />

      <FadeIn inView className="mx-auto mt-12 max-w-4xl">
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {ROWS.map(({ model, icon }) => (
            <li key={model.id} className="flex min-w-0 items-center gap-3.5 bg-bg-base px-5 py-4">
              <Mark model={model} icon={icon} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-text-primary">{model.name}</p>
                <p className="truncate text-sm text-text-muted">{modelProvider(lang, model)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                <span className="sr-only">{t("p20wModelsPlanSr")} </span>
                {pick(lang, TIER_TEXT[model.tier])}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
          <p className="text-text-muted">{t("p20wModelsPlanNote")}</p>
          <Link
            href="/compare"
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent-text underline-offset-4 hover:underline sm:min-h-0"
          >
            {t("p20wModelsCompare")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </FadeIn>
    </section>
  );
}
