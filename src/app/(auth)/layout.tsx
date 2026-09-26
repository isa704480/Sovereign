import { Logo } from "@/components/brand/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { VisualPanel } from "@/components/auth/VisualPanel";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh flex-1 grid-cols-1 lg:grid-cols-2">
      <VisualPanel />
      <div className="relative flex flex-col bg-bg-base px-5 py-8 sm:px-8">
        {/* Logo faqat kichik ekranda (kattada chap panelda bor); til tanlagich — har doim. */}
        <div className="flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <Logo />
          </div>
          <LangSwitcher className="ml-auto" />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
