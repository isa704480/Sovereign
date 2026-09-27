"use client";

import { Markdown } from "@/components/dashboard/Markdown";
import { ModelAvatar } from "@/components/dashboard/ModelAvatar";

interface Msg {
  role: "user" | "assistant";
  content: string;
  modelId?: string | null;
}

/** Faqat o'qish uchun suhbat — dashboard'dagi Markdown bilan bir xil ko'rinish. */
export function SharedMessages({ messages }: { messages: Msg[] }) {
  return (
    <div className="flex flex-col gap-7">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div
              className="max-w-[78%] whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-relaxed"
              style={{ background: "var(--t-user-bubble)", borderRadius: "18px 18px 4px 18px" }}
            >
              {m.content}
            </div>
          </div>
        ) : (
          <div key={i} className="flex gap-3">
            <div className="mt-1">
              <ModelAvatar modelId={m.modelId ?? undefined} size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <Markdown content={m.content} ugc />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
