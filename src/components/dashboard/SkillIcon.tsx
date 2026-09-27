import { Braces, ChartColumn, Focus, Layers, LayoutTemplate, PenLine, ShieldCheck, WandSparkles, type LucideIcon } from "lucide-react";
import type { SkillIconName } from "@/config/skills";

const ICONS: Record<SkillIconName | "custom", LucideIcon> = {
  "layout-template": LayoutTemplate,
  layers: Layers,
  braces: Braces,
  "shield-check": ShieldCheck,
  "pen-line": PenLine,
  "chart-column": ChartColumn,
  focus: Focus,
  custom: WandSparkles,
};

/** Skill belgisi — emoji emas, lucide chiziqli ikon (katalogdagi `icon` nomi bo'yicha). */
export function SkillIcon({ name, className }: { name: SkillIconName | "custom"; className?: string }) {
  const Icon = ICONS[name] ?? WandSparkles;
  return <Icon className={className} aria-hidden="true" strokeWidth={2} />;
}
