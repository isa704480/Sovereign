"use client";

import { MODEL_BY_ID, type SovereignModel } from "@/config/models";
import { cn } from "@/lib/utils";

interface ModelAvatarProps {
  modelId?: string;
  model?: SovereignModel;
  size?: number;
  className?: string;
  glow?: boolean;
}

export function ModelAvatar({ modelId, model, size = 28, className, glow }: ModelAvatarProps) {
  const m = model ?? (modelId ? MODEL_BY_ID[modelId] : undefined);
  const color = m?.primary ?? "var(--t-primary)";
  const glyph = m?.glyph ?? "⬡";
  return (
    <span
      className={cn("tt inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
        boxShadow: glow ? `0 0 ${size * 0.6}px color-mix(in srgb, ${color} 45%, transparent)` : undefined,
      }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}
