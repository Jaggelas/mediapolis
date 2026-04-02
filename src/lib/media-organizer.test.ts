import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { MediaType, PlexLibraryType } from "@/src/generated/prisma/enums";
import { buildDestinationPath, resolveDestinationPath } from "@/src/lib/media-organizer";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

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
      year: 2010,
      mediaType: MediaType.SHOW,
      sourcePath: "/downloads/Sintel.S01E02.1080p.mkv",
    });

    expect(result.library).toBe(PlexLibraryType.TV);
    expect(result.seasonNumber).toBe(1);
    expect(result.episodeNumber).toBe(2);
    expect(result.destinationPath).toContain("Sintel (2010)");
    expect(result.destinationPath).toContain("Season 01");
    expect(result.destinationPath).toContain("Sintel (2010) - s01e02.mkv");
  });

  test("normalizes Windows-style source paths before building a movie destination", () => {
    const result = buildDestinationPath({
      title: "Avatar Fire and Ash",
      year: 2025,
      mediaType: MediaType.MOVIE,
      sourcePath: "\\home\\jaggelas\\downloads\\Avatar.Fire.And.Ash.2025.1080p.mkv",
    });

    expect(result.library).toBe(PlexLibraryType.MOVIES);
    expect(result.destinationPath).toContain("Avatar Fire and Ash (2025).mkv");
  });

  test("resolves the main video file from a folder-style movie download", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "mediapolis-organizer-"));
    tempDirs.push(tempDir);

    const releaseDir = path.join(tempDir, "Scream.7.2026.2160p.WEBRip");
    await mkdir(releaseDir, { recursive: true });
    await writeFile(path.join(releaseDir, "sample.txt"), "ignore me");
    await writeFile(path.join(releaseDir, "Scream.7.2026.trailer.mp4"), "small");
    await writeFile(path.join(releaseDir, "Scream.7.2026.feature.mkv"), "this is the main movie file");

    const result = await resolveDestinationPath({
      title: "Scream 7",
      year: 2026,
      mediaType: MediaType.MOVIE,
      sourcePath: releaseDir,
    });

    expect(result.sourcePath).toBe(path.join(releaseDir, "Scream.7.2026.feature.mkv"));
    expect(result.destinationPath).toContain("Scream 7 (2026)");
    expect(result.destinationPath).toContain("Scream 7 (2026).mkv");
  });
});
