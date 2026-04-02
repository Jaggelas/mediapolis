import { UserRole } from "@/src/generated/prisma/enums";
import { requireAdminSession } from "@/src/lib/session";
import { redirectResponse } from "@/src/lib/redirect-response";
import { CreatePlatformUserError, createPlatformUser } from "@/src/lib/user-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  const formData = await request.formData();

  try {
    await createPlatformUser({
      email: String(formData.get("email") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? UserRole.USER) as UserRole,
      createdByUserId: session.sub,
    });

    return redirectResponse("/settings?user=created");
  } catch (error) {
    if (error instanceof CreatePlatformUserError) {
      const userStatus = error.code === "EMAIL_TAKEN" ? "email-taken" : "invalid";
      return redirectResponse(`/settings?user=${userStatus}`);
    }

    throw error;
  }
}
