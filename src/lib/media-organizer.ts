import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
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

const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".m4v",
  ".wmv",
  ".ts",
  ".m2ts",
  ".webm",
]);

function sanitizeSegment(input: string) {
  return input.replace(/[<>:"/\\|?*]+/g, "").trim();
}

function normalizeSourcePath(input: string) {
  return path.normalize(input.replaceAll("\\", "/"));
}

async function collectVideoFiles(targetPath: string): Promise<Array<{ filePath: string; size: number }>> {
  const entries = await readdir(targetPath, { withFileTypes: true });
  const files: Array<{ filePath: string; size: number }> = [];

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectVideoFiles(entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const entryStats = await stat(entryPath);
    files.push({
      filePath: entryPath,
      size: entryStats.size,
    });
  }

  return files;
}

export async function resolveMediaSourcePath(input: OrganizerInput) {
  const normalizedSourcePath = normalizeSourcePath(input.sourcePath);
  const sourceStats = await stat(normalizedSourcePath);

  if (sourceStats.isFile()) {
    return normalizedSourcePath;
  }

  if (!sourceStats.isDirectory()) {
    throw new Error(`Unsupported download source path: ${normalizedSourcePath}`);
  }

  const videoFiles = await collectVideoFiles(normalizedSourcePath);

  if (videoFiles.length === 0) {
    throw new Error(`No playable media file found in ${normalizedSourcePath}`);
  }

  return videoFiles.sort((left, right) => right.size - left.size)[0].filePath;
}

export function buildDestinationPath(input: OrganizerInput) {
  const env = getEnv();
  const safeTitle = sanitizeSegment(input.title);
  const normalizedSourcePath = normalizeSourcePath(input.sourcePath);

  if (input.mediaType === MediaType.MOVIE) {
    const movieFolder = input.year ? `${safeTitle} (${input.year})` : safeTitle;
    const extension = path.extname(normalizedSourcePath);
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

  const episode = inferEpisode(normalizedSourcePath) ?? { seasonNumber: 1, episodeNumber: 1 };
  const extension = path.extname(normalizedSourcePath);
  const showFolder = input.year ? `${safeTitle} (${input.year})` : safeTitle;
  const episodeLabel = `s${String(episode.seasonNumber).padStart(2, "0")}e${String(episode.episodeNumber).padStart(2, "0")}`;
  const destinationPath = path.join(
    env.PLEX_TV_DIR,
    showFolder,
    `Season ${String(episode.seasonNumber).padStart(2, "0")}`,
    `${showFolder} - ${episodeLabel}${extension}`,
  );

  return {
    library: PlexLibraryType.TV,
    destinationPath,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  };
}

export async function resolveDestinationPath(input: OrganizerInput) {
  const sourcePath = await resolveMediaSourcePath(input);
  return {
    ...buildDestinationPath({
      ...input,
      sourcePath,
    }),
    sourcePath,
  };
}

export async function moveIntoPlexLibrary(input: OrganizerInput) {
  const destination = await resolveDestinationPath(input);
  await mkdir(path.dirname(destination.destinationPath), { recursive: true });

  try {
    await rename(destination.sourcePath, destination.destinationPath);
  } catch {
    await copyFile(destination.sourcePath, destination.destinationPath);
    await unlink(destination.sourcePath);
  }

  return destination;
}
