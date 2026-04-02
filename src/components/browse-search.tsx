"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { MediaType, RequestStatus } from "@/src/generated/prisma/enums";
import { debugError, debugLog } from "@/src/lib/debug-log";
import { cn } from "@/src/lib/utils";

type BrowseResult = {
  tmdbId: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  overview?: string;
  posterUrl?: string;
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

type GenreResponse = {
  genres?: BrowseGenre[];
  error?: string;
};

type DownloadResponse = {
  status?: RequestStatus;
  message?: string;
  error?: string;
};

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

  const trimmedQuery = query.trim();
  const hasShortQuery = trimmedQuery.length === 1;

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

  useEffect(() => {
    const controller = new AbortController();

    async function loadGenres() {
      setGenresLoading(true);

      try {
        const searchParams = new URLSearchParams({ mediaType });
        const response = await fetch(`/api/browse/genres?${searchParams.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as GenreResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load genres.");
        }

        setGenres(payload?.genres ?? []);
      } catch (genreError) {
        if (!controller.signal.aborted) {
          debugError("browse-search", "Genre lookup failed", genreError);
          setGenres([]);
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

  async function handleDownload(result: BrowseResult) {
    setDownloadingId(result.tmdbId);
    setFeedback("");
    setError("");

    debugLog("browse-search", "Starting browse download", {
      tmdbId: result.tmdbId,
      title: result.title,
      mediaType: result.mediaType,
      year: result.year ?? null,
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

  return (
    <div className="grid gap-6">
      <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-300">
              Catalog browse
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">Browse, filter, and download</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Search directly by title or browse the catalog by media type, genre, year, and sort order,
              then send the selected item into the existing request and download pipeline in one step.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.7fr))]">
            <label className="grid gap-2 text-sm text-slate-300 xl:col-span-2">
              Search titles
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
                <Search className="h-4 w-4 shrink-0 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder={`Search for a ${mediaType === MediaType.MOVIE ? "movie" : "TV series"}`}
                  className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
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
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
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
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
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
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500"
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
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
            <span>{trimmedQuery ? "All title matches" : `${typeLabel[mediaType]} catalog`}</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
            <span>
              Page {page} of {totalPages}
            </span>
            {trimmedQuery ? (
              <>
                <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                <span>Title search ignores type, genre, and year filters</span>
              </>
            ) : null}
            {hasShortQuery ? (
              <>
                <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                <span>Keep typing to search by title</span>
              </>
            ) : null}
            {(genreId || year || trimmedQuery) ? (
              <>
                <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGenreId("");
                    setYear("");
                    setSortMode("popular");
                    setPage(1);
                  }}
                  className="text-sky-300 transition hover:text-sky-200"
                >
                  Clear filters
                </button>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span>
              {trimmedQuery
                ? "Title search spans both movies and TV series."
                : "Browse by genre, year, or title."}
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:inline-block" />
            <span>Movies and TV series are routed into the correct library automatically.</span>
          </div>

          {feedback ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {feedback}
            </div>
          ) : null}
          {error && !loading ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-4xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[0_22px_55px_rgba(2,6,23,0.18)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Browse results</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Use the filters above to discover popular titles even before typing a name, then download
              the exact item you want from the result card.
            </p>
          </div>
          {loading ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Loading catalog
            </div>
          ) : null}
        </div>

        {results.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-slate-950/20 px-5 py-8 text-center text-sm text-slate-400">
            {emptyState}
          </div>
        ) : (
          <div className="mt-6 grid gap-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {results.map((result) => {
                const isDownloading = downloadingId === result.tmdbId;

                return (
                  <article
                    key={`${result.mediaType}-${result.tmdbId}`}
                    className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/35 p-4 sm:grid-cols-[112px_minmax(0,1fr)]"
                  >
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
                      {result.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={result.posterUrl}
                          alt={`${result.title} poster`}
                          className="h-full min-h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex min-h-40 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_55%)] px-4 text-center text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                          No poster
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
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
                            {result.voteAverage.toFixed(1)} rating
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-lg font-semibold tracking-tight text-white">{result.title}</h3>
                      <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-400">
                        {result.overview || "No overview available for this title."}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleDownload(result)}
                          disabled={isDownloading}
                          className="inline-flex items-center justify-center rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDownloading ? "Starting..." : "Download now"}
                        </button>
                        <span className="text-sm text-slate-500">
                          Mediapolis will decide the final library path after download.
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-400">
                Browse deeper into the catalog for newer releases and discovery pages.
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={loading || page <= 1}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="text-sm font-medium text-slate-300">
                  Page {page} of {totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  disabled={loading || page >= totalPages}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
