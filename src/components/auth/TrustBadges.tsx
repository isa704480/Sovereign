"use client";

import { Ban, Globe, Lock } from "lucide-react";
import { useT } from "@/store/chat";

export function TrustBadges() {
  const t = useT();
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-text-muted">
      <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5 text-success" /> {t("auBadgeEncryption")}</span>
      <span className="inline-flex items-center gap-1.5"><Ban className="size-3.5 text-warning" /> {t("auBadgeNoAds")}</span>
      <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5 text-research" /> GDPR</span>
    </div>
  );
}
