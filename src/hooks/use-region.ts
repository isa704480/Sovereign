"use client";

import { useEffect, useState } from "react";

export interface ClientRegion {
  country: string | null;
  restricted: boolean;
  sanctioned: boolean;
  source: "ip" | "billing" | "profile" | "env" | null;
}

const UNKNOWN: ClientRegion = { country: null, restricted: false, sanctioned: false, source: null };

// Sahifa davomida bitta so'rov (ModelSwitcher, ChatHeader, PricingDialog birga ishlatadi).
let pending: Promise<ClientRegion> | null = null;

function loadRegion(): Promise<ClientRegion> {
  if (!pending) {
    pending = fetch("/api/region", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : UNKNOWN))
      .then((j: Partial<ClientRegion>) => ({
        country: typeof j.country === "string" ? j.country : null,
        restricted: j.restricted === true,
        sanctioned: j.sanctioned === true,
        source: j.source ?? null,
      }))
      .catch(() => {
        pending = null; // keyingi ochilishda qayta urinadi
        return UNKNOWN;
      });
  }
  return pending;
}

/**
 * Foydalanuvchi mintaqasi (server aniqlaydi — /api/region). Faqat UI ko'rinishi uchun:
 * yopiq modellar "mintaqada mavjud emas" deb ko'rsatiladi. Cheklovning o'zi serverda.
 */
export function useRegion(): ClientRegion {
  const [region, setRegion] = useState<ClientRegion>(UNKNOWN);
  useEffect(() => {
    let alive = true;
    void loadRegion().then((r) => {
      if (alive) setRegion(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return region;
}
