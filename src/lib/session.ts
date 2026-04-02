import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@/src/generated/prisma/enums";
import { getEnv, type AppEnv } from "@/src/lib/env";

const SESSION_COOKIE = "mediapolis_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type SessionPayload = {
  sub: string;
  email: string;
  role: UserRole;
  displayName: string;
};

function getSecret() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export function resolveSessionCookieSecureFlag(
  env: Pick<AppEnv, "NODE_ENV" | "SESSION_COOKIE_SECURE">,
  requestHeaders: Pick<Headers, "get">,
) {
  if (env.SESSION_COOKIE_SECURE !== undefined) {
    return env.SESSION_COOKIE_SECURE;
  }

  const forwardedProto = requestHeaders.get("x-forwarded-proto");

  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const origin = requestHeaders.get("origin") ?? requestHeaders.get("referer");

  if (origin) {
    try {
      return new URL(origin).protocol === "https:";
    } catch {
      // Ignore malformed headers and fall back to the runtime default.
    }
  }

  return env.NODE_ENV === "production";
}

async function shouldUseSecureSessionCookie() {
  const env = getEnv();
  return resolveSessionCookieSecureFlag(env, await headers());
}

export async function setSessionCookie(payload: SessionPayload) {
  const cookieStore = await cookies();
  const token = await createSessionToken(payload);

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: await shouldUseSecureSessionCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const result = await jwtVerify<SessionPayload>(token, getSecret());
    return result.payload;
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();

  if (session.role !== UserRole.ADMIN) {
    redirect("/browse");
  }

  return session;
}
