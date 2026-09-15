"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface SceneCanvasProps extends Omit<CanvasProps, "children" | "frameloop"> {
  children: ReactNode;
  className?: string;
}

/**
 * Shared R3F canvas. Renders only while visible in the viewport and the tab
 * is focused, so off-screen scenes cost nothing.
 */
export function SceneCanvas({
  children,
  className,
  dpr = [1, 1.5],
  camera = { position: [0, 0, 6], fov: 45 },
  gl,
  ...rest
}: SceneCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "120px",
    });
    io.observe(el);
    const onVis = () => setFocused(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={ref} className={className} aria-hidden>
      <Canvas
        dpr={dpr}
        camera={camera}
        frameloop={visible && focused ? "always" : "never"}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          ...gl,
        }}
        {...rest}
      >
        {children}
      </Canvas>
    </div>
  );
}
