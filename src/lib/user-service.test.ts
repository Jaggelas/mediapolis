import { beforeEach, describe, expect, test, vi } from "vitest";
import { UserRole } from "@/src/generated/prisma/enums";

const { hashMock, findUniqueMock, createMock, createAuditLogMock } = vi.hoisted(() => ({
  hashMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
  createAuditLogMock: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  hash: hashMock,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      create: createMock,
    },
  },
}));

vi.mock("@/src/lib/audit-log", () => ({
  createAuditLog: createAuditLogMock,
}));

import { CreatePlatformUserError, createPlatformUser } from "@/src/lib/user-service";

describe("createPlatformUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashMock.mockResolvedValue("hashed-password");
    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      id: "user_123",
      email: "new.user@example.com",
      displayName: "New User",
      role: UserRole.USER,
    });
    createAuditLogMock.mockResolvedValue(undefined);
  });

  test("creates a user with normalized input and an audit log", async () => {
    const user = await createPlatformUser({
      email: "  New.User@Example.com  ",
      displayName: "  New User  ",
      password: "super-secret",
      role: UserRole.USER,
      createdByUserId: "admin_123",
    });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { email: "new.user@example.com" },
      select: { id: true },
    });
    expect(hashMock).toHaveBeenCalledWith("super-secret", 12);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        email: "new.user@example.com",
        displayName: "New User",
        passwordHash: "hashed-password",
        role: UserRole.USER,
      },
    });
    expect(createAuditLogMock).toHaveBeenCalledWith({
      userId: "admin_123",
      action: "user.created",
      entityType: "User",
      entityId: "user_123",
      details: {
        email: "new.user@example.com",
        displayName: "New User",
        role: UserRole.USER,
      },
    });
    expect(user.id).toBe("user_123");
  });

  test("rejects duplicate email addresses", async () => {
    findUniqueMock.mockResolvedValue({ id: "existing_user" });

    await expect(
      createPlatformUser({
        email: "existing@example.com",
        displayName: "Existing User",
        password: "super-secret",
        role: UserRole.ADMIN,
      }),
    ).rejects.toMatchObject<CreatePlatformUserError>({
      code: "EMAIL_TAKEN",
    });

    expect(hashMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(createAuditLogMock).not.toHaveBeenCalled();
  });
});
