"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";

/** Yuklash xatosi: bo'sh ro'yxat sifatida emas, sabab + "Qayta urinish" bilan (role=alert). */
export function LoadError({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}>
      <AlertTriangle className="size-5" style={{ color: "var(--t-warning, #F59E0B)" }} aria-hidden />
      <p className="text-sm" style={{ color: "var(--t-text, #F0F2FF)" }}>{message ?? t("p7cLoadFailed")}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="tt inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-[var(--surface-hover)] [@media(pointer:coarse)]:min-h-11"
          style={{ borderColor: "var(--t-border, rgba(255,255,255,0.1))", color: "var(--t-text, #F0F2FF)" }}
        >
          <RotateCw className="size-3.5" aria-hidden />
          {t("uxRetry")}
        </button>
      )}
    </div>
  );
}

/** Ro'yxat skeleti — yuklanayotganda joy band qiladi (sakrash bo'lmasin). */
export function SkeletonRows({ rows = 3, className, rowClassName }: { rows?: number; className?: string; rowClassName?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn("h-12 animate-pulse rounded-lg motion-reduce:animate-none", rowClassName)}
          style={{ background: "color-mix(in srgb, var(--t-text, #fff) 6%, transparent)" }}
        />
      ))}
    </div>
  );
}
