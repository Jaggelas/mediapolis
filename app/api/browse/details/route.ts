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

const resolutionMatchers = [
  { label: "2160p", pattern: /\b(?:2160p|4k|uhd)\b/i },
  { label: "1440p", pattern: /\b1440p\b/i },
  { label: "1080p", pattern: /\b1080p\b/i },
  { label: "720p", pattern: /\b720p\b/i },
  { label: "576p", pattern: /\b576p\b/i },
  { label: "480p", pattern: /\b480p\b/i },
] as const;

function getAvailableResolutions(titles: string[]) {
  const resolutions = new Set<string>();

  for (const title of titles) {
    for (const matcher of resolutionMatchers) {
      if (matcher.pattern.test(title)) {
        resolutions.add(matcher.label);
        break;
      }
    }
  }

  return resolutionMatchers
    .map((matcher) => matcher.label)
    .filter((resolution) => resolutions.has(resolution));
}

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
          resolutions: string[];
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
        resolutions: getAvailableResolutions(candidates.map((candidate) => candidate.title)),
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
        resolutions: [],
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
