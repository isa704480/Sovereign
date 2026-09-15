import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/Logo";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-x-10 -top-16 h-40 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(91,80,240,0.18),transparent_70%)]" />
      <div className="relative rounded-3xl border border-border bg-bg-elevated/60 p-7 shadow-lg backdrop-blur-sm sm:p-8">
        <div className="hidden lg:block">
          <LogoMark size={30} />
        </div>
        <h1 className="font-display mt-5 text-2xl font-extrabold text-text-primary lg:mt-6">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-text-secondary">{footer}</div>}
      </div>
    </div>
  );
}
