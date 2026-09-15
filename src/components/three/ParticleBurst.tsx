"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { seededRandom } from "@/lib/random";

interface ParticleBurstProps {
  count?: number;
  /** Seconds until fully faded. */
  life?: number;
}

/** One-shot burst of brand-colored particles expanding from the origin. */
export function ParticleBurst({ count = 420, life = 1.8 }: ParticleBurstProps) {
  const points = useRef<THREE.Points>(null);
  const start = useRef<number | null>(null);

  const { positions, velocities, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = ["#00D4FF", "#5B50F0", "#A855F7", "#FF7000", "#10D4A0"].map((c) => new THREE.Color(c));
    const rand = seededRandom(9001);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const speed = 1.6 + rand() * 2.4;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;
      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, velocities, colors };
  }, [count]);

  useFrame(({ clock }) => {
    const p = points.current;
    if (!p) return;
    if (start.current === null) start.current = clock.getElapsedTime();
    const t = clock.getElapsedTime() - start.current;
    const k = Math.min(t / life, 1);
    const eased = 1 - Math.pow(1 - k, 3);
    const attr = p.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] = velocities[i * 3] * eased;
      arr[i * 3 + 1] = velocities[i * 3 + 1] * eased - k * k * 0.6;
      arr[i * 3 + 2] = velocities[i * 3 + 2] * eased;
    }
    attr.needsUpdate = true;
    (p.material as THREE.PointsMaterial).opacity = 1 - k;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.07}
        vertexColors
        transparent
        opacity={1}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
