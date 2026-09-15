import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Mark size in px. */
  size?: number;
  withText?: boolean;
  href?: string | null;
}

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
        <linearGradient id="sov-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="40%" stopColor="#5B50F0" />
          <stop offset="70%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#FF7000" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25L16 2.5Z"
        stroke="url(#sov-grad)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 9.5 21.6 12.75v6.5L16 22.5l-5.6-3.25v-6.5L16 9.5Z" fill="#5B50F0" />
      <circle cx="16" cy="16" r="2.2" fill="#F0F2FF" />
    </svg>
  );
}

export function Logo({ className, size = 28, withText = true, href = "/" }: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {withText && (
        <span className="font-display text-[15px] font-extrabold tracking-[0.18em] text-text-primary">
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
