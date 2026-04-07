import { NextResponse } from "next/server";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { cancelDownloadFromFeed } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/downloads/[hash]/cancel">) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:downloads:cancel", "Rejected download cancel without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hash } = await ctx.params;
  debugLog("api:downloads:cancel", "Cancelling download from feed", {
    userId: session.sub,
    hash,
  });

  try {
    const result = await cancelDownloadFromFeed({
      torrentHash: hash,
      userId: session.sub,
      deleteFiles: true,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel download.";
    debugError("api:downloads:cancel", "Cancelling download from feed failed", {
      hash,
      message,
      error,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
