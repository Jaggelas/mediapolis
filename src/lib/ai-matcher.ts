import OpenAI from "openai";
import { MediaType } from "@/src/generated/prisma/enums";
import { getEnv } from "@/src/lib/env";
import { inferEpisode, inferYear, normalizeTitle, scoreTitleOverlap } from "@/src/lib/title-utils";

export type MatchCandidateInput = {
  title: string;
  year?: number | null;
  mediaType: MediaType;
};

export type MatchCandidateRelease = {
  title: string;
  sizeBytes?: bigint | number | null;
  seeders?: number | null;
};

export type MatchResult = {
  confidence: number;
  reason: string;
};

export type PlannedCandidateScore<TCandidate extends MatchCandidateRelease> = {
  candidate: TCandidate;
  heuristicScore: number;
  useAi: boolean;
};

export function scoreCandidateHeuristically(
  request: MatchCandidateInput,
  candidate: MatchCandidateRelease,
) {
  const overlap = scoreTitleOverlap(request.title, candidate.title);
  const requestYear = request.year ?? undefined;
  const releaseYear = inferYear(candidate.title);
  const requestEpisode = request.mediaType === MediaType.SHOW ? inferEpisode(request.title) : null;
  const releaseEpisode = request.mediaType === MediaType.SHOW ? inferEpisode(candidate.title) : null;

  let score = overlap;

  if (requestYear && releaseYear) {
    score += Math.max(0, 1 - Math.min(Math.abs(requestYear - releaseYear), 3) / 3) * 0.2;
  }

  if (requestEpisode && releaseEpisode) {
    if (
      requestEpisode.seasonNumber === releaseEpisode.seasonNumber &&
      requestEpisode.episodeNumber === releaseEpisode.episodeNumber
    ) {
      score += 0.2;
    } else {
      score -= 0.2;
    }
  }

  if (candidate.seeders && candidate.seeders > 10) {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

export function planCandidateScoring<TCandidate extends MatchCandidateRelease>(
  request: MatchCandidateInput,
  candidates: TCandidate[],
  config: {
    maxAiCandidates: number;
    minHeuristicScore: number;
  },
) {
  let aiSlotsRemaining = config.maxAiCandidates;

  return candidates
    .map((candidate) => ({
      candidate,
      heuristicScore: scoreCandidateHeuristically(request, candidate),
    }))
    .sort((left, right) => right.heuristicScore - left.heuristicScore)
    .map((entry) => {
      const useAi =
        aiSlotsRemaining > 0 && entry.heuristicScore >= config.minHeuristicScore;

      if (useAi) {
        aiSlotsRemaining -= 1;
      }

      return {
        ...entry,
        useAi,
      } satisfies PlannedCandidateScore<TCandidate>;
    });
}

export async function scoreCandidateWithAi(
  request: MatchCandidateInput,
  candidate: MatchCandidateRelease,
) {
  const heuristicScore = scoreCandidateHeuristically(request, candidate);
  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    return {
      confidence: heuristicScore,
      reason: "Fallback heuristic used because no AI API key is configured.",
    } satisfies MatchResult;
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const prompt = `
You are scoring whether a torrent release title matches a requested movie or TV show.
Return valid JSON with keys: confidence (0 to 1 number) and reason (short string).

Request:
- title: ${normalizeTitle(request.title)}
- year: ${request.year ?? "unknown"}
- mediaType: ${request.mediaType}

Candidate:
- title: ${normalizeTitle(candidate.title)}
- inferredYear: ${inferYear(candidate.title) ?? "unknown"}
- seeders: ${candidate.seeders ?? "unknown"}
- heuristicScore: ${heuristicScore}
`;

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: prompt,
    });
    const raw = response.output_text.trim();
    const parsed = JSON.parse(raw) as MatchResult;

    return {
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: parsed.reason || "AI scored the candidate.",
    } satisfies MatchResult;
  } catch {
    return {
      confidence: heuristicScore,
      reason: "AI scoring failed, heuristic score used instead.",
    } satisfies MatchResult;
  }
}
