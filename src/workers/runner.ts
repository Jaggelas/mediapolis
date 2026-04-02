import { DownloadStatus, RequestStatus } from "@/src/generated/prisma/enums";
import { prisma } from "@/src/lib/db";
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

  for (const request of requests) {
    await searchAndMatchRequest(request.id);
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

  for (const download of downloads) {
    await syncDownloadJob(download.id);
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

  for (const download of downloads) {
    await postProcessDownload(download.id);
  }
}

async function main() {
  let running = false;

  const runCycle = async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      await processPendingSearches();
      await processActiveDownloads();
      await processCompletedDownloads();
    } finally {
      running = false;
    }
  };

  await runCycle();
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
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
