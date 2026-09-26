import React, { useId } from "react";

// Chiziqli ikonlar (24x24, stroke). Dekorativ — aria-hidden; ma'noni tugma yorlig'i beradi.
const P = {
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" />,
  folderOpen: <><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v1" /><path d="M2.5 20l2.8-8.2A2 2 0 0 1 7.2 10.4H21a1 1 0 0 1 .95 1.3L19.4 19a2 2 0 0 1-1.9 1.4H4" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M7 10l5 5 5-5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  alert: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.3v.2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></>,
  repeat: <><path d="M17 2.5l3.5 3.5L17 9.5" /><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" /><path d="M7 21.5L3.5 18 7 14.5" /><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  send: <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>,
  terminal: <><path d="M6 8l4 4-4 4" /><path d="M13 16h5" /></>,
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  play: <path d="M7 5l11 7-11 7z" />,
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M15 4v16" /></>,
  undo: <><path d="M3 8h11a5 5 0 0 1 0 10H8" /><path d="M6.5 4.5L3 8l3.5 3.5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.8-4.2L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 4.2L21 15" /><path d="M21 20v-5h-5" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.3 8.3-8 9-4.7-.7-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  diff: <><path d="M6 3v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />,
  chat: <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12z" />,
  code: <><path d="M8 7l-5 5 5 5" /><path d="M16 7l5 5-5 5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  download: <><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  wifiOff: <><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 5.2-2.8M14.8 10.1A10 10 0 0 1 19 12.9" /><path d="M12 20h.01" /></>,
};

export default function Icon({ name, size = 16, stroke = 1.6, className, style, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "none", ...style }}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {P[name] ?? P.info}
    </svg>
  );
}

/** SOVEREIGN logotipi (public/logo.svg bilan bir xil geometriya). */
export function Logo({ size = 22, className }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" style={{ flex: "none" }}>
      <defs>
        <linearGradient id={`${id}s`} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B7DFF" />
          <stop offset="100%" stopColor="#5B50F0" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="10" y1="9" x2="22" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6558E8" />
          <stop offset="100%" stopColor="#4238B8" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 L27.6 9.25 L27.6 22.75 L16 29.5 L4.4 22.75 L4.4 9.25 Z" stroke={`url(#${id}s)`} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9 L21.9 12.5 L21.9 19.5 L16 23 L10.1 19.5 L10.1 12.5 Z" fill={`url(#${id}c)`} />
      <circle cx="16" cy="16" r="1.6" fill="#F5F3FF" />
    </svg>
  );
}
