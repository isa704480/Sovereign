"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";

export function PasswordInput({ className, ...props }: ComponentProps<typeof Input>) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("auHidePassword") : t("auShowPassword")}
        aria-pressed={show}
        // Klaviatura bilan ham yetib boriladi (WCAG 2.1.1) — avval tabIndex={-1} edi.
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-text-muted transition-colors outline-none hover:text-text-primary focus-visible:text-text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
