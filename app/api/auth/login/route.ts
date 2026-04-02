import { NextResponse } from "next/server";
import { authenticateUser } from "@/src/lib/auth";
import { redirectResponse } from "@/src/lib/redirect-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticateUser(email, password);

  if (!user) {
    return redirectResponse("/login");
  }

  return redirectResponse("/browse");
}
