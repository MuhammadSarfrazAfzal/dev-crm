import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { subscribe } from "@/server/live";

export const dynamic = "force-dynamic";

/** Server-sent events naming tables that changed. Carries no row data; pages re-read under RLS. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          // Stream already closed.
        }
      };
      send("retry: 5000\nevent: ready\ndata: {}\n\n");
      unsubscribe = subscribe((table) => send(`event: change\ndata: ${JSON.stringify({ table })}\n\n`));
      ping = setInterval(() => send(": ping\n\n"), 25_000);
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      clearInterval(ping);
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive" },
  });
}
