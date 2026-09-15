import { z } from "zod";
import { streamCompletion } from "@/lib/ai/providers";
import { MODEL_BY_ID } from "@/config/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  modelId: z.string().min(1),
  research: z.boolean().optional().default(false),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(60),
});

/**
 * POST /api/chat — Server-Sent Events stream.
 * Events: {text} | {citations} | {error} | [DONE]
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const { modelId, research, messages } = parsed.data;
  if (!MODEL_BY_ID[modelId]) {
    return Response.json({ error: "Noma'lum model" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        for await (const ev of streamCompletion({ modelId, research, messages, signal: req.signal })) {
          if (ev.type === "done") break;
          send(ev);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          send({ type: "error", message: err instanceof Error ? err.message : "Noma'lum xato" });
        }
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
