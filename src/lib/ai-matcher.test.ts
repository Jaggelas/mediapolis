import { describe, expect, test } from "vitest";
import { MediaType } from "@/src/generated/prisma/enums";
import { planCandidateScoring, scoreCandidateHeuristically } from "@/src/lib/ai-matcher";

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

  test("limits AI scoring to the strongest heuristic candidates", () => {
    const planned = planCandidateScoring(
      {
        title: "Big Buck Bunny",
        year: 2008,
        mediaType: MediaType.MOVIE,
      },
      [
        { title: "Big.Buck.Bunny.2008.1080p.BluRay.x264", seeders: 22 },
        { title: "Big.Buck.Bunny.2008.720p.WEBRip", seeders: 12 },
        { title: "Big.Buck.Bunny.2007.CAM", seeders: 3 },
        { title: "Completely.Different.Movie.2020.1080p", seeders: 50 },
      ],
      {
        maxAiCandidates: 2,
        minHeuristicScore: 0.6,
      },
    );

    expect(planned).toHaveLength(4);
    expect(planned.filter((entry) => entry.useAi)).toHaveLength(2);
    expect(planned[0]?.useAi).toBe(true);
    expect(planned[1]?.useAi).toBe(true);
    expect(planned[2]?.useAi).toBe(false);
    expect(planned[3]?.useAi).toBe(false);
  });

  test("can disable AI scoring entirely", () => {
    const planned = planCandidateScoring(
      {
        title: "Big Buck Bunny",
        year: 2008,
        mediaType: MediaType.MOVIE,
      },
      [{ title: "Big.Buck.Bunny.2008.1080p.BluRay.x264", seeders: 22 }],
      {
        maxAiCandidates: 0,
        minHeuristicScore: 0.6,
      },
    );

    expect(planned[0]?.useAi).toBe(false);
  });
});
