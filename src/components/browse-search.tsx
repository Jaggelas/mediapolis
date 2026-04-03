"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle, Search, X } from "lucide-react";
import { MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { debugError, debugLog } from "@/src/lib/debug-log";
import { cn, formatBytes } from "@/src/lib/utils";

type BrowseResult = {
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

type BrowseGenre = {
  id: number;
  name: string;
};

type SearchResponse = {
  results?: BrowseResult[];
  page?: number;
  totalPages?: number;
  error?: string;
};

type BrowseDetails = {
  tmdbId: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres: BrowseGenre[];
  voteAverage?: number;
  runtimeMinutes?: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  status?: string;
  tagline?: string;
  homepage?: string;
  torrentAvailability?: {
    available: boolean;
    candidateCount: number;
    maxSeeders: number;
    resolutions: string[];
    topTorrents: Array<{
      title: string;
      magnetUri?: string;
      torrentUrl?: string;
      indexerKey?: string;
      seeders?: number;
      peers?: number;
      sizeBytes?: number;
      resolution?: string;
    }>;
    query: string;
    error?: string;
  };
};

type GenreResponse = {
  genres?: BrowseGenre[];
  error?: string;
};

type BrowseDetailsResponse = {
  details?: BrowseDetails;
  error?: string;
};

type DownloadResponse = {
  status?: RequestStatus;
  message?: string;
  error?: string;
};

const resolutionOptions = ["2160p", "1440p", "1080p", "720p", "576p", "480p"] as const;
type ResolutionOption = (typeof resolutionOptions)[number];
type ResolutionSelection = ResolutionOption | "ANY";

const typeLabel: Record<MediaType, string> = {
  [MediaType.MOVIE]: "Movie",
  [MediaType.SHOW]: "TV Series",
};

const sortOptions = [
  { value: "popular", label: "Most popular" },
  { value: "latest", label: "Newest first" },
  { value: "rating", label: "Highest rated" },
] as const;

type SortMode = (typeof sortOptions)[number]["value"];

export function BrowseSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>(MediaType.MOVIE);
  const [genres, setGenres] = useState<BrowseGenre[]>([]);
  const [genreLookup, setGenreLookup] = useState<Record<MediaType, Record<number, string>>>({
    [MediaType.MOVIE]: {},
    [MediaType.SHOW]: {},
  });
  const [genreId, setGenreId] = useState("");
  const [year, setYear] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("popular");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<BrowseResult[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genresLoading, setGenresLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const latestSearchRequestId = useRef(0);
  const [selectedResult, setSelectedResult] = useState<BrowseResult | null>(null);
  const [details, setDetails] = useState<BrowseDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [preferredResolution, setPreferredResolution] = useState<ResolutionSelection>("ANY");

  const trimmedQuery = query.trim();
  const hasShortQuery = trimmedQuery.length === 1;
  const isTitleSearch = trimmedQuery.length >= 2;

  const resolvedSortBy = useMemo(() => {
    if (sortMode === "rating") {
      return "vote_average.desc";
    }

    if (sortMode === "latest") {
      return mediaType === MediaType.MOVIE
        ? "primary_release_date.desc"
        : "first_air_date.desc";
    }

    return "popularity.desc";
  }, [mediaType, sortMode]);

  const emptyState = useMemo(() => {
    if (loading) {
      return "Searching TMDB...";
    }

    if (error) {
      return error;
    }

    if (hasShortQuery) {
      return "Type at least 2 characters to search by title.";
    }

    if (!trimmedQuery && !genreId && !year) {
      return "Popular titles for the selected media type will appear here automatically.";
    }

    return "No results yet. Try a different genre, year, or title.";
  }, [error, genreId, hasShortQuery, loading, trimmedQuery, year]);

  const activeGenreName = useMemo(
    () => genres.find((genre) => String(genre.id) === genreId)?.name ?? null,
    [genreId, genres],
  );
  const showDetailsSkeleton = detailsLoading && !details && !detailsError;

  const getResultGenres = useMemo(
    () => (result: BrowseResult) =>
      result.genreIds
        .map((id) => genreLookup[result.mediaType][id])
        .filter((name): name is string => Boolean(name))
        .slice(0, 3),
    [genreLookup],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function fetchGenresFor(nextMediaType: MediaType) {
      const searchParams = new URLSearchParams({ mediaType: nextMediaType });
      const response = await fetch(`/api/browse/genres?${searchParams.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as GenreResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load genres.");
      }

      return payload?.genres ?? [];
    }

    async function loadGenres() {
      setGenresLoading(true);

      try {
        const [movieGenres, showGenres] = await Promise.all([
          fetchGenresFor(MediaType.MOVIE),
          fetchGenresFor(MediaType.SHOW),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setGenreLookup({
          [MediaType.MOVIE]: Object.fromEntries(movieGenres.map((genre) => [genre.id, genre.name])),
          [MediaType.SHOW]: Object.fromEntries(showGenres.map((genre) => [genre.id, genre.name])),
        });
        setGenres(mediaType === MediaType.MOVIE ? movieGenres : showGenres);
      } catch (genreError) {
        if (!controller.signal.aborted) {
          debugError("browse-search", "Genre lookup failed", genreError);
          setGenres([]);
          setGenreLookup({
            [MediaType.MOVIE]: {},
            [MediaType.SHOW]: {},
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setGenresLoading(false);
        }
      }
    }

    void loadGenres();

    return () => {
      controller.abort();
    };
  }, [mediaType]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = latestSearchRequestId.current + 1;
    latestSearchRequestId.current = requestId;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const searchParams = new URLSearchParams({ page: String(page) });

        if (trimmedQuery) {
          searchParams.set("q", trimmedQuery);
        } else {
          searchParams.set("mediaType", mediaType);
          searchParams.set("sortBy", resolvedSortBy);

          if (year.trim()) {
            searchParams.set("year", year.trim());
          }

          if (genreId) {
            searchParams.set("genreId", genreId);
          }
        }

        const response = await fetch(`/api/browse/search?${searchParams.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as SearchResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Search failed.");
        }

        if (controller.signal.aborted || requestId !== latestSearchRequestId.current) {
          return;
        }

        debugLog("browse-search", "Browse search completed", {
          query: trimmedQuery,
          mediaType: trimmedQuery ? "ALL" : mediaType,
          genreId: trimmedQuery ? null : genreId || null,
          year: trimmedQuery ? null : year || null,
          sortBy: trimmedQuery ? "RELEVANCE" : resolvedSortBy,
          page,
          count: payload?.results?.length ?? 0,
        });
        setResults(payload?.results ?? []);
        setTotalPages(Math.max(1, payload?.totalPages ?? 1));
      } catch (searchError) {
        if (controller.signal.aborted || requestId !== latestSearchRequestId.current) {
          return;
        }

        const message =
          searchError instanceof Error ? searchError.message : "Unexpected browse search error.";
        debugError("browse-search", "Browse search failed", searchError);
        setResults([]);
        setTotalPages(1);
        setError(message);
      } finally {
        if (!controller.signal.aborted && requestId === latestSearchRequestId.current) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [genreId, mediaType, page, resolvedSortBy, trimmedQuery, year]);

  useEffect(() => {
    if (!selectedResult) {
      setDetails(null);
      setDetailsError("");
      setDetailsLoading(false);
      return;
    }

    const currentSelectedResult = selectedResult;
    const controller = new AbortController();

    async function loadDetails() {
      setDetailsLoading(true);
      setDetailsError("");
      setDetails(null);

      try {
        const searchParams = new URLSearchParams({
          tmdbId: String(currentSelectedResult.tmdbId),
          mediaType: currentSelectedResult.mediaType,
        });
        const response = await fetch(`/api/browse/details?${searchParams.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as BrowseDetailsResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load title details.");
        }

        if (!controller.signal.aborted) {
          setDetails(payload?.details ?? null);
        }
      } catch (detailsFetchError) {
        if (!controller.signal.aborted) {
          const message =
            detailsFetchError instanceof Error
              ? detailsFetchError.message
              : "Unexpected title details error.";
          setDetailsError(message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      controller.abort();
    };
  }, [selectedResult]);

  useEffect(() => {
    if (!selectedResult) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedResult(null);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedResult]);

  useEffect(() => {
    if (!details?.torrentAvailability || preferredResolution === "ANY") {
      return;
    }

    const availableResolutions = details.torrentAvailability.resolutions;
    if (!availableResolutions.includes(preferredResolution)) {
      setPreferredResolution("ANY");
    }
  }, [details, preferredResolution]);

  function openDetails(result: BrowseResult) {
    setSelectedResult(result);
    setPreferredResolution("ANY");
  }

  function closeDetails() {
    setSelectedResult(null);
    setPreferredResolution("ANY");
  }

  function formatRuntime(minutes?: number) {
    if (!minutes) {
      return null;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      return `${remainingMinutes}m`;
    }

    if (remainingMinutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes}m`;
  }

  async function handleDownload(result: BrowseResult, resolutionPreference?: ResolutionOption) {
    setDownloadingId(result.tmdbId);
    setFeedback("");
    setError("");

    debugLog("browse-search", "Starting browse download", {
      tmdbId: result.tmdbId,
      title: result.title,
      mediaType: result.mediaType,
      year: result.year ?? null,
      preferredResolution: resolutionPreference ?? null,
    });

    try {
      const response = await fetch("/api/browse/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tmdbId: result.tmdbId,
          title: result.title,
          year: result.year,
          mediaType: result.mediaType,
          preferredResolution: resolutionPreference,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DownloadResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to start download.");
      }

      setFeedback(payload?.message ?? `${result.title} was added successfully.`);
      router.refresh();
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : "Unexpected download error.";
      debugError("browse-search", "Browse download failed", downloadError);
      setError(message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleCandidateDownload(
    result: BrowseResult,
    candidate: NonNullable<BrowseDetails["torrentAvailability"]>["topTorrents"][number],
  ) {
    if (!candidate.magnetUri) {
      setError("This torrent does not expose a magnet link for direct download.");
      return;
    }

    setDownloadingId(result.tmdbId);
    setFeedback("");
    setError("");

    try {
      const response = await fetch("/api/browse/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tmdbId: result.tmdbId,
          title: result.title,
          year: result.year,
          mediaType: result.mediaType,
          selectedTorrent: {
            title: candidate.title,
            magnetUri: candidate.magnetUri,
            torrentUrl: candidate.torrentUrl,
            indexerKey: candidate.indexerKey,
            seeders: candidate.seeders,
            peers: candidate.peers,
            sizeBytes: candidate.sizeBytes,
            resolution: candidate.resolution,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as DownloadResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to start selected torrent.");
      }

      setFeedback(payload?.message ?? "Selected torrent was added successfully.");
      router.refresh();
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : "Unexpected selected torrent error.";
      debugError("browse-search", "Selected browse torrent download failed", downloadError);
      setError(message);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-4xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_38%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.86))] p-5 shadow-[0_30px_90px_rgba(2,6,23,0.34)] backdrop-blur-2xl sm:p-6 lg:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent)]" />
        <div className="pointer-events-none absolute -right-18 top-10 h-44 w-44 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-indigo-500/12 blur-3xl" />

        <div className="relative grid gap-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] xl:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-emerald-300">
                Discover Surface
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Browse, search, and launch downloads beautifully
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                Use the page like a premium streaming catalog: browse by genre, year, and freshness, or
                jump straight into a title search that spans both movies and shows.
              </p>
            </div>

            <div className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-white/6 p-4 shadow-inner shadow-black/10 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Mode
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {isTitleSearch ? "Global title search" : `${typeLabel[mediaType]} discovery`}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Results
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {results.length} visible on page {page}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Context
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {isTitleSearch ? "Filters suspended" : activeGenreName ?? "Open catalog"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_repeat(4,minmax(0,0.78fr))]">
              <label className="grid gap-2 text-sm text-slate-300 xl:col-span-1">
                Search titles
                <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 shadow-[0_10px_24px_rgba(2,6,23,0.12)]">
                  <Search className="h-4 w-4 shrink-0 text-sky-300" />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder={`Search for a ${mediaType === MediaType.MOVIE ? "movie" : "TV series"}`}
                    className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Type
                <select
                  value={mediaType}
                  onChange={(event) => {
                    setMediaType(event.target.value as MediaType);
                    setGenreId("");
                    setPage(1);
                  }}
                  className="min-h-14 rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none"
                >
                  <option value={MediaType.MOVIE}>Movie</option>
                  <option value={MediaType.SHOW}>TV Series</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Genre
                <select
                  value={genreId}
                  onChange={(event) => {
                    setGenreId(event.target.value);
                    setPage(1);
                  }}
                  className="min-h-14 rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none"
                >
                  <option value="">{genresLoading ? "Loading genres..." : "All genres"}</option>
                  {genres.map((genre) => (
                    <option key={genre.id} value={String(genre.id)}>
                      {genre.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Year
                <input
                  value={year}
                  onChange={(event) => {
                    setYear(event.target.value.replace(/[^\d]/g, "").slice(0, 4));
                    setPage(1);
                  }}
                  placeholder="Any year"
                  inputMode="numeric"
                  className="min-h-14 rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                Sort
                <select
                  value={sortMode}
                  onChange={(event) => {
                    setSortMode(event.target.value as SortMode);
                    setPage(1);
                  }}
                  className="min-h-14 rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-300">
                {results.length} result{results.length === 1 ? "" : "s"}
              </div>
              <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-300">
                {isTitleSearch ? "All title matches" : `${typeLabel[mediaType]} catalog`}
              </div>
              <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-300">
                Page {page} of {totalPages}
              </div>
              {isTitleSearch ? (
                <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs font-medium text-sky-100">
                  Title search ignores genre, year, and type
                </div>
              ) : null}
              {hasShortQuery ? (
                <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100">
                  Type at least 2 characters
                </div>
              ) : null}
              {(genreId || year || trimmedQuery || sortMode !== "popular") ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGenreId("");
                    setYear("");
                    setSortMode("popular");
                    setPage(1);
                  }}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                >
                  Reset view
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>
                {isTitleSearch
                  ? "Search spans both movies and TV series with relevance-first matching."
                  : "Browse by genre, year, and sort order to discover something new."}
              </span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
              <span>Downloads still flow into the same automated request and organization pipeline.</span>
            </div>

            {feedback ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {feedback}
              </div>
            ) : null}
            {error && !loading ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-4xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.2)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Results
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {isTitleSearch ? "Matching titles" : "Curated discovery grid"}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {isTitleSearch
                ? "Exact title lookup is prioritized here so the right movie or show appears fast."
                : "Explore the catalog like a premium showcase, then launch the item you want straight into Mediapolis."}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {loading ? "Refreshing" : "Ready"}
          </div>
        </div>

        {results.length === 0 ? (
          <div className="mt-6 rounded-[1.75rem] border border-dashed border-white/10 bg-slate-950/20 px-6 py-12 text-center text-sm text-slate-400">
            {emptyState}
          </div>
        ) : (
          <div className="mt-6 grid gap-6">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {results.map((result) => {
                const isDownloading = downloadingId === result.tmdbId;
                const resultGenres = getResultGenres(result);

                return (
                  <article
                    key={`${result.mediaType}-${result.tmdbId}`}
                    className="group cursor-pointer overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.72))] shadow-[0_18px_50px_rgba(2,6,23,0.18)] transition duration-300 hover:-translate-y-1 hover:border-white/18 hover:shadow-[0_26px_70px_rgba(2,6,23,0.28)]"
                    onClick={() => openDetails(result)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetails(result);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="grid gap-0 sm:grid-cols-[132px_minmax(0,1fr)]">
                      <div className="relative aspect-2/3 w-full overflow-hidden border-b border-white/10 bg-slate-950/90 sm:aspect-auto sm:h-full sm:min-h-0 sm:border-b-0 sm:border-r">
                        {result.posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={result.posterUrl}
                            alt={`${result.title} poster`}
                            className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full min-h-48 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_55%)] px-4 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 sm:min-h-0">
                            No poster
                          </div>
                        )}
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-[42%] min-h-14 bg-linear-to-t from-[rgb(15,23,42)] via-[rgb(15,23,42)]/45 to-transparent sm:h-[36%] sm:min-h-20 sm:from-[rgb(2,6,23)] sm:via-[rgb(15,23,42)]/40"
                        />
                      </div>

                      <div className="flex min-w-0 flex-col p-4 sm:p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                              result.mediaType === MediaType.MOVIE
                                ? "border border-sky-400/20 bg-sky-400/10 text-sky-200"
                                : "border border-violet-400/20 bg-violet-400/10 text-violet-200",
                            )}
                          >
                            {typeLabel[result.mediaType]}
                          </span>
                          {result.year ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                              {result.year}
                            </span>
                          ) : null}
                          {typeof result.voteAverage === "number" && result.voteAverage > 0 ? (
                            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                              {result.voteAverage.toFixed(1)}
                            </span>
                          ) : null}
                        </div>

                        <h4 className="mt-3 text-lg font-semibold leading-tight tracking-tight text-white sm:text-xl">
                          {result.title}
                        </h4>
                        {resultGenres.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {resultGenres.map((genreName) => (
                              <span
                                key={`${result.tmdbId}-${genreName}`}
                                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300"
                              >
                                {genreName}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-3 line-clamp-5 text-sm leading-6 text-slate-400">
                          {result.overview || "No overview available for this title."}
                        </p>

                        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDownload(result);
                            }}
                            disabled={isDownloading}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            {isDownloading ? "Starting..." : "Download"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/30 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Catalog pagination</div>
                  <p className="mt-1 text-sm text-slate-400">
                    Move through additional pages to keep exploring new arrivals and deeper catalog matches.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                    disabled={loading || page <= 1}
                    className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-center text-sm font-medium text-slate-300">
                    Page {page} of {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                    disabled={loading || page >= totalPages}
                    className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {selectedResult ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/78 px-2 py-2 backdrop-blur-md sm:items-center sm:p-4"
          onClick={closeDetails}
        >
          <div
            className="relative max-h-[94vh] w-full max-w-[min(96vw,1440px)] overflow-hidden rounded-4xl border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] shadow-[0_35px_120px_rgba(2,6,23,0.5)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeDetails}
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-slate-950/60 text-slate-200 transition hover:bg-slate-900"
              aria-label="Close details"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="max-h-[94vh] overflow-y-auto">
              <div className="relative h-40 overflow-hidden border-b border-white/10 sm:h-52 lg:h-64">
                {(details?.backdropUrl ?? selectedResult.backdropUrl ?? details?.posterUrl ?? selectedResult.posterUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      details?.backdropUrl ??
                      selectedResult.backdropUrl ??
                      details?.posterUrl ??
                      selectedResult.posterUrl
                    }
                    alt={`${selectedResult.title} backdrop`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_55%)]" />
                )}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.88))]" />
              </div>

              <div className="relative grid gap-5 p-4 sm:p-5 xl:grid-cols-[300px_minmax(0,1fr)] xl:gap-8 xl:px-8 xl:pb-7 xl:pt-0 2xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="mx-auto -mt-14 w-full max-w-48 sm:-mt-16 sm:max-w-52 xl:mx-0 xl:max-w-none">
                  <div className="overflow-hidden rounded-[1.6rem] border border-white/12 bg-slate-900 shadow-[0_20px_60px_rgba(2,6,23,0.4)]">
                    {(details?.posterUrl ?? selectedResult.posterUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={details?.posterUrl ?? selectedResult.posterUrl}
                        alt={`${selectedResult.title} poster`}
                        className="aspect-2/3 w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-2/3 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_55%)] px-4 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        No poster
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        selectedResult.mediaType === MediaType.MOVIE
                          ? "border border-sky-400/20 bg-sky-400/10 text-sky-200"
                          : "border border-violet-400/20 bg-violet-400/10 text-violet-200",
                      )}
                    >
                      {typeLabel[selectedResult.mediaType]}
                    </span>
                    {(details?.year ?? selectedResult.year) ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {details?.year ?? selectedResult.year}
                      </span>
                    ) : null}
                    {typeof details?.voteAverage === "number" && details.voteAverage > 0 ? (
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                        {details.voteAverage.toFixed(1)} rating
                      </span>
                    ) : null}
                    {details?.status ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {details.status}
                      </span>
                    ) : null}
                  </div>

                  <h4 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                    {details?.title ?? selectedResult.title}
                  </h4>
                  {showDetailsSkeleton ? (
                    <div className="mt-4 h-5 w-3/4 animate-pulse rounded-full bg-white/10" />
                  ) : details?.tagline ? (
                    <p className="mt-3 text-base italic text-slate-300">{details.tagline}</p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {showDetailsSkeleton
                      ? Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={`genre-skeleton-${index}`}
                            className="h-8 w-20 animate-pulse rounded-full border border-white/8 bg-white/8"
                          />
                        ))
                      : (details?.genres ?? []).map((genre) => (
                          <span
                            key={genre.id}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200"
                          >
                            {genre.name}
                          </span>
                        ))}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {showDetailsSkeleton ? (
                      <>
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={`meta-skeleton-${index}`}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <div className="h-3 w-16 animate-pulse rounded-full bg-white/10" />
                            <div className="mt-3 h-4 w-24 animate-pulse rounded-full bg-white/10" />
                          </div>
                        ))}
                      </>
                    ) : formatRuntime(details?.runtimeMinutes) ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Runtime
                        </div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {formatRuntime(details?.runtimeMinutes)}
                        </div>
                      </div>
                    ) : null}
                    {details?.numberOfSeasons ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Seasons
                        </div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {details.numberOfSeasons}
                        </div>
                      </div>
                    ) : null}
                    {details?.numberOfEpisodes ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Episodes
                        </div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {details.numberOfEpisodes}
                        </div>
                      </div>
                    ) : null}
                    {details?.homepage ? (
                      <a
                        href={details.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Homepage
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-white">
                          Open site
                          <ExternalLink className="h-3.5 w-3.5" />
                        </div>
                      </a>
                    ) : null}
                    {details?.torrentAvailability ? (
                      <div
                        className={cn(
                          "rounded-2xl border px-4 py-3",
                          details.torrentAvailability.error
                            ? "border-amber-300/20 bg-amber-300/10"
                            : details.torrentAvailability.available
                              ? "border-emerald-300/20 bg-emerald-300/10"
                              : "border-white/10 bg-white/5",
                        )}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Torrents
                        </div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {details.torrentAvailability.error
                            ? "Check failed"
                            : details.torrentAvailability.available
                              ? `${details.torrentAvailability.candidateCount} available`
                              : "None found"}
                        </div>
                        {!details.torrentAvailability.error &&
                        details.torrentAvailability.available &&
                        details.torrentAvailability.maxSeeders > 0 ? (
                          <div className="mt-1 text-xs text-slate-300">
                            Up to {details.torrentAvailability.maxSeeders} seeders
                          </div>
                        ) : null}
                        {!details.torrentAvailability.error &&
                        details.torrentAvailability.resolutions.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {details.torrentAvailability.resolutions.map((resolution) => (
                              <span
                                key={resolution}
                                className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200"
                              >
                                {resolution}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                    {showDetailsSkeleton ? (
                      <div className="grid gap-3 animate-pulse">
                        <div className="h-4 w-11/12 rounded-full bg-white/8" />
                        <div className="h-4 w-full rounded-full bg-white/8" />
                        <div className="h-4 w-10/12 rounded-full bg-white/8" />
                        <div className="h-4 w-9/12 rounded-full bg-white/8" />
                      </div>
                    ) : detailsError ? (
                      <div className="text-sm text-rose-200">{detailsError}</div>
                    ) : (
                      <p className="text-sm leading-7 text-slate-300">
                        {details?.overview ??
                          selectedResult.overview ??
                          "No overview available for this title."}
                      </p>
                    )}
                  </div>

                  {showDetailsSkeleton ? (
                    <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                      <div className="animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-28 rounded-full bg-white/8" />
                          <div className="h-7 w-36 rounded-full bg-white/8" />
                        </div>
                        <div className="mt-4 grid gap-3">
                          <div className="h-4 w-full rounded-full bg-white/8" />
                          <div className="h-4 w-8/12 rounded-full bg-white/8" />
                          <div className="h-3 w-6/12 rounded-full bg-white/8" />
                        </div>
                      </div>
                    </div>
                  ) : details?.torrentAvailability ? (
                    <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Availability check
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                            details.torrentAvailability.error
                              ? "border border-amber-300/20 bg-amber-300/10 text-amber-100"
                              : details.torrentAvailability.available
                                ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                                : "border border-white/10 bg-white/5 text-slate-300",
                          )}
                        >
                          {details.torrentAvailability.error
                            ? "Unavailable to verify"
                            : details.torrentAvailability.available
                              ? "Torrents available"
                              : "No torrents found"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {details.torrentAvailability.error
                          ? details.torrentAvailability.error
                          : details.torrentAvailability.available
                            ? `Mediapolis found ${details.torrentAvailability.candidateCount} torrent result${details.torrentAvailability.candidateCount === 1 ? "" : "s"} for this title right now.`
                            : "Mediapolis did not find any torrent results for this title at the moment."}
                      </p>
                      {!details.torrentAvailability.error &&
                      details.torrentAvailability.resolutions.length > 0 ? (
                        <div className="mt-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Resolutions available
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {details.torrentAvailability.resolutions.map((resolution) => (
                              <span
                                key={resolution}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200"
                              >
                                {resolution}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <label className="mt-4 grid gap-2 text-sm text-slate-300">
                        Preferred resolution
                        <select
                          value={preferredResolution}
                          onChange={(event) =>
                            setPreferredResolution(event.target.value as ResolutionSelection)
                          }
                          className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-2.5 text-sm text-white outline-none"
                        >
                          <option value="ANY">Best available (any resolution)</option>
                          {resolutionOptions.map((resolution) => (
                            <option
                              key={resolution}
                              value={resolution}
                              disabled={
                                !details?.torrentAvailability?.error &&
                                Boolean(details?.torrentAvailability?.available) &&
                                !details?.torrentAvailability?.resolutions.includes(resolution)
                              }
                            >
                              {resolution}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Query used: {details.torrentAvailability.query}
                      </p>

                      {details.torrentAvailability.topTorrents.length > 0 ? (
                        <div className="mt-5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Top torrents (click to download)
                          </div>
                          <div className="mt-3 grid gap-2">
                            {details.torrentAvailability.topTorrents.map((torrent, index) => (
                              <button
                                key={`${torrent.title}-${index}`}
                                type="button"
                                onClick={() => handleCandidateDownload(selectedResult, torrent)}
                                disabled={downloadingId === selectedResult.tmdbId || !torrent.magnetUri}
                                className="group rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  {torrent.resolution ? (
                                    <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                                      {torrent.resolution}
                                    </span>
                                  ) : null}
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                                    {torrent.seeders ?? 0} seeders
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                                    {formatBytes(torrent.sizeBytes)}
                                  </span>
                                  {!torrent.magnetUri ? (
                                    <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                                      No magnet
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2 line-clamp-2 text-sm font-medium text-white">
                                  {torrent.title}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(
                          selectedResult,
                          preferredResolution === "ANY" ? undefined : preferredResolution,
                        )
                      }
                      disabled={downloadingId === selectedResult.tmdbId}
                      className="inline-flex min-h-12 items-center justify-center rounded-full bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {downloadingId === selectedResult.tmdbId ? "Starting..." : "Download"}
                    </button>
                    <button
                      type="button"
                      onClick={closeDetails}
                      className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
