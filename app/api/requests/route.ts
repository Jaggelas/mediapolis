import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, RequestScope, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { debugError, debugLog, debugWarn } from "@/src/lib/debug-log";
import { createMediaRequest } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

const createRequestSchema = z.object({
  title: z.string().min(1),
  mediaType: z.nativeEnum(MediaType),
  year: z.number().int().min(1900).max(2100).optional(),
  notes: z.string().optional(),
  scope: z.nativeEnum(RequestScope).optional(),
  seasonNumber: z.number().int().min(1).max(200).optional(),
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

  const scope = payload.data.scope ?? RequestScope.TITLE;

  if (payload.data.mediaType === MediaType.MOVIE) {
    if (scope !== RequestScope.TITLE || payload.data.seasonNumber) {
      return NextResponse.json(
        { error: "Movie requests only support title scope." },
        { status: 400 },
      );
    }
  } else {
    if (scope === RequestScope.SEASON && !payload.data.seasonNumber) {
      return NextResponse.json(
        { error: "Season requests require a season number." },
        { status: 400 },
      );
    }
    if (scope !== RequestScope.SEASON && payload.data.seasonNumber) {
      return NextResponse.json(
        { error: "seasonNumber is only allowed for season-scoped show requests." },
        { status: 400 },
      );
    }
  }

  try {
    const created = await createMediaRequest({
      ...payload.data,
      scope,
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
