"use client";

import { Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SHOWCASE_MODELS } from "@/config/models";

interface OrbitProps {
  color: string;
  radius: number;
  speed: number;
  tilt: number;
  phase: number;
  size?: number;
}

function Orbit({ color, radius, speed, tilt, phase, size = 0.11 }: OrbitProps) {
  const ref = useRef<THREE.Mesh>(null);
  const ring = useMemo(() => new THREE.Euler(tilt, phase * 0.5, 0), [tilt, phase]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed + phase;
    if (!ref.current) return;
    ref.current.position.set(Math.cos(t) * radius, 0, Math.sin(t) * radius);
  });

  return (
    <group rotation={ring}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.004, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} />
      </mesh>
      <mesh ref={ref}>
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Hero object: a slowly breathing indigo core inside a wireframe icosahedron,
 * with six model-colored satellites on tilted orbits — "all AIs, one center".
 */
export function SovereignCore({ active = 0 }: { active?: number }) {
  const shell = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const activeColor = useMemo(() => new THREE.Color(SHOWCASE_MODELS[active % SHOWCASE_MODELS.length]?.primary ?? "#5B50F0"), [active]);
  const currentColor = useRef(new THREE.Color("#5B50F0"));

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    if (shell.current) {
      shell.current.rotation.y += delta * 0.12;
      shell.current.rotation.x = Math.sin(t * 0.2) * 0.25;
    }
    const pulse = 1 + Math.sin(t * 1.6) * 0.04;
    if (core.current) {
      core.current.scale.setScalar(pulse);
      currentColor.current.lerp(activeColor, 0.04);
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(currentColor.current);
      mat.color.copy(currentColor.current);
    }
    if (glow.current) {
      glow.current.scale.setScalar(pulse * 1.55);
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(currentColor.current);
    }
  });

  const orbits = useMemo(
    () =>
      SHOWCASE_MODELS.map((m, i) => ({
        color: m.primary,
        radius: 1.7 + (i % 3) * 0.38,
        speed: 0.35 + i * 0.07,
        tilt: (i / SHOWCASE_MODELS.length) * Math.PI,
        phase: i * 1.1,
      })),
    [],
  );

  return (
    <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.6}>
      <ambientLight intensity={0.35} />
      <pointLight position={[4, 4, 6]} intensity={30} color="#7C6FF7" />
      <pointLight position={[-5, -3, -4]} intensity={18} color="#20D4E8" />

      {/* outer glow */}
      <mesh ref={glow}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color="#5B50F0" transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* core */}
      <mesh ref={core}>
        <sphereGeometry args={[0.55, 48, 48]} />
        <meshStandardMaterial color="#5B50F0" emissive="#5B50F0" emissiveIntensity={1.2} roughness={0.25} metalness={0.4} />
      </mesh>

      {/* wireframe shell */}
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshBasicMaterial color="#9BA3CC" wireframe transparent opacity={0.22} />
      </mesh>

      {orbits.map((o, i) => (
        <Orbit key={i} {...o} />
      ))}
    </Float>
  );
}
