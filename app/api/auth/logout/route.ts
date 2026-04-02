import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/src/lib/session";
import { redirectResponse } from "@/src/lib/redirect-response";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return redirectResponse("/login");
}
