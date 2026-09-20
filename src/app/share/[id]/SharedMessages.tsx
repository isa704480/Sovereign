"use client";

import { MODEL_BY_ID } from "@/config/models";
import { Markdown } from "@/components/dashboard/Markdown";

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
              style={{ background: "#1C1F42", borderRadius: "18px 18px 4px 18px" }}
            >
              {m.content}
            </div>
          </div>
        ) : (
          <div key={i} className="flex gap-3">
            <span
              className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg text-sm"
              style={{ background: "rgba(91,80,240,0.2)", color: "#7C6FF7" }}
            >
              {(m.modelId && MODEL_BY_ID[m.modelId]?.glyph) || "⬡"}
            </span>
            <div className="min-w-0 flex-1">
              <Markdown content={m.content} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
