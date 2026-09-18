import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Mark size in px. */
  size?: number;
  withText?: boolean;
  href?: string | null;
}

/**
 * SOVEREIGN mark — Apple-style restraint:
 * - Hexagon outer shell (mustaqillik, arxitektura, stability)
 * - Inner geometric core with subtle depth (liquid glass shadow)
 * - Single-color accent gradient (indigo → deeper indigo — not rainbow)
 * - Precise stroke widths, clean junctions, retina-crisp at any size
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        {/* Sokin indigo → chuqurroq indigo — bir rang oilasi */}
        <linearGradient id="sov-shell" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B7DFF" />
          <stop offset="100%" stopColor="#5B50F0" />
        </linearGradient>
        <linearGradient id="sov-core" x1="10" y1="9" x2="22" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6558E8" />
          <stop offset="100%" stopColor="#4238B8" />
        </linearGradient>
        {/* Nozik ichki nur — liquid glass depth */}
        <radialGradient id="sov-glow" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#B4AAFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#B4AAFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Tashqi hexagon — hairline stroke Apple uslubida */}
      <path
        d="M16 2.5 L27.6 9.25 L27.6 22.75 L16 29.5 L4.4 22.75 L4.4 9.25 Z"
        stroke="url(#sov-shell)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      {/* Ichki solid hexagon — brend accent */}
      <path
        d="M16 9 L21.9 12.5 L21.9 19.5 L16 23 L10.1 19.5 L10.1 12.5 Z"
        fill="url(#sov-core)"
      />

      {/* Liquid glass highlight */}
      <path
        d="M16 9 L21.9 12.5 L21.9 19.5 L16 23 L10.1 19.5 L10.1 12.5 Z"
        fill="url(#sov-glow)"
      />

      {/* Markaziy nur nuqtasi — brend belgisi */}
      <circle cx="16" cy="16" r="1.6" fill="#F5F3FF" />
    </svg>
  );
}

export function Logo({ className, size = 28, withText = true, href = "/" }: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {withText && (
        <span className="font-display text-[15px] font-semibold tracking-[0.16em] text-text-primary">
          SOVEREIGN
        </span>
      )}
    </span>
  );
  if (!href) return content;
  return (
    <Link href={href} aria-label="SOVEREIGN AI bosh sahifa" className="inline-flex">
      {content}
    </Link>
  );
}
