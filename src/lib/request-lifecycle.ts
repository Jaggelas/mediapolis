import { RequestStatus } from "@/src/generated/prisma/enums";

export function determineSearchOutcomeStatus(input: {
  bestConfidence: number;
  threshold: number;
  allowAutoDownloads: boolean;
  hasMagnetUri: boolean;
}) {
  if (
    input.allowAutoDownloads &&
    input.bestConfidence >= input.threshold &&
    input.hasMagnetUri
  ) {
    return RequestStatus.MATCHED;
  }

  return RequestStatus.REVIEW;
}
