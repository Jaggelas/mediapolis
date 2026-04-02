import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = createRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid request payload.", issues: payload.error.flatten() },
      { status: 400 },
    );
  }

  const created = await createMediaRequest({
    ...payload.data,
    userId: session.sub,
  });

  return NextResponse.json(created, { status: 201 });
}
