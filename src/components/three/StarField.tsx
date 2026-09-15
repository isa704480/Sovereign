"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { seededRandom } from "@/lib/random";

interface StarFieldProps {
  count?: number;
  radius?: number;
  /** Rotation speed in radians per second. */
  speed?: number;
  /** Mouse parallax strength. */
  parallax?: number;
}

function makeSphere(count: number, radius: number, minRadius = 0, seed = 1) {
  const rand = seededRandom(seed);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = minRadius + Math.cbrt(rand()) * (radius - minRadius);
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = r * Math.cos(phi);
  }
  return arr;
}

/**
 * Slowly rotating star field: a dense white layer plus a sparse tinted layer
 * (indigo / teal / violet) that sells the "deep space" brand background.
 */
export function StarField({ count = 3000, radius = 14, speed = 0.015, parallax = 0.35 }: StarFieldProps) {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });

  const white = useMemo(() => makeSphere(count, radius, 2, 1337), [count, radius]);
  const tinted = useMemo(() => makeSphere(Math.floor(count / 8), radius * 0.9, 3, 4242), [count, radius]);
  const tintColors = useMemo(() => {
    const palette = [new THREE.Color("#5B50F0"), new THREE.Color("#20D4E8"), new THREE.Color("#A855F7"), new THREE.Color("#7C6FF7")];
    const n = Math.floor(count / 8);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = palette[i % palette.length];
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    target.current.x = state.pointer.x * parallax;
    target.current.y = state.pointer.y * parallax;
    g.rotation.y += delta * speed;
    g.rotation.x += delta * speed * 0.35;
    g.position.x += (target.current.x - g.position.x) * 0.04;
    g.position.y += (target.current.y - g.position.y) * 0.04;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[white, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#dfe3ff"
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[tinted, 3]} />
          <bufferAttribute attach="attributes-color" args={[tintColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.09}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
