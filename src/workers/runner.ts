import { DownloadStatus, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
import { debugError, debugLog } from "@/src/lib/debug-log";
import { getEnv } from "@/src/lib/env";
import { postProcessDownload, searchAndMatchRequest, syncDownloadJob } from "@/src/lib/request-service";

async function processPendingSearches() {
  const requests = await prisma.mediaRequest.findMany({
    where: {
      status: {
        in: [RequestStatus.REQUESTED, RequestStatus.SEARCHING],
      },
      OR: [{ nextSearchAt: null }, { nextSearchAt: { lte: new Date() } }],
    },
    select: { id: true },
    take: 25,
  });

  debugLog("worker", "Processing pending searches", {
    count: requests.length,
  });

  for (const request of requests) {
    try {
      await searchAndMatchRequest(request.id);
    } catch (error) {
      debugError("worker", "Processing a pending search failed", {
        requestId: request.id,
        error,
      });
    }
  }
}

async function processActiveDownloads() {
  const downloads = await prisma.downloadJob.findMany({
    where: {
      status: DownloadStatus.DOWNLOADING,
      request: {
        isNot: {
          status: RequestStatus.CANCELLED,
        },
      },
    },
    select: { id: true },
    take: 25,
  });

  debugLog("worker", "Processing active downloads", {
    count: downloads.length,
  });

  for (const download of downloads) {
    try {
      await syncDownloadJob(download.id);
    } catch (error) {
      debugError("worker", "Processing an active download failed", {
        downloadJobId: download.id,
        error,
      });
    }
  }
}

async function processCompletedDownloads() {
  const downloads = await prisma.downloadJob.findMany({
    where: {
      status: DownloadStatus.COMPLETED,
      request: {
        is: {
          status: RequestStatus.ORGANIZING,
        },
      },
      mediaFiles: {
        none: {},
      },
    },
    select: { id: true },
    take: 25,
  });

  debugLog("worker", "Processing completed downloads", {
    count: downloads.length,
  });

  for (const download of downloads) {
    try {
      await postProcessDownload(download.id);
    } catch (error) {
      debugError("worker", "Processing a completed download failed", {
        downloadJobId: download.id,
        error,
      });
    }
  }
}

async function main() {
  let running = false;

  const runCycle = async () => {
    if (running) {
      debugLog("worker", "Skipping cycle because the previous one is still running");
      return;
    }

    running = true;
    debugLog("worker", "Starting worker cycle");

    try {
      await processPendingSearches();
      await processActiveDownloads();
      await processCompletedDownloads();
      debugLog("worker", "Worker cycle completed successfully");
    } catch (error) {
      debugError("worker", "Worker cycle failed", error);
    } finally {
      running = false;
    }
  };

  await runCycle();
  debugLog("worker", "Worker started", {
    searchIntervalMinutes: getEnv().SEARCH_INTERVAL_MINUTES,
    pollIntervalSeconds: Math.min(60_000, getEnv().POLL_INTERVAL_SECONDS * 1000) / 1000,
  });
  const interval = setInterval(
    runCycle,
    Math.min(60_000, getEnv().POLL_INTERVAL_SECONDS * 1000),
  );

  const shutdown = async () => {
    clearInterval(interval);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  debugError("worker", "Worker process exited with fatal error", error);
  await prisma.$disconnect();
  process.exit(1);
});
