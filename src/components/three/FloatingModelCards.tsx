"use client";

import { Float, RoundedBox, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { MODEL_BY_THEME } from "@/config/models";

interface CardProps {
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  delay: number;
}

function Card({ color, position, rotation, delay }: CardProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() + delay;
    ref.current.rotation.y = rotation[1] + Math.sin(t * 0.5) * 0.18;
    ref.current.rotation.x = rotation[0] + Math.cos(t * 0.4) * 0.08;
  });

  return (
    <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.9} floatingRange={[-0.15, 0.15]}>
      <group ref={ref} position={position} rotation={rotation}>
        <RoundedBox args={[1.6, 1.05, 0.06]} radius={0.08} smoothness={6}>
          <meshStandardMaterial color="#0D1033" roughness={0.35} metalness={0.5} />
        </RoundedBox>
        {/* accent bar */}
        <mesh position={[-0.62, 0.32, 0.04]}>
          <boxGeometry args={[0.22, 0.22, 0.02]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
        </mesh>
        {/* text lines */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.05 - i * 0.05, 0.05 - i * 0.2, 0.04]}>
            <boxGeometry args={[1.1 - i * 0.25, 0.06, 0.01]} />
            <meshBasicMaterial color={i === 0 ? color : "#3A3F6A"} transparent opacity={i === 0 ? 0.9 : 0.7} />
          </mesh>
        ))}
        {/* edge glow */}
        <mesh position={[0, 0, -0.04]}>
          <planeGeometry args={[1.75, 1.2]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </Float>
  );
}

/** Auth visual panel: three model cards drifting in space with fine sparkles. */
export function FloatingModelCards() {
  const claude = MODEL_BY_THEME.claude;
  const gpt = MODEL_BY_THEME.chatgpt;
  const gemini = MODEL_BY_THEME.gemini;

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[3, 4, 5]} intensity={26} color="#7C6FF7" />
      <pointLight position={[-4, -2, 3]} intensity={14} color="#20D4E8" />
      <Sparkles count={90} scale={[7, 6, 3]} size={2.2} speed={0.3} opacity={0.5} color="#9BA3CC" />
      <Card color={claude.primary} position={[-1.35, 0.7, 0]} rotation={[0.1, 0.45, -0.05]} delay={0} />
      <Card color={gpt.primary} position={[1.25, -0.1, 0.4]} rotation={[-0.05, -0.4, 0.04]} delay={2} />
      <Card color={gemini.primary} position={[-0.3, -1.25, -0.5]} rotation={[0.2, 0.15, 0.06]} delay={4} />
    </>
  );
}
