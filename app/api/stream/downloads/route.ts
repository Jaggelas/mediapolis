import { getDownloadFeed } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let interval: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const push = async () => {
        const payload = await getDownloadFeed();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      await push();
      interval = setInterval(push, 5000);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
