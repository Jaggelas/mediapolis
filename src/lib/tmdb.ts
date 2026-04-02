import { MediaType } from "@/src/generated/prisma/enums";
import { getEnv } from "@/src/lib/env";
import { buildSearchQuery, normalizeTitle, scoreTitleOverlap } from "@/src/lib/title-utils";

export type TmdbMatch = {
  tmdbId: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  overview?: string;
  confidence: number;
};

type TmdbResponse = {
  results?: Array<{
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    overview?: string;
  }>;
};

export async function resolveTmdbMatch(input: {
  title: string;
  year?: number;
  mediaType: MediaType;
}) {
  const env = getEnv();

  if (!env.TMDB_API_KEY) {
    return null;
  }

  const endpoint =
    input.mediaType === MediaType.MOVIE ? "search/movie" : "search/tv";
  const query = new URLSearchParams({
    api_key: env.TMDB_API_KEY,
    query: buildSearchQuery(input.title, input.year),
  });

  const response = await fetch(`https://api.themoviedb.org/3/${endpoint}?${query.toString()}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as TmdbResponse;
  const bestMatch = payload.results?.[0];

  if (!bestMatch) {
    return null;
  }

  const resultTitle = normalizeTitle(bestMatch.title ?? bestMatch.name ?? input.title);
  const yearValue = Number(
    (bestMatch.release_date ?? bestMatch.first_air_date ?? "").slice(0, 4),
  );

  return {
    tmdbId: bestMatch.id,
    title: bestMatch.title ?? bestMatch.name ?? input.title,
    year: Number.isFinite(yearValue) ? yearValue : undefined,
    mediaType: input.mediaType,
    overview: bestMatch.overview,
    confidence: scoreTitleOverlap(input.title, resultTitle),
  } satisfies TmdbMatch;
}
