import { hash } from "bcryptjs";
import { z } from "zod";
import { UserRole } from "@/src/generated/prisma/enums";
import { createAuditLog } from "@/src/lib/audit-log";
import { prisma } from "@/src/lib/db";

const createPlatformUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(UserRole),
  createdByUserId: z.string().trim().min(1).optional(),
});

export class CreatePlatformUserError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "EMAIL_TAKEN") {
    super(code === "EMAIL_TAKEN" ? "A user with that email already exists." : "Invalid user input.");
    this.name = "CreatePlatformUserError";
  }
}

export async function createPlatformUser(input: {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  createdByUserId?: string;
}) {
  const parsed = createPlatformUserSchema.safeParse(input);

  if (!parsed.success) {
    throw new CreatePlatformUserError("INVALID_INPUT");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new CreatePlatformUserError("EMAIL_TAKEN");
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      passwordHash,
      role: parsed.data.role,
    },
  });

  await createAuditLog({
    userId: parsed.data.createdByUserId,
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    details: {
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });

  return user;
}
