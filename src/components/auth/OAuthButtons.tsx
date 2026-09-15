"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { signInWithOAuth } from "@/app/actions/auth";
import type { OAuthProvider } from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#4285F4" d="M21.2 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.4c-.2 1.1-.9 2.1-1.9 2.8v2.4h3.1c1.8-1.7 2.6-4.1 2.6-7.5z" />
      <path fill="#34A853" d="M12 21.6c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.4-4.1H3.4v2.5c1.6 3.2 4.9 5.4 8.6 5.4z" />
      <path fill="#FBBC05" d="M6.6 13.7c-.2-.6-.3-1.1-.3-1.7s.1-1.2.3-1.7V7.8H3.4C2.7 9.1 2.4 10.5 2.4 12s.3 2.9 1 4.2l3.2-2.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

const PROVIDERS: { id: OAuthProvider; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "google", label: "Google bilan davom etish", Icon: GoogleIcon },
  { id: "github", label: "GitHub bilan davom etish", Icon: GitHubIcon },
];

interface OAuthButtonsProps {
  next?: string | null;
  onError?: (message: string) => void;
}

export function OAuthButtons({ next, onError }: OAuthButtonsProps) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<OAuthProvider | null>(null);

  function start(provider: OAuthProvider) {
    setActive(provider);
    startTransition(async () => {
      const res = await signInWithOAuth(provider, next);
      if (res && !res.ok) {
        onError?.(res.error);
        setActive(null);
      }
    });
  }

  return (
    <div className="grid gap-2.5">
      {PROVIDERS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={pending}
          onClick={() => start(id)}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-border bg-bg-base/60 text-sm font-medium text-text-primary transition-all",
            "hover:border-[var(--border-strong)] hover:bg-bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {pending && active === id ? <Loader2 className="size-4 animate-spin text-text-muted" /> : <Icon />}
          {label}
        </button>
      ))}
    </div>
  );
}
