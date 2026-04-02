import { prisma } from "@/src/lib/db";

type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

export async function createAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      requestId: input.requestId,
      details: input.details ? JSON.parse(JSON.stringify(input.details)) : undefined,
    },
  });
}
