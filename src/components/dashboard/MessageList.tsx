"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/store/chat";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: ChatMessage[];
  onRegenerate?: () => void;
}

export function MessageList({ messages, onRegenerate }: MessageListProps) {
  const bottom = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  const lastLen = last?.content.length ?? 0;

  // Auto-scroll while streaming unless the user scrolled up.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastLen]);

  return (
    <div ref={container} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        {messages.map((m, i) => (
          <MessageItem key={m.id} message={m} isLast={i === messages.length - 1} onRegenerate={onRegenerate} />
        ))}
        <div ref={bottom} className="h-2" />
      </div>
    </div>
  );
}
