import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType } from "@/src/generated/prisma/enums";
import { debugError, debugWarn } from "@/src/lib/debug-log";
import { searchJackett } from "@/src/lib/jackett";
import { getSession } from "@/src/lib/session";
import { getTmdbTitleDetails } from "@/src/lib/tmdb";
import { buildSearchQuery } from "@/src/lib/title-utils";

const browseDetailsSchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  mediaType: z.nativeEnum(MediaType),
});

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:browse-details", "Rejected GET /api/browse/details without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = browseDetailsSchema.safeParse({
    tmdbId: url.searchParams.get("tmdbId") ?? undefined,
    mediaType: url.searchParams.get("mediaType") ?? undefined,
  });

  if (!params.success) {
    return NextResponse.json({ error: "Invalid browse details request." }, { status: 400 });
  }

  try {
    const details = await getTmdbTitleDetails(params.data);

    if (!details) {
      return NextResponse.json({ error: "Title details not found." }, { status: 404 });
    }

    let torrentAvailability:
      | {
          available: boolean;
          candidateCount: number;
          maxSeeders: number;
          query: string;
          error?: string;
        }
      | undefined;

    const query = buildSearchQuery(details.title, details.year);

    try {
      const candidates = await searchJackett(query, details.mediaType);
      torrentAvailability = {
        available: candidates.length > 0,
        candidateCount: candidates.length,
        maxSeeders: Math.max(0, ...candidates.map((candidate) => candidate.seeders ?? 0)),
        query,
      };
    } catch (availabilityError) {
      const message =
        availabilityError instanceof Error
          ? availabilityError.message
          : "Torrent availability check failed.";
      torrentAvailability = {
        available: false,
        candidateCount: 0,
        maxSeeders: 0,
        query,
        error: message,
      };
    }

    return NextResponse.json({ details: { ...details, torrentAvailability } });
  } catch (error) {
    debugError("api:browse-details", "TMDB browse details lookup failed", error);
    return NextResponse.json({ error: "Failed to load title details." }, { status: 500 });
  }
}
