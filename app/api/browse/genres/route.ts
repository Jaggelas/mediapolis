import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaType } from "@/src/generated/prisma/enums";
import { debugError, debugWarn } from "@/src/lib/debug-log";
import { getSession } from "@/src/lib/session";
import { getTmdbGenres } from "@/src/lib/tmdb";

const browseGenresSchema = z.object({
  mediaType: z.nativeEnum(MediaType).default(MediaType.MOVIE),
});

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    debugWarn("api:browse-genres", "Rejected GET /api/browse/genres without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = browseGenresSchema.safeParse({
    mediaType: url.searchParams.get("mediaType") ?? undefined,
  });

  if (!params.success) {
    return NextResponse.json({ error: "Invalid browse genre filters." }, { status: 400 });
  }

  try {
    const genres = await getTmdbGenres(params.data.mediaType);
    return NextResponse.json({ genres });
  } catch (error) {
    debugError("api:browse-genres", "TMDB browse genre lookup failed", error);
    return NextResponse.json({ error: "Failed to load genres." }, { status: 500 });
  }
}
