import { access, rm } from "node:fs/promises";
import path from "node:path";
import { CandidateStatus, DownloadSource, DownloadStatus, MediaFileStatus, MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { debugLog, debugWarn } from "@/src/lib/debug-log";
import { getEnv } from "@/src/lib/env";
import { createAuditLog } from "@/src/lib/audit-log";
import { planCandidateScoring, scoreCandidateWithAi } from "@/src/lib/ai-matcher";
import { searchJackett } from "@/src/lib/jackett";
import { moveIntoPlexLibrary, resolveDestinationPath } from "@/src/lib/media-organizer";
import { addMagnetToQbittorrent, addTorrentFileToQbittorrent, getQbittorrentTorrent, listQbittorrentTorrents, removeQbittorrentTorrents } from "@/src/lib/qbittorrent";
import { determineSearchOutcomeStatus } from "@/src/lib/request-lifecycle";
import { buildSearchQuery, inferEpisode, inferYear, normalizeTitle } from "@/src/lib/title-utils";
import { resolveTmdbMatch } from "@/src/lib/tmdb";

type CreateRequestInput = {
  title: string;
  mediaType: MediaType;
  year?: number;
  notes?: string;
  userId: string;
  tmdbId?: number;
};

type BrowseSelectedTorrentInput = {
  title: string;
  magnetUri: string;
  torrentUrl?: string;
  indexerKey?: string;
  seeders?: number;
  peers?: number;
  sizeBytes?: number;
  resolution?: string;
};

const RESOLUTION_NOTE_PREFIX = "Preferred resolution:";
const SUPPORTED_RESOLUTIONS = ["2160p", "1440p", "1080p", "720p", "576p", "480p"] as const;
type ResolutionPreference = (typeof SUPPORTED_RESOLUTIONS)[number];

const ACTIVE_DOWNLOAD_STATUSES = [
  DownloadStatus.QUEUED,
  DownloadStatus.MATCHED,
  DownloadStatus.DOWNLOADING,
  DownloadStatus.ORGANIZING,
];

const VISIBLE_DOWNLOAD_FEED_STATUSES = [...ACTIVE_DOWNLOAD_STATUSES, DownloadStatus.FAILED];

function inferMediaTypeFromName(input: string) {
  return inferEpisode(input) ? MediaType.SHOW : MediaType.MOVIE;
}

function buildQbCategory(requestId: string) {
  return `request-${requestId}`;
}

function buildNextSearchAt(searchIntervalMinutes: number) {
  return new Date(Date.now() + searchIntervalMinutes * 60 * 1000);
}

function normalizeContainerPath(filePath: string) {
  return path.posix.normalize(filePath.replaceAll("\\", "/"));
}

function translateHostDownloadPathToContainer(filePath: string) {
  const env = getEnv();
  const normalizedPath = normalizeContainerPath(filePath);
  const normalizedHostRoot = env.HOST_DOWNLOADS_INCOMING
    ? normalizeContainerPath(env.HOST_DOWNLOADS_INCOMING)
    : "";
  const normalizedContainerRoot = normalizeContainerPath(env.DOWNLOADS_INCOMING_DIR);

  if (
    normalizedHostRoot &&
    (normalizedPath === normalizedHostRoot || normalizedPath.startsWith(`${normalizedHostRoot}/`))
  ) {
    const suffix = normalizedPath.slice(normalizedHostRoot.length);
    return `${normalizedContainerRoot}${suffix}`;
  }

  return normalizedPath;
}

function resolveTorrentDownloadPath(
  torrent: { save_path: string; name: string; content_path?: string | null },
) {
  const rawPath = torrent.content_path?.trim()
    ? torrent.content_path
    : path.posix.join(normalizeContainerPath(torrent.save_path), torrent.name);

  return translateHostDownloadPathToContainer(rawPath);
}

function isQbittorrentFailureState(state: string) {
  const normalizedState = state.toLowerCase();
  return normalizedState.includes("error") || normalizedState.includes("missingfiles");
}

function normalizeResolutionPreference(input?: string | null): ResolutionPreference | undefined {
  if (!input) {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === "4k") {
    return "2160p";
  }

  return SUPPORTED_RESOLUTIONS.find((resolution) => resolution === normalized);
}

function extractPreferredResolution(notes?: string | null): ResolutionPreference | undefined {
  if (!notes) {
    return undefined;
  }

  const escapedPrefix = RESOLUTION_NOTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = notes.match(new RegExp(`${escapedPrefix}\\s*(\\S+)`, "i"));
  return normalizeResolutionPreference(match?.[1]);
}

function candidateMatchesResolution(title: string, preferredResolution: ResolutionPreference) {
  const normalizedTitle = title.toLowerCase();

  switch (preferredResolution) {
    case "2160p":
      return /\b(?:2160p|4k|uhd)\b/i.test(normalizedTitle);
    default:
      return new RegExp(`\\b${preferredResolution}\\b`, "i").test(normalizedTitle);
  }
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findActiveDownloadJobForRequest(requestId: string) {
  return prisma.downloadJob.findFirst({
    where: {
      requestId,
      status: {
        in: ACTIVE_DOWNLOAD_STATUSES,
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function removeRequestTorrents(requestId: string, knownHashes: string[] = []) {
  const qbCategory = buildQbCategory(requestId);
  debugLog("request-service", "Removing request torrents", {
    requestId,
    qbCategory,
    knownHashCount: knownHashes.filter(Boolean).length,
  });
  const torrents = await listQbittorrentTorrents(qbCategory);
  const hashes = [...new Set([...knownHashes.filter(Boolean), ...torrents.map((torrent) => torrent.hash)])];

  if (hashes.length > 0) {
    await removeQbittorrentTorrents({
      hashes,
      deleteFiles: true,
    });
  }
}

async function removeCompletedDownloadTorrent(input: {
  requestId: string;
  qbCategory?: string | null;
  qbTorrentHash?: string | null;
}) {
  const qbCategory = input.qbCategory ?? buildQbCategory(input.requestId);
  debugLog("request-service", "Removing completed qBittorrent torrent", {
    requestId: input.requestId,
    qbCategory,
    hasKnownHash: Boolean(input.qbTorrentHash),
  });

  const torrents = await listQbittorrentTorrents(qbCategory);
  const hashes = [
    ...new Set(
      [input.qbTorrentHash, ...torrents.map((torrent) => torrent.hash)].filter(
        (hash): hash is string => Boolean(hash),
      ),
    ),
  ];

  if (hashes.length === 0) {
    debugLog("request-service", "No qBittorrent torrents found to remove after post-processing", {
      requestId: input.requestId,
      qbCategory,
    });
    return;
  }

  await removeQbittorrentTorrents({
    hashes,
    deleteFiles: false,
  });
}

async function startCandidateDownload(
  requestId: string,
  candidateId: string,
  options?: { replaceExisting?: boolean },
) {
  debugLog("request-service", "Starting candidate download", {
    requestId,
    candidateId,
  });
  const candidate = await prisma.candidateTorrent.findUnique({
    where: { id: candidateId },
    include: { request: true },
  });

  if (!candidate) {
    debugWarn("request-service", "Candidate download failed because candidate was not found", {
      requestId,
      candidateId,
    });
    throw new Error("Candidate not found.");
  }

  if (!candidate.magnetUri) {
    debugWarn("request-service", "Candidate download failed because no magnet URI was present", {
      requestId,
      candidateId,
    });
    throw new Error("This candidate does not expose a magnet URI for automated download.");
  }

  const qbCategory = buildQbCategory(requestId);
  const existingDownloadJob = await findActiveDownloadJobForRequest(requestId);

  if (existingDownloadJob) {
    if (options?.replaceExisting) {
      debugLog("request-service", "Replacing existing active download job for request", {
        requestId,
        candidateId,
        existingDownloadJobId: existingDownloadJob.id,
        existingCandidateId: existingDownloadJob.candidateId,
      });

      try {
        await removeRequestTorrents(
          requestId,
          [existingDownloadJob.qbTorrentHash].filter((hash): hash is string => Boolean(hash)),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown qBittorrent cleanup error.";
        debugWarn("request-service", "Failed to clear existing torrents before manual candidate switch", {
          requestId,
          candidateId,
          existingDownloadJobId: existingDownloadJob.id,
          message,
        });
        throw new Error(`Failed to replace the current torrent: ${message}`);
      }

      await prisma.downloadJob.updateMany({
        where: {
          requestId,
          status: {
            in: ACTIVE_DOWNLOAD_STATUSES,
          },
        },
        data: {
          status: DownloadStatus.CANCELLED,
          errorMessage: `Replaced by approved candidate ${candidateId}.`,
          completedAt: new Date(),
        },
      });

      if (existingDownloadJob.candidateId && existingDownloadJob.candidateId !== candidateId) {
        await prisma.candidateTorrent.update({
          where: { id: existingDownloadJob.candidateId },
          data: {
            status: CandidateStatus.REJECTED,
            reason: "Replaced by a manually selected candidate.",
          },
        });
      }
    } else {
    debugWarn("request-service", "Reusing existing active download job for request", {
      requestId,
      candidateId,
      existingDownloadJobId: existingDownloadJob.id,
      existingCandidateId: existingDownloadJob.candidateId,
    });

    await prisma.mediaRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.DOWNLOADING,
      },
    });

    return existingDownloadJob;
    }
  }

  await addMagnetToQbittorrent({
    magnetUri: candidate.magnetUri,
    category: qbCategory,
  });

  const downloadJob = await prisma.downloadJob.create({
    data: {
      requestId,
      candidateId: candidate.id,
      source: DownloadSource.JACKETT,
      status: DownloadStatus.DOWNLOADING,
      qbCategory,
      inputName: candidate.title,
      inputMagnet: candidate.magnetUri,
      downloadRoot: getEnv().DOWNLOADS_INCOMING_DIR,
    },
  });

  await prisma.candidateTorrent.update({
    where: { id: candidate.id },
    data: {
      status: candidate.status === CandidateStatus.APPROVED
        ? CandidateStatus.APPROVED
        : CandidateStatus.AUTO_SELECTED,
    },
  });

  await prisma.mediaRequest.update({
    where: { id: requestId },
    data: {
      status: RequestStatus.DOWNLOADING,
    },
  });

  debugLog("request-service", "Candidate download job created", {
    requestId,
    candidateId,
    downloadJobId: downloadJob.id,
    qbCategory,
  });
  return downloadJob;
}

export async function createMediaRequest(input: CreateRequestInput) {
  debugLog("request-service", "Creating media request", {
    userId: input.userId,
    title: input.title,
    mediaType: input.mediaType,
    year: input.year ?? null,
  });
  const normalizedTitle = normalizeTitle(input.title);
  const tmdbMatch = input.tmdbId
    ? { tmdbId: input.tmdbId }
    : await resolveTmdbMatch({
        title: input.title,
        year: input.year,
        mediaType: input.mediaType,
      });

  const request = await prisma.mediaRequest.create({
    data: {
      requestedById: input.userId,
      title: input.title.trim(),
      normalizedTitle,
      year: input.year,
      mediaType: input.mediaType,
      notes: input.notes,
      tmdbId: tmdbMatch?.tmdbId,
      searchQuery: buildSearchQuery(input.title.trim(), input.year),
      nextSearchAt: new Date(),
      autoDownloadThreshold: getEnv().AUTO_DOWNLOAD_THRESHOLD,
    },
  });

  await createAuditLog({
    userId: input.userId,
    requestId: request.id,
    action: "request.created",
    entityType: "MediaRequest",
    entityId: request.id,
    details: {
      title: request.title,
      mediaType: request.mediaType,
      year: request.year,
    },
  });

  debugLog("request-service", "Media request created", {
    requestId: request.id,
    title: request.title,
    tmdbId: request.tmdbId,
    aiConfidence: request.aiConfidence,
  });
  return request;
}

export async function createBrowseDownload(input: {
  title: string;
  mediaType: MediaType;
  year?: number;
  userId: string;
  tmdbId?: number;
  preferredResolution?: string;
  selectedTorrent?: BrowseSelectedTorrentInput;
}) {
  const normalizedResolution = normalizeResolutionPreference(input.preferredResolution);
  const noteSegments = ["Created from browse search."];

  if (normalizedResolution) {
    noteSegments.push(`${RESOLUTION_NOTE_PREFIX} ${normalizedResolution}.`);
  }

  if (input.selectedTorrent?.resolution) {
    noteSegments.push(`Selected torrent: ${input.selectedTorrent.resolution}.`);
  }

  const browseNotes = noteSegments.join(" ");

  const request = await createMediaRequest({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    userId: input.userId,
    tmdbId: input.tmdbId,
    notes: browseNotes,
  });

  if (input.selectedTorrent) {
    const selectedCandidate = await prisma.candidateTorrent.create({
      data: {
        requestId: request.id,
        source: "jackett",
        indexerKey: input.selectedTorrent.indexerKey,
        title: input.selectedTorrent.title,
        magnetUri: input.selectedTorrent.magnetUri,
        torrentUrl: input.selectedTorrent.torrentUrl,
        sizeBytes: input.selectedTorrent.sizeBytes
          ? BigInt(Math.max(0, Math.floor(input.selectedTorrent.sizeBytes)))
          : null,
        seeders: input.selectedTorrent.seeders,
        peers: input.selectedTorrent.peers,
        confidence: 1,
        reason: "Selected manually from browse details.",
        status: CandidateStatus.APPROVED,
        rawPayload: {
          selectedFrom: "browse-details",
          resolution: input.selectedTorrent.resolution,
        },
      },
    });

    try {
      await startCandidateDownload(request.id, selectedCandidate.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown selected torrent error.";

      await prisma.mediaRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.REVIEW,
          aiConfidence: 1,
          aiReason: `Selected torrent could not be started automatically: ${message}`,
        },
      });
    }
  } else {
  await searchAndMatchRequest(request.id);
  }

  return prisma.mediaRequest.findUnique({
    where: { id: request.id },
    include: {
      candidates: {
        orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
        take: 3,
      },
      downloads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function searchAndMatchRequest(requestId: string) {
  const env = getEnv();
  debugLog("request-service", "Starting search cycle for request", {
    requestId,
  });
  const request = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    include: {
      requestedBy: true,
    },
  });

  if (!request) {
    debugWarn("request-service", "Search cycle skipped because request was not found", {
      requestId,
    });
    return null;
  }

  if (request.status === RequestStatus.CANCELLED || request.status === RequestStatus.COMPLETED) {
    debugLog("request-service", "Search cycle skipped because request is no longer active", {
      requestId,
      status: request.status,
    });
    return request;
  }

  await prisma.mediaRequest.update({
    where: { id: request.id },
    data: {
      status: RequestStatus.SEARCHING,
      lastSearchedAt: new Date(),
      nextSearchAt: buildNextSearchAt(env.SEARCH_INTERVAL_MINUTES),
      aiReason: null,
    },
  });

  let candidates: Awaited<ReturnType<typeof searchJackett>>;

  try {
    candidates = await searchJackett(request.searchQuery ?? request.title, request.mediaType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error.";
    const nextSearchAt = buildNextSearchAt(env.SEARCH_INTERVAL_MINUTES);

    debugWarn("request-service", "Search failed and request will be retried later", {
      requestId,
      message,
      nextSearchAt,
    });

    await prisma.mediaRequest.update({
      where: { id: request.id },
      data: {
        status: RequestStatus.REQUESTED,
        aiReason: `Search failed: ${message}`,
        nextSearchAt,
      },
    });

    return prisma.mediaRequest.findUnique({
      where: { id: request.id },
    });
  }

  debugLog("request-service", "Jackett search completed", {
    requestId,
    candidateCount: candidates.length,
    query: request.searchQuery ?? request.title,
  });

  const preferredResolution = extractPreferredResolution(request.notes);
  const resolutionFilteredCandidates = preferredResolution
    ? candidates.filter((candidate) => candidateMatchesResolution(candidate.title, preferredResolution))
    : candidates;
  const candidatesForScoring =
    preferredResolution && resolutionFilteredCandidates.length > 0
      ? resolutionFilteredCandidates
      : candidates;

  if (preferredResolution) {
    debugLog("request-service", "Applied resolution preference to candidate search", {
      requestId,
      preferredResolution,
      matchingCandidates: resolutionFilteredCandidates.length,
      fallbackToAllCandidates: resolutionFilteredCandidates.length === 0,
      totalCandidates: candidates.length,
    });
  }

  if (candidates.length === 0) {
    const nextSearchAt = buildNextSearchAt(env.SEARCH_INTERVAL_MINUTES);

    await prisma.mediaRequest.update({
      where: { id: request.id },
      data: {
        status: RequestStatus.REQUESTED,
        aiReason: "No matching releases found yet. The request will be retried automatically.",
        aiConfidence: null,
        nextSearchAt,
      },
    });

    debugWarn("request-service", "No candidates returned for request", {
      requestId,
      nextSearchAt,
    });

    return prisma.mediaRequest.findUnique({
      where: { id: request.id },
    });
  }

  await prisma.candidateTorrent.deleteMany({
    where: { requestId: request.id, status: CandidateStatus.PENDING },
  });

  const scoringPlan = planCandidateScoring(
    {
      title: request.title,
      year: request.year,
      mediaType: request.mediaType,
    },
    candidatesForScoring,
    {
      maxAiCandidates: env.OPENAI_MATCH_MAX_CANDIDATES,
      minHeuristicScore: env.OPENAI_MATCH_MIN_HEURISTIC,
    },
  );

  debugLog("request-service", "Prepared candidate scoring plan", {
    requestId,
    candidateCount: scoringPlan.length,
    aiCandidateCount: scoringPlan.filter((entry) => entry.useAi).length,
    heuristicOnlyCount: scoringPlan.filter((entry) => !entry.useAi).length,
    maxAiCandidates: env.OPENAI_MATCH_MAX_CANDIDATES,
    minHeuristicScore: env.OPENAI_MATCH_MIN_HEURISTIC,
  });

  const scoredCandidates = await Promise.all(
    scoringPlan.map(async ({ candidate, heuristicScore, useAi }) => {
      const score = useAi
        ? await scoreCandidateWithAi(
            {
              title: request.title,
              year: request.year,
              mediaType: request.mediaType,
            },
            candidate,
          )
        : {
            confidence: heuristicScore,
            reason: "Heuristic score used to avoid unnecessary AI requests.",
          };

      const created = await prisma.candidateTorrent.create({
        data: {
          requestId: request.id,
          source: candidate.source,
          indexerKey: candidate.indexerKey,
          title: candidate.title,
          magnetUri: candidate.magnetUri,
          torrentUrl: candidate.torrentUrl,
          infoHash: candidate.infoHash,
          sizeBytes: candidate.sizeBytes ? BigInt(candidate.sizeBytes) : null,
          seeders: candidate.seeders,
          peers: candidate.peers,
          confidence: score.confidence,
          reason: score.reason,
          rawPayload: JSON.parse(JSON.stringify(candidate.rawPayload)),
        },
      });

      return created;
    }),
  );

  const bestCandidate = scoredCandidates.sort(
    (left, right) => (right.confidence ?? 0) - (left.confidence ?? 0),
  )[0];

  if (!bestCandidate) {
    debugWarn("request-service", "No best candidate could be selected", {
      requestId,
    });
    return request;
  }

  const bestConfidence = bestCandidate.confidence ?? 0;
  const threshold = request.autoDownloadThreshold ?? env.AUTO_DOWNLOAD_THRESHOLD;
  const nextStatus = determineSearchOutcomeStatus({
    bestConfidence,
    threshold,
    allowAutoDownloads: env.ALLOW_AUTO_DOWNLOADS,
    hasMagnetUri: Boolean(bestCandidate.magnetUri),
  });

  await prisma.mediaRequest.update({
    where: { id: request.id },
    data: {
      status: nextStatus,
      aiConfidence: bestConfidence,
      aiReason:
        preferredResolution && resolutionFilteredCandidates.length === 0
          ? `Preferred resolution ${preferredResolution} was not found; best available match selected. ${bestCandidate.reason}`
          : bestCandidate.reason,
    },
  });

  debugLog("request-service", "Search cycle updated request status", {
    requestId,
    nextStatus,
    bestCandidateId: bestCandidate.id,
    bestConfidence,
    threshold,
  });

  if (nextStatus === RequestStatus.MATCHED) {
    try {
      await startCandidateDownload(request.id, bestCandidate.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown auto-download error.";

      debugWarn("request-service", "Auto-download failed after a successful match", {
        requestId,
        bestCandidateId: bestCandidate.id,
        message,
      });

      await prisma.mediaRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.REVIEW,
          aiReason: `Match found, but auto-download failed: ${message}`,
        },
      });
    }
  }

  return request;
}

export async function approveCandidate(candidateId: string, userId: string) {
  debugLog("request-service", "Approving candidate", {
    userId,
    candidateId,
  });
  const candidate = await prisma.candidateTorrent.findUnique({
    where: { id: candidateId },
    include: { request: true },
  });

  if (!candidate?.requestId) {
    debugWarn("request-service", "Candidate approval failed because candidate was not found", {
      candidateId,
    });
    throw new Error("Candidate not found.");
  }

  if (
    candidate.request?.status === RequestStatus.CANCELLED ||
    candidate.request?.status === RequestStatus.COMPLETED
  ) {
    debugWarn("request-service", "Candidate approval rejected because request is closed", {
      candidateId,
      requestId: candidate.requestId,
      requestStatus: candidate.request?.status,
    });
    throw new Error("This request can no longer be approved.");
  }

  await prisma.candidateTorrent.update({
    where: { id: candidateId },
    data: { status: CandidateStatus.APPROVED },
  });

  await createAuditLog({
    userId,
    requestId: candidate.requestId,
    action: "candidate.approved",
    entityType: "CandidateTorrent",
    entityId: candidateId,
    details: { title: candidate.title },
  });

  debugLog("request-service", "Candidate approved, starting download", {
    candidateId,
    requestId: candidate.requestId,
  });
  return startCandidateDownload(candidate.requestId, candidateId, {
    replaceExisting: true,
  });
}

export async function cancelMediaRequest(requestId: string, userId: string) {
  debugLog("request-service", "Cancelling media request", {
    userId,
    requestId,
  });
  const request = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    include: {
      downloads: true,
      candidates: true,
    },
  });

  if (!request) {
    debugWarn("request-service", "Cancellation failed because request was not found", {
      requestId,
    });
    throw new Error("Request not found.");
  }

  if (request.status === RequestStatus.COMPLETED) {
    debugWarn("request-service", "Cancellation rejected because request is completed", {
      requestId,
    });
    throw new Error("Completed requests cannot be cancelled.");
  }

  if (request.status === RequestStatus.CANCELLED) {
    debugLog("request-service", "Cancellation skipped because request is already cancelled", {
      requestId,
    });
    return request;
  }

  let torrentCleanupWarning: string | null = null;

  try {
    await removeRequestTorrents(
      request.id,
      request.downloads
        .map((download) => download.qbTorrentHash)
        .filter((hash): hash is string => Boolean(hash)),
    );
  } catch (error) {
    torrentCleanupWarning =
      error instanceof Error
        ? error.message
        : "Unknown qBittorrent cleanup error during cancellation.";
    console.warn(
      `Failed to remove qBittorrent torrents for request ${request.id}: ${torrentCleanupWarning}`,
    );
    debugWarn("request-service", "qBittorrent cleanup during cancellation failed", {
      requestId,
      warning: torrentCleanupWarning,
    });
  }

  await prisma.$transaction([
    prisma.mediaRequest.update({
      where: { id: request.id },
      data: {
        status: RequestStatus.CANCELLED,
        nextSearchAt: null,
      },
    }),
    prisma.candidateTorrent.updateMany({
      where: {
        requestId: request.id,
        status: {
          in: [
            CandidateStatus.PENDING,
            CandidateStatus.AUTO_SELECTED,
            CandidateStatus.APPROVED,
          ],
        },
      },
      data: {
        status: CandidateStatus.REJECTED,
      },
    }),
    prisma.downloadJob.updateMany({
      where: {
        requestId: request.id,
        status: {
          in: [
            DownloadStatus.QUEUED,
            DownloadStatus.MATCHED,
            DownloadStatus.DOWNLOADING,
            DownloadStatus.ORGANIZING,
            DownloadStatus.COMPLETED,
          ],
        },
      },
      data: {
        status: DownloadStatus.CANCELLED,
        completedAt: new Date(),
      },
    }),
  ]);

  await createAuditLog({
    userId,
    requestId: request.id,
    action: "request.cancelled",
    entityType: "MediaRequest",
    entityId: request.id,
    details: {
      title: request.title,
      previousStatus: request.status,
      torrentCleanupWarning,
    },
  });

  debugLog("request-service", "Cancellation completed", {
    requestId,
    torrentCleanupWarning,
  });
  return prisma.mediaRequest.findUnique({
    where: { id: request.id },
  });
}

export async function removeDownloadedMovieFromDisk(requestId: string, userId: string) {
  debugLog("request-service", "Removing downloaded movie from disk", {
    userId,
    requestId,
  });

  const request = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    include: {
      mediaFiles: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!request) {
    debugWarn("request-service", "Disk removal failed because request was not found", {
      requestId,
    });
    throw new Error("Request not found.");
  }

  if (request.mediaType !== MediaType.MOVIE) {
    debugWarn("request-service", "Disk removal rejected because request is not a movie", {
      requestId,
      mediaType: request.mediaType,
    });
    throw new Error("Only movie files can be removed from this action.");
  }

  if (request.status !== RequestStatus.COMPLETED) {
    debugWarn("request-service", "Disk removal rejected because request is not completed", {
      requestId,
      status: request.status,
    });
    throw new Error("Only completed movie requests can be removed from disk.");
  }

  if (request.mediaFiles.length === 0) {
    debugWarn("request-service", "Disk removal failed because no media file was found", {
      requestId,
    });
    throw new Error("No downloaded movie file was found for this request.");
  }

  const removablePaths = [...new Set(
    request.mediaFiles.flatMap((mediaFile) => [mediaFile.destinationPath, mediaFile.sourcePath]),
  )];

  for (const removablePath of removablePaths) {
    try {
      await rm(removablePath, { force: true, recursive: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown file removal error.";
      debugWarn("request-service", "Failed to remove one of the movie files from disk", {
        requestId,
        removablePath,
        message,
      });
      throw new Error(`Failed to remove file from disk (${removablePath}): ${message}`);
    }
  }

  await prisma.mediaFile.deleteMany({
    where: {
      requestId: request.id,
      mediaType: MediaType.MOVIE,
    },
  });

  await createAuditLog({
    userId,
    requestId: request.id,
    action: "movie.removed_from_disk",
    entityType: "MediaRequest",
    entityId: request.id,
    details: {
      title: request.title,
      fileCount: request.mediaFiles.length,
      paths: removablePaths,
    },
  });

  debugLog("request-service", "Movie removed from disk", {
    requestId,
    fileCount: request.mediaFiles.length,
  });

  return request;
}

export async function createManualDownload(input: {
  userId: string;
  magnetUri?: string;
  torrentFile?: File;
  fileName?: string;
  requestTitle?: string;
  mediaType?: MediaType;
}) {
  debugLog("request-service", "Creating manual download", {
    userId: input.userId,
    requestTitle: input.requestTitle ?? null,
    hasMagnetUri: Boolean(input.magnetUri),
    torrentFileName: input.torrentFile?.name ?? input.fileName ?? null,
  });
  const titleBasis =
    input.requestTitle?.trim() ||
    input.fileName?.replace(/\.torrent$/i, "") ||
    "Imported media";
  const mediaType = input.mediaType ?? inferMediaTypeFromName(titleBasis);
  const year = inferYear(titleBasis);

  const request = await createMediaRequest({
    userId: input.userId,
    title: titleBasis,
    mediaType,
    year,
    notes: "Created from manual upload or magnet import.",
  });

  const qbCategory = buildQbCategory(request.id);
  let source: DownloadSource = DownloadSource.MAGNET;

  if (input.magnetUri) {
    await addMagnetToQbittorrent({
      magnetUri: input.magnetUri,
      category: qbCategory,
    });
  } else if (input.torrentFile) {
    source = DownloadSource.TORRENT_UPLOAD;
    await addTorrentFileToQbittorrent({
      file: input.torrentFile,
      category: qbCategory,
    });
  } else {
    debugWarn("request-service", "Manual download failed because no source was provided", {
      userId: input.userId,
    });
    throw new Error("A magnet URI or torrent file is required.");
  }

  const downloadJob = await prisma.downloadJob.create({
    data: {
      requestId: request.id,
      source,
      status: DownloadStatus.DOWNLOADING,
      qbCategory,
      inputName: titleBasis,
      inputMagnet: input.magnetUri,
      originalFileName: input.torrentFile?.name,
      downloadRoot: getEnv().DOWNLOADS_INCOMING_DIR,
    },
  });

  await prisma.mediaRequest.update({
    where: { id: request.id },
    data: {
      status: RequestStatus.DOWNLOADING,
    },
  });

  debugLog("request-service", "Manual download job created", {
    requestId: request.id,
    downloadJobId: downloadJob.id,
    source,
    qbCategory,
  });
  return downloadJob;
}

export async function syncDownloadJob(downloadJobId: string) {
  debugLog("request-service", "Syncing download job", {
    downloadJobId,
  });
  const downloadJob = await prisma.downloadJob.findUnique({
    where: { id: downloadJobId },
    include: { request: true },
  });

  if (!downloadJob) {
    debugWarn("request-service", "Download sync skipped because job was not found", {
      downloadJobId,
    });
    return null;
  }

  if (
    downloadJob.status === DownloadStatus.CANCELLED ||
    downloadJob.request?.status === RequestStatus.CANCELLED
  ) {
    debugLog("request-service", "Download sync skipped because job or request is cancelled", {
      downloadJobId,
      downloadStatus: downloadJob.status,
      requestStatus: downloadJob.request?.status,
    });
    return downloadJob;
  }

  let torrent = downloadJob.qbTorrentHash
    ? await getQbittorrentTorrent(downloadJob.qbTorrentHash)
    : null;

  if (!torrent && downloadJob.qbCategory) {
    const matchingTorrents = await listQbittorrentTorrents(downloadJob.qbCategory);
    torrent =
      matchingTorrents.find((item) =>
        downloadJob.inputName ? item.name.includes(downloadJob.inputName) : true,
      ) ?? matchingTorrents[0] ?? null;
  }

  if (!torrent) {
    debugWarn("request-service", "Download sync could not find a matching torrent yet", {
      downloadJobId,
      qbCategory: downloadJob.qbCategory,
      qbTorrentHash: downloadJob.qbTorrentHash,
    });
    return downloadJob;
  }

  const completed =
    torrent.progress >= 1 ||
    torrent.state.toLowerCase().includes("upload") ||
    torrent.completion_on > 0;
  const failed = isQbittorrentFailureState(torrent.state);

  if (failed) {
    const errorMessage = `qBittorrent reported torrent state "${torrent.state}".`;
    let failedTorrentRemovalWarning: string | null = null;
    const alternativeCandidateCount = downloadJob.requestId
      ? await prisma.candidateTorrent.count({
          where: {
            requestId: downloadJob.requestId,
            id: downloadJob.candidateId
              ? {
                  not: downloadJob.candidateId,
                }
              : undefined,
            status: {
              in: [CandidateStatus.PENDING, CandidateStatus.APPROVED, CandidateStatus.AUTO_SELECTED],
            },
          },
        })
      : 0;
    const nextRequestStatus =
      alternativeCandidateCount > 0 ? RequestStatus.REVIEW : RequestStatus.REQUESTED;
    const requestReason =
      alternativeCandidateCount > 0
        ? `${errorMessage} Pick another torrent from the review list.`
        : `${errorMessage} Mediapolis will search again automatically.`;

    try {
      await removeQbittorrentTorrents({
        hashes: [torrent.hash],
        deleteFiles: true,
      });
    } catch (error) {
      failedTorrentRemovalWarning =
        error instanceof Error
          ? error.message
          : "Unknown qBittorrent cleanup error for failed torrent.";
      debugWarn("request-service", "Failed to remove errored qBittorrent torrent", {
        downloadJobId,
        requestId: downloadJob.requestId,
        torrentHash: torrent.hash,
        warning: failedTorrentRemovalWarning,
      });
    }

    await prisma.downloadJob.update({
      where: { id: downloadJob.id },
      data: {
        qbTorrentHash: torrent.hash,
        downloadPath: resolveTorrentDownloadPath(torrent),
        bytesDownloaded: BigInt(Math.round(torrent.total_size * torrent.progress)),
        bytesTotal: BigInt(torrent.total_size),
        progress: torrent.progress,
        status: DownloadStatus.FAILED,
        errorMessage: failedTorrentRemovalWarning
          ? `${errorMessage} qBittorrent cleanup warning: ${failedTorrentRemovalWarning}`
          : errorMessage,
        completedAt: new Date(),
      },
    });

    if (downloadJob.requestId) {
      if (downloadJob.candidateId) {
        await prisma.candidateTorrent.update({
          where: { id: downloadJob.candidateId },
          data: {
            status: CandidateStatus.REJECTED,
            reason: errorMessage,
          },
        });
      }

      await prisma.mediaRequest.update({
        where: { id: downloadJob.requestId },
        data: {
          status: nextRequestStatus,
          aiReason: requestReason,
          nextSearchAt: nextRequestStatus === RequestStatus.REQUESTED ? new Date() : null,
        },
      });
    }

    debugWarn("request-service", "Download sync marked torrent as failed and queued recovery", {
      downloadJobId,
      requestId: downloadJob.requestId,
      torrentHash: torrent.hash,
      state: torrent.state,
      progress: torrent.progress,
      nextRequestStatus,
      alternativeCandidateCount,
      failedTorrentRemovalWarning,
    });
    return torrent;
  }

  const existingJobWithHash = await prisma.downloadJob.findFirst({
    where: {
      qbTorrentHash: torrent.hash,
      id: {
        not: downloadJob.id,
      },
    },
  });

  if (existingJobWithHash) {
    debugWarn("request-service", "Cancelling duplicate download job that resolved to an existing torrent", {
      downloadJobId,
      duplicateOfDownloadJobId: existingJobWithHash.id,
      torrentHash: torrent.hash,
    });

    await prisma.downloadJob.update({
      where: { id: downloadJob.id },
      data: {
        status: DownloadStatus.CANCELLED,
        errorMessage: `Duplicate of download job ${existingJobWithHash.id}.`,
        completedAt: new Date(),
      },
    });

    return existingJobWithHash;
  }

  await prisma.downloadJob.update({
    where: { id: downloadJob.id },
    data: {
      qbTorrentHash: torrent.hash,
      downloadPath: resolveTorrentDownloadPath(torrent),
      bytesDownloaded: BigInt(Math.round(torrent.total_size * torrent.progress)),
      bytesTotal: BigInt(torrent.total_size),
      progress: torrent.progress,
      status: completed ? DownloadStatus.ORGANIZING : DownloadStatus.DOWNLOADING,
      completedAt: completed ? new Date() : null,
    },
  });

  if (downloadJob.requestId) {
    await prisma.mediaRequest.update({
      where: { id: downloadJob.requestId },
      data: {
        status: completed ? RequestStatus.ORGANIZING : RequestStatus.DOWNLOADING,
      },
    });
  }

  debugLog("request-service", "Download sync updated torrent progress", {
    downloadJobId,
    requestId: downloadJob.requestId,
    torrentHash: torrent.hash,
    progress: torrent.progress,
    completed,
  });
  return torrent;
}

export async function postProcessDownload(downloadJobId: string) {
  debugLog("request-service", "Post-processing download", {
    downloadJobId,
  });
  const downloadJob = await prisma.downloadJob.findUnique({
    where: { id: downloadJobId },
    include: {
      request: true,
      mediaFiles: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!downloadJob?.request || !downloadJob.downloadPath) {
    debugWarn("request-service", "Post-processing skipped because the download is incomplete", {
      downloadJobId,
    });
    return null;
  }

  if (downloadJob.request.status === RequestStatus.CANCELLED) {
    debugLog("request-service", "Post-processing skipped because request is cancelled", {
      downloadJobId,
      requestId: downloadJob.request.id,
    });
    return null;
  }

  let resolvedDownloadPath = translateHostDownloadPathToContainer(downloadJob.downloadPath);

  if (!(await pathExists(resolvedDownloadPath))) {
    const refreshedTorrent = downloadJob.qbTorrentHash
      ? await getQbittorrentTorrent(downloadJob.qbTorrentHash)
      : null;

    if (refreshedTorrent) {
      resolvedDownloadPath = resolveTorrentDownloadPath(refreshedTorrent);

      if (resolvedDownloadPath !== downloadJob.downloadPath) {
        await prisma.downloadJob.update({
          where: { id: downloadJob.id },
          data: {
            qbTorrentHash: refreshedTorrent.hash,
            downloadPath: resolvedDownloadPath,
          },
        });
      }
    }
  }

  const previewDestination = await resolveDestinationPath({
    title: downloadJob.request.title,
    year: downloadJob.request.year,
    mediaType: downloadJob.request.mediaType,
    sourcePath: resolvedDownloadPath,
  });

  const existingMediaFile = downloadJob.mediaFiles[0] ?? null;
  const destinationAlreadyExists = await pathExists(previewDestination.destinationPath);

  const moved =
    existingMediaFile
      ? {
          sourcePath: existingMediaFile.sourcePath,
          library: existingMediaFile.plexLibrary,
          destinationPath: existingMediaFile.destinationPath,
          seasonNumber: existingMediaFile.seasonNumber,
          episodeNumber: existingMediaFile.episodeNumber,
        }
      : destinationAlreadyExists
        ? previewDestination
        : await moveIntoPlexLibrary({
            title: downloadJob.request.title,
            year: downloadJob.request.year,
            mediaType: downloadJob.request.mediaType,
            sourcePath: resolvedDownloadPath,
          });

  let torrentRemovalWarning: string | null = null;

  try {
    await removeCompletedDownloadTorrent({
      requestId: downloadJob.request.id,
      qbCategory: downloadJob.qbCategory,
      qbTorrentHash: downloadJob.qbTorrentHash,
    });
  } catch (error) {
    torrentRemovalWarning =
      error instanceof Error
        ? error.message
        : "Unknown qBittorrent cleanup error after post-processing.";
    console.warn(
      `Failed to remove qBittorrent torrent for completed download ${downloadJob.id}: ${torrentRemovalWarning}`,
    );
    debugWarn("request-service", "qBittorrent cleanup after post-processing failed", {
      downloadJobId,
      requestId: downloadJob.request.id,
      warning: torrentRemovalWarning,
    });
  }

  if (existingMediaFile) {
    await prisma.mediaFile.update({
      where: { id: existingMediaFile.id },
      data: {
        plexLibrary: moved.library,
        title: downloadJob.request.title,
        year: downloadJob.request.year,
        seasonNumber: moved.seasonNumber ?? undefined,
        episodeNumber: moved.episodeNumber ?? undefined,
        tmdbId: downloadJob.request.tmdbId,
        sourcePath: moved.sourcePath,
        destinationPath: moved.destinationPath,
        status: MediaFileStatus.MOVED,
      },
    });
  } else {
    await prisma.mediaFile.create({
      data: {
        requestId: downloadJob.request.id,
        downloadJobId: downloadJob.id,
        mediaType: downloadJob.request.mediaType,
        plexLibrary: moved.library,
        title: downloadJob.request.title,
        year: downloadJob.request.year,
        seasonNumber: moved.seasonNumber ?? undefined,
        episodeNumber: moved.episodeNumber ?? undefined,
        tmdbId: downloadJob.request.tmdbId,
        sourcePath: moved.sourcePath,
        destinationPath: moved.destinationPath,
        status: MediaFileStatus.MOVED,
      },
    });
  }

  await prisma.downloadJob.update({
    where: { id: downloadJob.id },
    data: {
      status: DownloadStatus.COMPLETED,
      ...(torrentRemovalWarning ? { errorMessage: torrentRemovalWarning } : {}),
    },
  });

  await prisma.mediaRequest.update({
    where: { id: downloadJob.request.id },
    data: {
      status: RequestStatus.COMPLETED,
    },
  });

  debugLog("request-service", "Post-processing completed", {
    downloadJobId,
    requestId: downloadJob.request.id,
    destination: previewDestination.destinationPath,
    torrentRemovalWarning,
  });
  return moved;
}

export async function getDashboardSnapshot() {
  const [requests, downloads, reviewCount, failedCount] = await Promise.all([
    prisma.mediaRequest.count(),
    prisma.downloadJob.count({
      where: { status: DownloadStatus.DOWNLOADING },
    }),
    prisma.mediaRequest.count({
      where: { status: RequestStatus.REVIEW },
    }),
    prisma.mediaRequest.count({
      where: { status: RequestStatus.FAILED },
    }),
  ]);

  return {
    requests,
    downloads,
    reviewCount,
    failedCount,
  };
}

export async function getDownloadFeed() {
  const jobs = await prisma.downloadJob.findMany({
    where: {
      status: {
        in: VISIBLE_DOWNLOAD_FEED_STATUSES,
      },
    },
    orderBy: [{ progress: "desc" }, { updatedAt: "desc" }],
    take: 20,
    include: {
      request: true,
    },
  });

  return jobs
    .map((job) => ({
      id: job.id,
      title: job.request?.title ?? job.inputName ?? "Unknown download",
      status: job.status,
      progress: job.progress ?? 0,
      updatedAt: job.updatedAt.toISOString(),
      path: job.downloadPath,
      errorMessage: job.errorMessage,
    }))
    .sort((left, right) => {
      if (right.progress !== left.progress) {
        return right.progress - left.progress;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}
