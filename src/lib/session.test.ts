import { describe, expect, test } from "vitest";
import { resolveSessionCookieSecureFlag } from "@/src/lib/session";

describe("resolveSessionCookieSecureFlag", () => {
  test("uses the explicit env override when present", () => {
    const secure = resolveSessionCookieSecureFlag(
      {
        NODE_ENV: "production",
        SESSION_COOKIE_SECURE: false,
      },
      new Headers({
        origin: "https://mediapolis.example",
      }),
    );

    expect(secure).toBe(false);
  });

  test("disables secure cookies for plain http origins", () => {
    const secure = resolveSessionCookieSecureFlag(
      {
        NODE_ENV: "production",
        SESSION_COOKIE_SECURE: undefined,
      },
      new Headers({
        origin: "http://192.168.1.2",
      }),
    );

    expect(secure).toBe(false);
  });

  test("enables secure cookies behind an https proxy", () => {
    const secure = resolveSessionCookieSecureFlag(
      {
        NODE_ENV: "production",
        SESSION_COOKIE_SECURE: undefined,
      },
      new Headers({
        "x-forwarded-proto": "https",
      }),
    );

    expect(secure).toBe(true);
  });
});
