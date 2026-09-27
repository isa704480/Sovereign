"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  on: boolean;
  onChange: (v: boolean) => void;
  /** Ko'rinadigan yorliq bo'lmasa — aria-label. */
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Dashboard'dagi yagona almashtirgich (Sidebar, Sozlamalar, Xotira, Cowork).
 * Sensorli ekranda bosiladigan maydon 44px gacha kattalashadi (vizual trek o'zgarmaydi).
 */
export function Switch({ on, onChange, label, disabled, size = "md", className }: SwitchProps) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "tt group relative inline-flex shrink-0 items-center justify-center p-0 disabled:cursor-not-allowed disabled:opacity-50",
        "[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("relative block rounded-full transition-colors duration-200", sm ? "h-5 w-9" : "h-6 w-11")}
        style={{ background: on ? "var(--t-primary-fill, #5B50F0)" : "color-mix(in srgb, var(--t-text, #fff) 18%, transparent)" }}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 block rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none",
            sm ? "size-4" : "size-5",
          )}
          style={{ transform: on ? `translateX(${sm ? 16 : 20}px)` : "translateX(0)" }}
        />
      </span>
    </button>
  );
}
