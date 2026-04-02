import { compare } from "bcryptjs";
import { prisma } from "@/src/lib/db";
import { setSessionCookie } from "@/src/lib/session";

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    return null;
  }

  const passwordMatches = await compare(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  await setSessionCookie({
    sub: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  });

  return user;
}
