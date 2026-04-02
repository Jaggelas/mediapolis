import { NextResponse } from "next/server";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { redirectResponse } from "@/src/lib/redirect-response";
import { cancelMediaRequest } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/requests/[id]/cancel">) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:requests:cancel", "Rejected cancellation without session");
    return redirectResponse("/login");
  }

  const { id } = await ctx.params;
  debugLog("api:requests:cancel", "Cancelling request", {
    userId: session.sub,
    requestId: id,
  });

  try {
    await cancelMediaRequest(id, session.sub);
    debugLog("api:requests:cancel", "Request cancellation finished", {
      userId: session.sub,
      requestId: id,
    });
    return redirectResponse("/requests");
  } catch (error) {
    debugError("api:requests:cancel", "Request cancellation failed", error);
    return redirectResponse("/requests?error=cancel_failed");
  }
}
