import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for seeding.");
}

if (!adminEmail || !adminPassword) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const requiredAdminEmail = adminEmail.toLowerCase();
const requiredAdminPassword = adminPassword;

async function main() {
  const passwordHash = await hash(requiredAdminPassword, 12);

  await prisma.user.upsert({
    where: { email: requiredAdminEmail },
    update: {
      displayName: "Admin",
      passwordHash,
      role: UserRole.ADMIN,
    },
    create: {
      email: requiredAdminEmail,
      displayName: "Admin",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.indexerProfile.upsert({
    where: { indexerKey: process.env.JACKETT_INDEXER ?? "all" },
    update: {
      name: "Primary Jackett Indexer",
      enabled: true,
    },
    create: {
      name: "Primary Jackett Indexer",
      indexerKey: process.env.JACKETT_INDEXER ?? "all",
      enabled: true,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
