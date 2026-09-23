"use client";

import { AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { isAuthKey } from "@/lib/locales/auth";
import { useT } from "@/store/chat";

/** Lug'at kaliti bo'lsa tanlangan tilga o'giradi, aks holda matnni o'zicha qaytaradi. */
export function useAuthMsg(): (message: string) => string {
  const t = useT();
  return (message) => (isAuthKey(message) ? t(message) : message);
}

export const inputClass =
  "h-11 rounded-xl border-border bg-bg-base/60 px-3.5 text-[15px] text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:ring-primary/30 aria-invalid:border-error aria-invalid:ring-error/20 md:text-[15px]";

export function FieldError({ message }: { message?: string }) {
  const msg = useAuthMsg();
  if (!message) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="text-xs text-error"
      role="alert"
    >
      {msg(message)}
    </motion.p>
  );
}

export function FormAlert({ message, tone = "error" }: { message: string; tone?: "error" | "success" }) {
  const msg = useAuthMsg();
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="overflow-hidden"
    >
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
          tone === "error"
            ? "border-error/30 bg-error/10 text-error"
            : "border-success/30 bg-success/10 text-success",
        )}
        role="alert"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{msg(message)}</span>
      </div>
    </motion.div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <motion.button
      type="submit"
      disabled={pending}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-white shadow-glow transition-colors",
        "hover:bg-primary-dark focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-70",
      )}
    >
      {children}
    </motion.button>
  );
}
