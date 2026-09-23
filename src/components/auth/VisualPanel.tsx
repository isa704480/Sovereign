"use client";

import { motion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { AuthScene } from "@/components/three/scenes";
import { EASE_OUT_EXPO } from "@/lib/motion";
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
      {isDesktop && <AuthScene className="absolute inset-0" />}

      <div className="relative z-10 flex flex-1 flex-col justify-between p-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
        >
          <Logo size={32} />
        </motion.div>

        <motion.blockquote
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.3 }}
          className="max-w-md"
        >
          <p className="font-display text-3xl font-extrabold leading-tight text-text-primary">
            {t("auHeroA")}
            <span className="text-gradient-brand">{t("auHeroB")}</span>
            {t("auHeroC")}
          </p>
          <p className="mt-4 text-sm text-text-secondary">
            {t("auHeroDesc")}
          </p>
          <div className="mt-6 flex items-center gap-2 font-mono text-[11px] text-text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            AES-256-GCM · Zero-knowledge · GDPR
          </div>
        </motion.blockquote>
      </div>
    </aside>
  );
}
