import {
  siFigma,
  siGithub,
  siGmail,
  siGooglecalendar,
  siGoogledocs,
  siGoogledrive,
  siGooglesheets,
  siGoogleslides,
  siModelcontextprotocol,
  type SimpleIcon,
} from "simple-icons";
import {
  ChartColumn,
  Clapperboard,
  Code2,
  FileText,
  Globe,
  ImageIcon,
  Microscope,
  Music,
  Paperclip,
  PenLine,
  Puzzle,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { AgentModeIconName } from "@/config/agent-modes";
import type { AttachmentKind } from "@/lib/chat/attachments";
import type { ConnectorIconName } from "@/config/connectors";
import { cn } from "@/lib/utils";

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

/** Connector belgilari: servis belgisi bir rangli (currentColor), umumiylari — lucide. */
const CONNECTOR_BRAND: Partial<Record<ConnectorIconName, SimpleIcon>> = {
  gmail: siGmail,
  googledrive: siGoogledrive,
  googlesheets: siGooglesheets,
  googleslides: siGoogleslides,
  googledocs: siGoogledocs,
  googlecalendar: siGooglecalendar,
  figma: siFigma,
  github: siGithub,
  mcp: siModelcontextprotocol,
};

const CONNECTOR_LUCIDE: Partial<Record<ConnectorIconName, LucideIcon>> = {
  terminal: Terminal,
  globe: Globe,
  puzzle: Puzzle,
};

export function ConnectorIcon({ name, className }: { name: ConnectorIconName; className?: string }) {
  const brand = CONNECTOR_BRAND[name];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-4 shrink-0", className)} aria-hidden focusable="false">
        <path d={brand.path} />
      </svg>
    );
  }
  const Icon = CONNECTOR_LUCIDE[name] ?? Puzzle;
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden />;
}
