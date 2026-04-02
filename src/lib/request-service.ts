import path from "node:path";
import { CandidateStatus, DownloadSource, DownloadStatus, MediaFileStatus, MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { getEnv } from "@/src/lib/env";
import { createAuditLog } from "@/src/lib/audit-log";
import { scoreCandidateWithAi } from "@/src/lib/ai-matcher";
import { searchJackett } from "@/src/lib/jackett";
import { buildDestinationPath, moveIntoPlexLibrary } from "@/src/lib/media-organizer";
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
};

function inferMediaTypeFromName(input: string) {
  return inferEpisode(input) ? MediaType.SHOW : MediaType.MOVIE;
}

function buildQbCategory(requestId: string) {
  return `request-${requestId}`;
}

async function removeRequestTorrents(requestId: string) {
  const qbCategory = buildQbCategory(requestId);
  const torrents = await listQbittorrentTorrents(qbCategory);
  const hashes = torrents.map((torrent) => torrent.hash);

  if (hashes.length > 0) {
    await removeQbittorrentTorrents({
      hashes,
      deleteFiles: true,
    });
  }
}

async function startCandidateDownload(requestId: string, candidateId: string) {
  const candidate = await prisma.candidateTorrent.findUnique({
    where: { id: candidateId },
    include: { request: true },
  });

  if (!candidate) {
    throw new Error("Candidate not found.");
  }

  if (!candidate.magnetUri) {
    throw new Error("This candidate does not expose a magnet URI for automated download.");
  }

  const qbCategory = buildQbCategory(requestId);

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
      status: CandidateStatus.AUTO_SELECTED,
    },
  });

  await prisma.mediaRequest.update({
    where: { id: requestId },
    data: {
      status: RequestStatus.DOWNLOADING,
    },
  });

  return downloadJob;
}

export async function createMediaRequest(input: CreateRequestInput) {
  const normalizedTitle = normalizeTitle(input.title);
  const tmdbMatch = await resolveTmdbMatch({
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
      aiConfidence: tmdbMatch?.confidence,
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

  return request;
}

export async function searchAndMatchRequest(requestId: string) {
  const env = getEnv();
  const request = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    include: {
      requestedBy: true,
    },
  });

  if (!request) {
    return null;
  }

  if (request.status === RequestStatus.CANCELLED || request.status === RequestStatus.COMPLETED) {
    return request;
  }

  await prisma.mediaRequest.update({
    where: { id: request.id },
    data: {
      status: RequestStatus.SEARCHING,
      lastSearchedAt: new Date(),
      nextSearchAt: new Date(Date.now() + env.SEARCH_INTERVAL_MINUTES * 60 * 1000),
    },
  });

  const candidates = await searchJackett(request.searchQuery ?? request.title, request.mediaType);

  if (candidates.length === 0) {
    return request;
  }

  await prisma.candidateTorrent.deleteMany({
    where: { requestId: request.id, status: CandidateStatus.PENDING },
  });

  const scoredCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      const score = await scoreCandidateWithAi(
        {
          title: request.title,
          year: request.year,
          mediaType: request.mediaType,
        },
        candidate,
      );

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
      aiReason: bestCandidate.reason,
    },
  });

  if (nextStatus === RequestStatus.MATCHED) {
    await startCandidateDownload(request.id, bestCandidate.id);
  }

  return request;
}

export async function approveCandidate(candidateId: string, userId: string) {
  const candidate = await prisma.candidateTorrent.findUnique({
    where: { id: candidateId },
    include: { request: true },
  });

  if (!candidate?.requestId) {
    throw new Error("Candidate not found.");
  }

  if (
    candidate.request?.status === RequestStatus.CANCELLED ||
    candidate.request?.status === RequestStatus.COMPLETED
  ) {
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

  return startCandidateDownload(candidate.requestId, candidateId);
}

export async function cancelMediaRequest(requestId: string, userId: string) {
  const request = await prisma.mediaRequest.findUnique({
    where: { id: requestId },
    include: {
      downloads: true,
      candidates: true,
    },
  });

  if (!request) {
    throw new Error("Request not found.");
  }

  if (request.status === RequestStatus.COMPLETED) {
    throw new Error("Completed requests cannot be cancelled.");
  }

  if (request.status === RequestStatus.CANCELLED) {
    return request;
  }

  let torrentCleanupWarning: string | null = null;

  try {
    await removeRequestTorrents(request.id);
  } catch (error) {
    torrentCleanupWarning =
      error instanceof Error
        ? error.message
        : "Unknown qBittorrent cleanup error during cancellation.";
    console.warn(
      `Failed to remove qBittorrent torrents for request ${request.id}: ${torrentCleanupWarning}`,
    );
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

  return prisma.mediaRequest.findUnique({
    where: { id: request.id },
  });
}

export async function createManualDownload(input: {
  userId: string;
  magnetUri?: string;
  torrentFile?: File;
  fileName?: string;
  requestTitle?: string;
  mediaType?: MediaType;
}) {
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

  return downloadJob;
}

export async function syncDownloadJob(downloadJobId: string) {
  const downloadJob = await prisma.downloadJob.findUnique({
    where: { id: downloadJobId },
    include: { request: true },
  });

  if (!downloadJob) {
    return null;
  }

  if (
    downloadJob.status === DownloadStatus.CANCELLED ||
    downloadJob.request?.status === RequestStatus.CANCELLED
  ) {
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
    return downloadJob;
  }

  const completed =
    torrent.progress >= 1 ||
    torrent.state.toLowerCase().includes("upload") ||
    torrent.completion_on > 0;

  await prisma.downloadJob.update({
    where: { id: downloadJob.id },
    data: {
      qbTorrentHash: torrent.hash,
      downloadPath: path.join(torrent.save_path, torrent.name),
      bytesDownloaded: BigInt(Math.round(torrent.total_size * torrent.progress)),
      bytesTotal: BigInt(torrent.total_size),
      progress: torrent.progress,
      status: completed ? DownloadStatus.COMPLETED : DownloadStatus.DOWNLOADING,
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

  return torrent;
}

export async function postProcessDownload(downloadJobId: string) {
  const downloadJob = await prisma.downloadJob.findUnique({
    where: { id: downloadJobId },
    include: {
      request: true,
    },
  });

  if (!downloadJob?.request || !downloadJob.downloadPath) {
    return null;
  }

  if (downloadJob.request.status === RequestStatus.CANCELLED) {
    return null;
  }

  const previewDestination = buildDestinationPath({
    title: downloadJob.request.title,
    year: downloadJob.request.year,
    mediaType: downloadJob.request.mediaType,
    sourcePath: downloadJob.downloadPath,
  });

  const moved = await moveIntoPlexLibrary({
    title: downloadJob.request.title,
    year: downloadJob.request.year,
    mediaType: downloadJob.request.mediaType,
    sourcePath: downloadJob.downloadPath,
  });

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
      sourcePath: downloadJob.downloadPath,
      destinationPath: previewDestination.destinationPath,
      status: MediaFileStatus.MOVED,
    },
  });

  await prisma.downloadJob.update({
    where: { id: downloadJob.id },
    data: {
      status: DownloadStatus.COMPLETED,
    },
  });

  await prisma.mediaRequest.update({
    where: { id: downloadJob.request.id },
    data: {
      status: RequestStatus.COMPLETED,
    },
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
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      request: true,
    },
  });

  return jobs.map((job) => ({
    id: job.id,
    title: job.request?.title ?? job.inputName ?? "Unknown download",
    status: job.status,
    progress: job.progress ?? 0,
    updatedAt: job.updatedAt.toISOString(),
    path: job.downloadPath,
  }));
}
