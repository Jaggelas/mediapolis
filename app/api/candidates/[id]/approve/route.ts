import { NextResponse } from "next/server";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { redirectResponse } from "@/src/lib/redirect-response";
import { approveCandidate } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/candidates/[id]/approve">) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:candidates:approve", "Rejected candidate approval without session");
    return redirectResponse("/login");
  }

  const { id } = await ctx.params;
  debugLog("api:candidates:approve", "Approving candidate", {
    userId: session.sub,
    candidateId: id,
  });

  try {
    await approveCandidate(id, session.sub);
    debugLog("api:candidates:approve", "Candidate approval finished", {
      userId: session.sub,
      candidateId: id,
    });
    return redirectResponse("/requests");
  } catch (error) {
    debugError("api:candidates:approve", "Candidate approval failed", error);
    return redirectResponse("/requests?error=approve_failed");
  }
}
