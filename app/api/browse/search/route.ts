import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType } from "@/src/generated/prisma/enums";
import { debugError, debugWarn } from "@/src/lib/debug-log";
import { getSession } from "@/src/lib/session";
import { discoverTmdbCatalog, searchTmdbCatalog } from "@/src/lib/tmdb";

const browseSearchSchema = z.object({
  q: z.string().trim().optional(),
  mediaType: z.nativeEnum(MediaType).default(MediaType.MOVIE),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  genreId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  sortBy: z
    .enum(["popularity.desc", "primary_release_date.desc", "first_air_date.desc", "vote_average.desc"])
    .optional(),
});

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:browse-search", "Rejected GET /api/browse/search without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = browseSearchSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    mediaType: url.searchParams.get("mediaType") ?? undefined,
    year: url.searchParams.get("year") ?? undefined,
    genreId: url.searchParams.get("genreId") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
  });

  if (!params.success) {
    return NextResponse.json({ error: "Invalid browse filters." }, { status: 400 });
  }

  try {
    const payload =
      params.data.q && params.data.q.trim().length > 0
        ? await searchTmdbCatalog({
            query: params.data.q,
            page: params.data.page,
          })
        : await discoverTmdbCatalog(params.data);
    return NextResponse.json(payload);
  } catch (error) {
    debugError("api:browse-search", "TMDB browse search failed", error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
