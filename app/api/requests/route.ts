import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { createMediaRequest } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

const createRequestSchema = z.object({
  title: z.string().min(1),
  mediaType: z.nativeEnum(MediaType),
  year: z.number().int().min(1900).max(2100).optional(),
  notes: z.string().optional(),
});

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (!session) {
    debugWarn("api:requests", "Rejected GET /api/requests without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  debugLog("api:requests", "Loading active requests", {
    userId: session.sub,
  });

  const requests = await prisma.mediaRequest.findMany({
    where: {
      status: {
        notIn: [RequestStatus.COMPLETED, RequestStatus.CANCELLED],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      candidates: {
        orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
        take: 3,
      },
    },
  });

  return NextResponse.json(requests);
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:requests", "Rejected POST /api/requests without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  debugLog("api:requests", "Received create request payload", {
    userId: session.sub,
    title: typeof body?.title === "string" ? body.title : null,
    mediaType: body?.mediaType,
    year: body?.year,
  });

  const payload = createRequestSchema.safeParse(body);

  if (!payload.success) {
    debugWarn("api:requests", "Create request payload validation failed", {
      userId: session.sub,
      issues: payload.error.flatten(),
    });
    return NextResponse.json(
      { error: "Invalid request payload.", issues: payload.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createMediaRequest({
      ...payload.data,
      userId: session.sub,
    });

    debugLog("api:requests", "Create request completed", {
      userId: session.sub,
      requestId: created.id,
      title: created.title,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    debugError("api:requests", "Create request failed", error);
    return NextResponse.json({ error: "Failed to create request." }, { status: 500 });
  }
}
