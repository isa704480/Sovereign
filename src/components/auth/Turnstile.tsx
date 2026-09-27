"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { useT } from "@/store/chat";

/**
 * Cloudflare Turnstile (Supabase Auth CAPTCHA). Faqat NEXT_PUBLIC_TURNSTILE_SITE_KEY berilganda
 * ko'rinadi — aks holda hech narsa chizilmaydi va formalar avvalgidek ishlaydi. Token bir
 * martalik: har urinishdan keyin forma `reset()` chaqiradi. CSP'dagi challenges.cloudflare.com
 * ham shu kalit bo'lgandagina qo'shiladi (next.config.ts).
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Ishlatilgan tokenni tashlab, yangi tekshiruv boshlaydi. */
  reset(): void;
}

export function Turnstile({ onToken, ref }: { onToken: (token: string | undefined) => void; ref?: Ref<TurnstileHandle> }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        cb.current(undefined);
        if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(undefined),
          "error-callback": () => cb.current(undefined),
        });
      })
      .catch(() => {
        /* skript yuklanmadi — server CAPTCHA xatosini qaytaradi (auErrCaptcha) */
      });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} role="group" aria-label={t("auCaptchaLabel")} className="flex min-h-[65px] justify-center" />;
}
