"use client";

import dynamic from "next/dynamic";
import { useReducedMotionConfig } from "motion/react";

const StarFieldSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.StarFieldSceneInner), { ssr: false });
const CoreSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.CoreSceneInner), { ssr: false });
const AuthSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.AuthSceneInner), { ssr: false });
const BurstSceneInner = dynamic(() => import("./scenes-inner").then((m) => m.BurstSceneInner), { ssr: false });

/* Every scene is skipped entirely when motion is reduced (OS setting or the in-app
   toggle via MotionConfig); the CSS gradient behind it stays as the fallback. */

export function StarFieldScene({ className }: { className?: string }) {
  const reduced = useReducedMotionConfig();
  if (reduced) return null;
  return <StarFieldSceneInner className={className} />;
}

export function CoreScene({ className, active }: { className?: string; active: number }) {
  const reduced = useReducedMotionConfig();
  if (reduced) return null;
  return <CoreSceneInner className={className} active={active} />;
}

export function AuthScene({ className }: { className?: string }) {
  const reduced = useReducedMotionConfig();
  if (reduced) return null;
  return <AuthSceneInner className={className} />;
}

export function BurstScene({ className }: { className?: string }) {
  const reduced = useReducedMotionConfig();
  if (reduced) return null;
  return <BurstSceneInner className={className} />;
}
