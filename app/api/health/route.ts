import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getEnv } from "@/src/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const env = getEnv();
  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json({
    ok: true,
    app: env.NEXT_PUBLIC_APP_NAME,
    timestamp: new Date().toISOString(),
  });
}
