"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";

const StarFieldSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.StarFieldSceneInner), { ssr: false });
const CoreSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.CoreSceneInner), { ssr: false });
const AuthSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.AuthSceneInner), { ssr: false });
const BurstSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.BurstSceneInner), { ssr: false });

/* Every scene is skipped entirely under prefers-reduced-motion; the CSS
   gradient behind it stays as the fallback. */

export function StarFieldScene({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <StarFieldSceneInner className={className} />;
}

export function CoreScene({ className, active }: { className?: string; active: number }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <CoreSceneInner className={className} active={active} />;
}

export function AuthScene({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <AuthSceneInner className={className} />;
}

export function BurstScene({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <BurstSceneInner className={className} />;
}
