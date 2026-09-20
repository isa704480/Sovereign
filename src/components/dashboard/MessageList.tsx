"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/store/chat";
import { useTTS } from "@/hooks/use-tts";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: ChatMessage[];
  onRegenerate?: () => void;
  /** Foydalanuvchi o'z xabarini tahrirlab qayta yuborganda. */
  onEdit?: (messageId: string, text: string) => void;
}

export function MessageList({ messages, onRegenerate, onEdit }: MessageListProps) {
  const tts = useTTS();
  const bottom = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  // "Pastga biriktirilgan" — faqat shu holatda oqim davomida avto-scroll qilamiz.
  // Foydalanuvchi yuqoriga scroll qilsa false bo'ladi va u erkin o'qiy oladi;
  // yana tubiga qaytsa avto-scroll tiklanadi.
  const pinned = useRef(true);
  const last = messages[messages.length - 1];
  const lastLen = last?.content.length ?? 0;

  // Foydalanuvchining haqiqiy scroll harakatini kuzatamiz (token vaqtida qayta
  // hisoblamaymiz — shu sabab avval yuqoriga chiqolmasdi).
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Oqim davomida pastga ergashamiz — faqat foydalanuvchi tubida bo'lsa.
  useEffect(() => {
    if (pinned.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastLen]);

  // Foydalanuvchi yangi xabar yuborsa — qayerda bo'lishidan qat'i nazar pastga
  // tushamiz: o'z savolini va kelayotgan javobni ko'rsin.
  const lastId = last?.id;
  const lastRole = last?.role;
  useEffect(() => {
    if (lastRole === "user") {
      pinned.current = true;
      bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [lastId, lastRole]);

  return (
    <div ref={container} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 md:px-6 md:py-10">
        {messages.map((m, i) => (
          <MessageItem
            key={m.id}
            message={m}
            isLast={i === messages.length - 1}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
            tts={tts.supported ? { speaking: tts.speakingId === m.id, onToggle: () => tts.toggle(m.id, m.content) } : undefined}
          />
        ))}
        <div ref={bottom} className="h-2" />
      </div>
    </div>
  );
}
