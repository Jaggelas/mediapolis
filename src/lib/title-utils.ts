const stopWords = new Set([
  "the",
  "a",
  "an",
  "and",
  "of",
  "for",
  "1080p",
  "2160p",
  "720p",
  "bluray",
  "webrip",
  "web",
  "x264",
  "x265",
  "h264",
  "h265",
  "aac",
  "ddp5",
  "proper",
  "repack",
]);

export function normalizeTitle(input: string) {
  return input
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeTitle(input: string) {
  return normalizeTitle(input)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

export function inferYear(input: string) {
  const yearMatch = input.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? Number(yearMatch[0]) : undefined;
}

export function inferEpisode(input: string) {
  const episodeMatch = input.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);

  if (!episodeMatch) {
    return null;
  }

  return {
    seasonNumber: Number(episodeMatch[1]),
    episodeNumber: Number(episodeMatch[2]),
  };
}

export function scoreTitleOverlap(expected: string, candidate: string) {
  const expectedTokens = new Set(tokenizeTitle(expected));
  const candidateTokens = tokenizeTitle(candidate);

  if (expectedTokens.size === 0 || candidateTokens.length === 0) {
    return 0;
  }

  let hits = 0;
  for (const token of candidateTokens) {
    if (expectedTokens.has(token)) {
      hits += 1;
    }
  }

  return hits / expectedTokens.size;
}

export function buildSearchQuery(title: string, year?: number) {
  return year ? `${title} ${year}` : title;
}
