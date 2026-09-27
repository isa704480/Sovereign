import {
  ChartColumn,
  Clapperboard,
  Code2,
  FileText,
  ImageIcon,
  Microscope,
  Music,
  Paperclip,
  PenLine,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { AgentModeIconName } from "@/config/agent-modes";
import type { AttachmentKind } from "@/lib/chat/attachments";

/** Emoji o'rniga chiziqli ikonlar (lucide, currentColor) — agent rejimlari va biriktirmalar. */

const MODE_ICONS: Record<AgentModeIconName, LucideIcon> = {
  sparkles: Sparkles,
  code: Code2,
  microscope: Microscope,
  chart: ChartColumn,
  pen: PenLine,
};

export function AgentModeIcon({ name, className }: { name: AgentModeIconName; className?: string }) {
  const Icon = MODE_ICONS[name] ?? Sparkles;
  return <Icon className={className ?? "size-3.5"} aria-hidden />;
}

const ATTACHMENT_ICONS: Record<AttachmentKind, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  text: FileText,
  audio: Music,
  video: Clapperboard,
  other: Paperclip,
};

export function AttachmentIcon({ kind, className }: { kind: AttachmentKind; className?: string }) {
  const Icon = ATTACHMENT_ICONS[kind] ?? Paperclip;
  return <Icon className={className ?? "size-4"} aria-hidden />;
}
