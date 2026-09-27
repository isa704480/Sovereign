"use client";

import {
  siAnthropic,
  siDeepseek,
  siGooglegemini,
  siKimi,
  siMeta,
  siMinimax,
  siMistralai,
  siNvidia,
  siOllama,
  siPerplexity,
  siQwen,
  siZdotai,
  type SimpleIcon,
} from "simple-icons";
import { LogoMark } from "@/components/brand/Logo";
import { AUTO_MODEL_ID, MODEL_BY_ID, type SovereignModel } from "@/config/models";
import { cn } from "@/lib/utils";

/**
 * Model belgisi: provayderning bir rangli belgisi (simple-icons, CC0, currentColor) yoki
 * harf-belgi. SOVEREIGN / Auto / o'z modelimiz — LogoMark. Model rangi faqat halqada.
 * Emoji yoki boshqa kompaniya logotipining qayta chizilgani ishlatilmaydi.
 */

type Mark = { icon: SimpleIcon } | { letter: string } | { logo: true };

const BY_PREFIX: [RegExp, Mark][] = [
  [/^(anthropic|claude)/i, { icon: siAnthropic }],
  [/^(openai|gpt|o\d|chatgpt)/i, { letter: "O" }],
  [/^(google|gemini|gemma)/i, { icon: siGooglegemini }],
  [/^(mistral)/i, { icon: siMistralai }],
  [/^(meta|llama)/i, { icon: siMeta }],
  [/^(deepseek)/i, { icon: siDeepseek }],
  [/^(qwen|alibaba)/i, { icon: siQwen }],
  [/^(x-ai|xai|grok)/i, { letter: "x" }],
  [/^(z-ai|zai|glm|zhipu)/i, { icon: siZdotai }],
  [/^(nvidia|nemotron)/i, { icon: siNvidia }],
  [/^(perplexity|sonar)/i, { icon: siPerplexity }],
  [/^(moonshot|kimi)/i, { icon: siKimi }],
  [/^(minimax)/i, { icon: siMinimax }],
  [/^(ollama)/i, { icon: siOllama }],
  [/^(sovereign|tella|auto)/i, { logo: true }],
];

function markFor(m: SovereignModel | undefined, modelId?: string): Mark {
  if (!m && !modelId) return { logo: true };
  if (m?.id === AUTO_MODEL_ID || m?.provider === "SOVEREIGN") return { logo: true };
  const keys = [m?.providerModel, m?.provider, m?.id, modelId].filter(Boolean) as string[];
  for (const k of keys) {
    for (const [re, mark] of BY_PREFIX) if (re.test(k.trim())) return mark;
  }
  const letter = (m?.provider ?? modelId ?? "?").replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "?";
  return { letter };
}

/** Faqat belgi (chip/ro'yxat qatori ichida). O'lcham: `px` yoki className (standart 16px). */
export function ProviderMark({
  model,
  modelId,
  className,
  px = 16,
}: {
  model?: SovereignModel;
  modelId?: string;
  className?: string;
  px?: number;
}) {
  const m = model ?? (modelId ? MODEL_BY_ID[modelId] : undefined);
  const mark = markFor(m, modelId);
  const box = { width: px, height: px };
  if ("logo" in mark) return <LogoMark size={px} className={className} />;
  if ("icon" in mark) {
    return (
      <svg viewBox="0 0 24 24" style={box} className={cn("shrink-0", className)} fill="currentColor" aria-hidden focusable="false">
        <path d={mark.icon.path} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.max(11, Math.round(px * 0.72)) }}
      className={cn("inline-flex shrink-0 items-center justify-center font-bold leading-none", className)}
    >
      {mark.letter}
    </span>
  );
}

interface ModelAvatarProps {
  modelId?: string;
  model?: SovereignModel;
  size?: number;
  className?: string;
  /** Javob yozilayotganda halqa biroz yorqinroq. */
  glow?: boolean;
}

export function ModelAvatar({ modelId, model, size = 28, className, glow }: ModelAvatarProps) {
  const m = model ?? (modelId ? MODEL_BY_ID[modelId] : undefined);
  const ring = m?.primary ?? "var(--t-primary)";
  return (
    <span
      className={cn("tt inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: "var(--t-surface)",
        color: "var(--t-text)",
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ring} ${glow ? 85 : 50}%, transparent)`,
      }}
      aria-hidden
    >
      <ProviderMark model={m} modelId={modelId} px={Math.round(size * 0.55)} />
    </span>
  );
}
