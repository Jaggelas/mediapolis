import { describe, expect, test } from "vitest";
import { MediaType, PlexLibraryType } from "@/src/generated/prisma/enums";
import { buildDestinationPath } from "@/src/lib/media-organizer";

describe("media organizer", () => {
  test("builds Plex movie folder conventions", () => {
    const result = buildDestinationPath({
      title: "Big Buck Bunny",
      year: 2008,
      mediaType: MediaType.MOVIE,
      sourcePath: "/downloads/Big.Buck.Bunny.2008.1080p.mkv",
    });

    expect(result.library).toBe(PlexLibraryType.MOVIES);
    expect(result.destinationPath).toContain("Big Buck Bunny (2008)");
    expect(result.destinationPath).toContain("Big Buck Bunny (2008).mkv");
  });

  test("builds Plex TV folder conventions", () => {
    const result = buildDestinationPath({
      title: "Sintel",
      mediaType: MediaType.SHOW,
      sourcePath: "/downloads/Sintel.S01E02.1080p.mkv",
    });

    expect(result.library).toBe(PlexLibraryType.TV);
    expect(result.seasonNumber).toBe(1);
    expect(result.episodeNumber).toBe(2);
    expect(result.destinationPath).toContain("Season 01");
    expect(result.destinationPath).toContain("Sintel - S01E02.mkv");
  });
});
