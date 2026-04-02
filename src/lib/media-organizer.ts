import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { MediaType, PlexLibraryType } from "@/src/generated/prisma/enums";
import { getEnv } from "@/src/lib/env";
import { inferEpisode } from "@/src/lib/title-utils";

type OrganizerInput = {
  title: string;
  year?: number | null;
  mediaType: MediaType;
  sourcePath: string;
};

function sanitizeSegment(input: string) {
  return input.replace(/[<>:"/\\|?*]+/g, "").trim();
}

export function buildDestinationPath(input: OrganizerInput) {
  const env = getEnv();
  const safeTitle = sanitizeSegment(input.title);

  if (input.mediaType === MediaType.MOVIE) {
    const movieFolder = input.year ? `${safeTitle} (${input.year})` : safeTitle;
    const extension = path.extname(input.sourcePath);
    return {
      library: PlexLibraryType.MOVIES,
      destinationPath: path.join(
        env.PLEX_MOVIES_DIR,
        movieFolder,
        `${movieFolder}${extension}`,
      ),
      seasonNumber: null,
      episodeNumber: null,
    };
  }

  const episode = inferEpisode(input.sourcePath) ?? { seasonNumber: 1, episodeNumber: 1 };
  const extension = path.extname(input.sourcePath);
  const episodeLabel = `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
  const destinationPath = path.join(
    env.PLEX_TV_DIR,
    safeTitle,
    `Season ${String(episode.seasonNumber).padStart(2, "0")}`,
    `${safeTitle} - ${episodeLabel}${extension}`,
  );

  return {
    library: PlexLibraryType.TV,
    destinationPath,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  };
}

export async function moveIntoPlexLibrary(input: OrganizerInput) {
  const destination = buildDestinationPath(input);
  await mkdir(path.dirname(destination.destinationPath), { recursive: true });

  try {
    await rename(input.sourcePath, destination.destinationPath);
  } catch {
    await copyFile(input.sourcePath, destination.destinationPath);
    await unlink(input.sourcePath);
  }

  return destination;
}
