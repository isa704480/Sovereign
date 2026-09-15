"use client";

import type { StreamEvent } from "@/lib/ai/providers";

export interface StreamChatOptions {
  modelId: string;
  research: boolean;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  signal?: AbortSignal;
  onEvent: (ev: StreamEvent) => void;
}

/** Calls POST /api/chat and forwards SSE events to `onEvent`. */
export async function streamChat({ modelId, research, messages, signal, onEvent }: StreamChatOptions) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId, research, messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Server xatosi (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        onEvent({ type: "done" });
        return;
      }
      try {
        onEvent(JSON.parse(data) as StreamEvent);
      } catch {
        /* ignore malformed */
      }
    }
  }
  onEvent({ type: "done" });
}
