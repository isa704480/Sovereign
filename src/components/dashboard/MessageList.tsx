"use client";

import { useEffect, useRef } from "react";
import { useChat, type ChatMessage } from "@/store/chat";
import { useTTS } from "@/hooks/use-tts";
import { cn } from "@/lib/utils";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: ChatMessage[];
  onRegenerate?: () => void;
  /** Foydalanuvchi o'z xabarini tahrirlab qayta yuborganda. */
  onEdit?: (messageId: string, text: string) => void;
}

/** Sozlamalar → "Matn o'lchami" (xabar matni uchun CSS o'zgaruvchisi). */
const FONT_SIZE = { sm: "14px", md: "15px", lg: "17px" } as const;

export function MessageList({ messages, onRegenerate, onEdit }: MessageListProps) {
  const tts = useTTS();
  const autoScroll = useChat((s) => s.autoScroll);
  const fontSize = useChat((s) => s.fontSize);
  const density = useChat((s) => s.density);
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

  // Oqim davomida pastga ergashamiz — faqat foydalanuvchi tubida bo'lsa va
  // Sozlamalarda "Avto-scroll" yoqilgan bo'lsa.
  useEffect(() => {
    if (autoScroll && pinned.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastLen, autoScroll]);

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
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col px-4 md:px-6",
          density === "compact" ? "gap-4 py-5 md:py-6" : "gap-7 py-8 md:py-10",
        )}
        style={{ "--chat-fs": FONT_SIZE[fontSize] ?? FONT_SIZE.md } as React.CSSProperties}
      >
        {messages.map((m, i) => (
          <MessageItem
            key={m.id}
            message={m}
            isLast={i === messages.length - 1}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
            onTts={tts.supported ? tts.toggle : undefined}
            ttsSpeaking={tts.speakingId === m.id}
          />
        ))}
        <div ref={bottom} className="h-2" />
      </div>
    </div>
  );
}
