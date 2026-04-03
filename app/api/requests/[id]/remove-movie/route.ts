import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { redirectResponse } from "@/src/lib/redirect-response";
import { removeDownloadedMovieFromDisk } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/requests/[id]/remove-movie">) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:requests:remove-movie", "Rejected remove movie without session");
    return redirectResponse("/login");
  }

  const { id } = await ctx.params;
  debugLog("api:requests:remove-movie", "Removing downloaded movie from disk", {
    userId: session.sub,
    requestId: id,
  });

  try {
    await removeDownloadedMovieFromDisk(id, session.sub);
    debugLog("api:requests:remove-movie", "Downloaded movie removed from disk", {
      userId: session.sub,
      requestId: id,
    });
    return redirectResponse("/history");
  } catch (error) {
    debugError("api:requests:remove-movie", "Failed to remove downloaded movie from disk", error);
    return redirectResponse("/history?error=remove_movie_failed");
  }
}
