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
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
