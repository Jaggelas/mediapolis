import { describe, expect, test } from "vitest";
import { MediaType } from "@/src/generated/prisma/enums";
import { scoreCandidateHeuristically } from "@/src/lib/ai-matcher";

describe("AI matcher heuristics", () => {
  test("rewards close title and year matches", () => {
    const score = scoreCandidateHeuristically(
      {
        title: "Big Buck Bunny",
        year: 2008,
        mediaType: MediaType.MOVIE,
      },
      {
        title: "Big.Buck.Bunny.2008.1080p.BluRay.x264",
        seeders: 22,
      },
    );

    expect(score).toBeGreaterThan(0.8);
  });

  test("penalizes mismatched episode releases", () => {
    const score = scoreCandidateHeuristically(
      {
        title: "Sintel S01E02",
        mediaType: MediaType.SHOW,
      },
      {
        title: "Sintel.S01E05.1080p.WEBRip",
        seeders: 30,
      },
    );

    expect(score).toBeLessThan(0.75);
  });
});
