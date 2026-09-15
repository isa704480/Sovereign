import { Logo } from "@/components/brand/Logo";
import { VisualPanel } from "@/components/auth/VisualPanel";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh flex-1 grid-cols-1 lg:grid-cols-2">
      <VisualPanel />
      <div className="relative flex flex-col bg-bg-base px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
