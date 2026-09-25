"use client";

import { Logo } from "@/components/brand/Logo";
import { AuthScene } from "@/components/three/scenes";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/store/chat";

export function VisualPanel() {
  const t = useT();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  return (
    <aside className="relative hidden overflow-hidden bg-bg-elevated lg:flex lg:flex-col">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 30% 20%, rgba(91,80,240,0.28) 0%, transparent 70%), radial-gradient(50% 50% at 80% 90%, rgba(32,212,232,0.14) 0%, transparent 70%), linear-gradient(180deg, #0D1033 0%, #060812 100%)",
        }}
      />
      <div className="noise absolute inset-0" />
      {isDesktop && (
        <div aria-hidden="true" className="absolute inset-0">
          <AuthScene className="absolute inset-0" />
        </div>
      )}

      <div className="relative z-10 flex flex-1 flex-col justify-between p-10">
        {/* CSS kirish animatsiyasi (.hero-in) — JS'siz ham ko'rinadi, reduced-motion'da o'chadi. */}
        <div className="hero-in">
          <Logo size={32} />
        </div>

        <blockquote className="hero-in max-w-md" style={{ animationDelay: "0.3s" }}>
          <p className="font-display text-3xl font-extrabold leading-tight text-text-primary">
            {t("auHeroA")}
            <span className="text-gradient-brand">{t("auHeroB")}</span>
            {t("auHeroC")}
          </p>
          <p className="mt-4 text-sm text-text-secondary">
            {t("auHeroDesc")}
          </p>
          <div className="mt-6 flex items-center gap-2 font-mono text-xs text-text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            AES-256-GCM · Zero-knowledge · GDPR
          </div>
        </blockquote>
      </div>
    </aside>
  );
}
