"use client";

import { SceneCanvas } from "./SceneCanvas";
import { StarField } from "./StarField";
import { SovereignCore } from "./SovereignCore";
import { FloatingModelCards } from "./FloatingModelCards";
import { ParticleBurst } from "./ParticleBurst";

/* These are loaded with next/dynamic (ssr: false) from ./scenes.tsx so that
   three.js never runs on the server. */

export function StarFieldSceneInner({ className }: { className?: string }) {
  return (
    <SceneCanvas className={className} camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 1.5]}>
      <StarField />
    </SceneCanvas>
  );
}

export function CoreSceneInner({ className, active }: { className?: string; active: number }) {
  return (
    <SceneCanvas className={className} camera={{ position: [0, 0, 6.2], fov: 42 }} dpr={[1, 2]}>
      <SovereignCore active={active} />
    </SceneCanvas>
  );
}

export function AuthSceneInner({ className }: { className?: string }) {
  return (
    <SceneCanvas className={className} camera={{ position: [0, 0, 5.5], fov: 45 }} dpr={[1, 1.5]}>
      <FloatingModelCards />
    </SceneCanvas>
  );
}

export function BurstSceneInner({ className }: { className?: string }) {
  return (
    <SceneCanvas className={className} camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 1.5]}>
      <ParticleBurst />
    </SceneCanvas>
  );
}
