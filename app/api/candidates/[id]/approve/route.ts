import { NextResponse } from "next/server";
import { approveCandidate } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/candidates/[id]/approve">) {
  const session = await getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 302 });
  }

  const { id } = await ctx.params;
  await approveCandidate(id, session.sub);

  return NextResponse.redirect(new URL("/requests", request.url), { status: 302 });
}
