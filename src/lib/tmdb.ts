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

export type TmdbCatalogResult = {
  tmdbId: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genreIds: number[];
  popularity?: number;
  voteAverage?: number;
};

export type TmdbGenre = {
  id: number;
  name: string;
};

export type TmdbCatalogPage = {
  results: TmdbCatalogResult[];
  page: number;
  totalPages: number;
};

export type TmdbTitleDetails = {
  tmdbId: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres: TmdbGenre[];
  voteAverage?: number;
  runtimeMinutes?: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  status?: string;
  tagline?: string;
  homepage?: string;
};

type TmdbResponse = {
  page?: number;
  total_pages?: number;
  results?: Array<{
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    media_type?: "movie" | "tv" | "person";
    poster_path?: string | null;
    backdrop_path?: string | null;
    genre_ids?: number[];
    popularity?: number;
    vote_average?: number;
  }>;
};

type TmdbGenreResponse = {
  genres?: Array<{
    id: number;
    name: string;
  }>;
};

type TmdbTitleDetailsResponse = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{
    id: number;
    name: string;
  }>;
  vote_average?: number;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  tagline?: string;
  homepage?: string;
};

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

function parseYear(value?: string) {
  const yearValue = Number((value ?? "").slice(0, 4));
  return Number.isFinite(yearValue) ? yearValue : undefined;
}

function buildTmdbImageUrl(size: "w342" | "w780", imagePath?: string | null) {
  if (!imagePath) {
    return undefined;
  }

  return `${TMDB_IMAGE_BASE_URL}/${size}${imagePath}`;
}

function getTmdbMediaPath(mediaType: MediaType) {
  return mediaType === MediaType.MOVIE ? "movie" : "tv";
}

function mapTmdbCatalogResult(
  result: NonNullable<TmdbResponse["results"]>[number],
  fallbackMediaType: MediaType,
) {
  const mediaType =
    result.media_type === "movie"
      ? MediaType.MOVIE
      : result.media_type === "tv"
        ? MediaType.SHOW
        : fallbackMediaType;

  return {
    tmdbId: result.id,
    title: result.title ?? result.name ?? "Untitled",
    year: parseYear(result.release_date ?? result.first_air_date),
    mediaType,
    overview: result.overview,
    posterUrl: buildTmdbImageUrl("w342", result.poster_path),
    backdropUrl: buildTmdbImageUrl("w780", result.backdrop_path),
    genreIds: result.genre_ids ?? [],
    popularity: result.popularity,
    voteAverage: result.vote_average,
  } satisfies TmdbCatalogResult;
}

async function fetchTmdbResponse<TResponse>(path: string, searchParams: URLSearchParams) {
  const env = getEnv();

  if (!env.TMDB_API_KEY) {
    return null;
  }

  searchParams.set("api_key", env.TMDB_API_KEY);

  const response = await fetch(`https://api.themoviedb.org/3/${path}?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as TResponse;
}

export async function getTmdbGenres(mediaType: MediaType) {
  const payload = await fetchTmdbResponse<TmdbGenreResponse>(
    `genre/${getTmdbMediaPath(mediaType)}/list`,
    new URLSearchParams(),
  );

  return (payload?.genres ?? []).sort((left, right) => left.name.localeCompare(right.name));
}

export async function searchTmdbCatalog(input: {
  query: string;
  page?: number;
}) {
  const trimmedQuery = input.query.trim();
  const page = Math.max(1, input.page ?? 1);

  if (trimmedQuery.length <= 1) {
    return {
      results: [],
      page,
      totalPages: 1,
    } satisfies TmdbCatalogPage;
  }

  const searchParams = new URLSearchParams({
    query: trimmedQuery,
    include_adult: "false",
    page: String(page),
  });
  const payload = await fetchTmdbResponse<TmdbResponse>("search/multi", searchParams);

  return {
    results: (payload?.results ?? [])
      .filter((result) => result.media_type === "movie" || result.media_type === "tv")
      .map((result) => mapTmdbCatalogResult(result, MediaType.MOVIE))
      .filter((result) => Boolean(result.title)),
    page: payload?.page ?? page,
    totalPages: Math.max(1, payload?.total_pages ?? 1),
  } satisfies TmdbCatalogPage;
}

export async function discoverTmdbCatalog(input: {
  query?: string;
  mediaType: MediaType;
  year?: number;
  genreId?: number;
  sortBy?: "popularity.desc" | "primary_release_date.desc" | "first_air_date.desc" | "vote_average.desc";
  page?: number;
}) {
  const page = Math.max(1, input.page ?? 1);

  const discoverPath = `discover/${getTmdbMediaPath(input.mediaType)}`;
  const searchParams = new URLSearchParams({
    include_adult: "false",
    sort_by:
      input.sortBy ??
      (input.mediaType === MediaType.MOVIE ? "primary_release_date.desc" : "first_air_date.desc"),
    page: String(page),
  });

  if (input.year) {
    if (input.mediaType === MediaType.MOVIE) {
      searchParams.set("primary_release_year", String(input.year));
    } else {
      searchParams.set("first_air_date_year", String(input.year));
    }
  }

  if (input.genreId) {
    searchParams.set("with_genres", String(input.genreId));
  }

  const payload = await fetchTmdbResponse<TmdbResponse>(discoverPath, searchParams);

  return {
    results: (payload?.results ?? [])
      .map((result) => mapTmdbCatalogResult(result, input.mediaType))
      .filter((result) => Boolean(result.title)),
    page: payload?.page ?? page,
    totalPages: Math.max(1, payload?.total_pages ?? 1),
  } satisfies TmdbCatalogPage;
}

export async function getTmdbTitleDetails(input: {
  tmdbId: number;
  mediaType: MediaType;
}) {
  const payload = await fetchTmdbResponse<TmdbTitleDetailsResponse>(
    `${getTmdbMediaPath(input.mediaType)}/${input.tmdbId}`,
    new URLSearchParams(),
  );

  if (!payload) {
    return null;
  }

  const runtimeMinutes =
    input.mediaType === MediaType.MOVIE
      ? payload.runtime ?? undefined
      : payload.episode_run_time?.find((value) => value > 0) ?? undefined;

  return {
    tmdbId: payload.id,
    title: payload.title ?? payload.name ?? "Untitled",
    year: parseYear(payload.release_date ?? payload.first_air_date),
    mediaType: input.mediaType,
    overview: payload.overview,
    posterUrl: buildTmdbImageUrl("w342", payload.poster_path),
    backdropUrl: buildTmdbImageUrl("w780", payload.backdrop_path),
    genres: (payload.genres ?? []).map((genre) => ({
      id: genre.id,
      name: genre.name,
    })),
    voteAverage: payload.vote_average,
    runtimeMinutes,
    numberOfSeasons: payload.number_of_seasons,
    numberOfEpisodes: payload.number_of_episodes,
    status: payload.status,
    tagline: payload.tagline,
    homepage: payload.homepage,
  } satisfies TmdbTitleDetails;
}

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

  return {
    tmdbId: bestMatch.id,
    title: bestMatch.title ?? bestMatch.name ?? input.title,
    year: parseYear(bestMatch.release_date ?? bestMatch.first_air_date),
    mediaType: input.mediaType,
    overview: bestMatch.overview,
    confidence: scoreTitleOverlap(input.title, resultTitle),
  } satisfies TmdbMatch;
}
