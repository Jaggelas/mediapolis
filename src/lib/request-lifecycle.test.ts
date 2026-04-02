import { describe, expect, test } from "vitest";
import { RequestStatus } from "@/src/generated/prisma/enums";
import { determineSearchOutcomeStatus } from "@/src/lib/request-lifecycle";

describe("request lifecycle", () => {
  test("moves to matched when auto-download conditions are satisfied", () => {
    const result = determineSearchOutcomeStatus({
      bestConfidence: 0.94,
      threshold: 0.86,
      allowAutoDownloads: true,
      hasMagnetUri: true,
    });

    expect(result).toBe(RequestStatus.MATCHED);
  });

  test("moves to review when confidence is too low", () => {
    const result = determineSearchOutcomeStatus({
      bestConfidence: 0.42,
      threshold: 0.86,
      allowAutoDownloads: true,
      hasMagnetUri: true,
    });

    expect(result).toBe(RequestStatus.REVIEW);
  });
});
