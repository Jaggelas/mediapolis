import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/src/generated/prisma/client";
import { getEnv } from "@/src/lib/env";

declare global {
  var prismaSingleton: PrismaClient | undefined;
}

function createPrismaClient() {
  const env = getEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalThis.prismaSingleton ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaSingleton = prisma;
}
