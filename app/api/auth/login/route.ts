import { NextResponse } from "next/server";
import { authenticateUser } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticateUser(email, password);

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 302 });
  }

  return NextResponse.redirect(new URL("/dashboard", request.url), { status: 302 });
}
