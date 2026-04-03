import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { debugError, debugWarn } from "@/src/lib/debug-log";
import { createBrowseDownload } from "@/src/lib/request-service";
import { getSession } from "@/src/lib/session";

const browseDownloadSchema = z.object({
  title: z.string().trim().min(1),
  mediaType: z.nativeEnum(MediaType),
  year: z.number().int().min(1900).max(2100).optional(),
  tmdbId: z.number().int().positive().optional(),
  preferredResolution: z.enum(["2160p", "1440p", "1080p", "720p", "576p", "480p"]).optional(),
  selectedTorrent: z
    .object({
      title: z.string().trim().min(1),
      magnetUri: z.string().trim().min(1),
      torrentUrl: z.string().trim().url().optional(),
      indexerKey: z.string().trim().min(1).optional(),
      seeders: z.number().int().min(0).optional(),
      peers: z.number().int().min(0).optional(),
      sizeBytes: z.number().int().min(0).optional(),
      resolution: z.string().trim().min(1).optional(),
    })
    .optional(),
});

function getBrowseStatusMessage(status: RequestStatus) {
  switch (status) {
    case RequestStatus.DOWNLOADING:
    case RequestStatus.ORGANIZING:
    case RequestStatus.COMPLETED:
      return "Download started. The app will keep organizing it automatically.";
    case RequestStatus.REVIEW:
      return "A match was found, but it still needs manual review before downloading.";
    case RequestStatus.REQUESTED:
    case RequestStatus.SEARCHING:
      return "The title was added and will keep searching for a usable release.";
    case RequestStatus.MATCHED:
      return "A release was matched and queued for download.";
    case RequestStatus.FAILED:
      return "The title was added, but the initial download attempt failed.";
    case RequestStatus.CANCELLED:
      return "The title was created, but is currently cancelled.";
    default:
      return "The title was added successfully.";
  }
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:browse-download", "Rejected POST /api/browse/download without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const payload = browseDownloadSchema.safeParse(body);

  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid browse download payload.", issues: payload.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createBrowseDownload({
      ...payload.data,
      userId: session.sub,
    });

    if (!created) {
      return NextResponse.json({ error: "The request could not be created." }, { status: 500 });
    }

    return NextResponse.json({
      requestId: created.id,
      status: created.status,
      message: getBrowseStatusMessage(created.status),
    });
  } catch (error) {
    debugError("api:browse-download", "Browse download failed", error);
    return NextResponse.json({ error: "Failed to start the download." }, { status: 500 });
  }
}
