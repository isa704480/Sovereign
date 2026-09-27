"use client";

import { Ban, Lock } from "lucide-react";
import { useT } from "@/store/chat";

export function TrustBadges() {
  const t = useT();
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-text-muted">
      {/* Faqat haqiqatan bajariladigan va'dalar (GDPR sertifikati yo'q — ko'rsatilmaydi). */}
      <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden="true" /> {t("auBadgeEncryption")}</span>
      <span className="inline-flex items-center gap-1.5"><Ban className="size-3.5" aria-hidden="true" /> {t("auBadgeNoAds")}</span>
    </div>
  );
}
