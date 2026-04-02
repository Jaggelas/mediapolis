import { MediaType } from "@/src/generated/prisma/enums";
import { getEnv } from "@/src/lib/env";

type JackettSearchResult = {
  Title?: string;
  MagnetUri?: string;
  Link?: string;
  Guid?: string;
  Seeders?: number;
  Peers?: number;
  Size?: number;
  Tracker?: string;
};

type JackettPayload = {
  Results?: JackettSearchResult[];
};

export type NormalizedTorrentCandidate = {
  source: string;
  indexerKey?: string;
  title: string;
  magnetUri?: string;
  torrentUrl?: string;
  infoHash?: string;
  sizeBytes?: number;
  seeders?: number;
  peers?: number;
  rawPayload: Record<string, unknown>;
};

const categoryMap: Record<MediaType, string> = {
  [MediaType.MOVIE]: "2000",
  [MediaType.SHOW]: "5000",
};

function extractInfoHash(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const infoHashMatch = value.match(/btih:([a-zA-Z0-9]+)/i);
  return infoHashMatch?.[1];
}

export async function searchJackett(query: string, mediaType: MediaType) {
  const env = getEnv();

  if (!env.JACKETT_API_KEY) {
    return [] satisfies NormalizedTorrentCandidate[];
  }

  const searchParams = new URLSearchParams({
    apikey: env.JACKETT_API_KEY,
    Query: query,
    Category: categoryMap[mediaType],
  });

  const response = await fetch(
    `${env.JACKETT_BASE_URL}/api/v2.0/indexers/${env.JACKETT_INDEXER}/results?${searchParams.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Jackett search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JackettPayload;

  return (payload.Results ?? []).map((result) => ({
    source: "jackett",
    indexerKey: result.Tracker,
    title: result.Title ?? "Untitled release",
    magnetUri: result.MagnetUri,
    torrentUrl: result.Link,
    infoHash: extractInfoHash(result.MagnetUri ?? result.Guid),
    sizeBytes: result.Size,
    seeders: result.Seeders,
    peers: result.Peers,
    rawPayload: result as Record<string, unknown>,
  }));
}
