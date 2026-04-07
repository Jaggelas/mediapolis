-- CreateEnum
CREATE TYPE "RequestScope" AS ENUM ('TITLE', 'SEASON', 'SERIES');

-- AlterTable
ALTER TABLE "MediaRequest" ADD COLUMN     "scope" "RequestScope" NOT NULL DEFAULT 'TITLE',
ADD COLUMN     "seasonNumber" INTEGER;

-- CreateIndex
CREATE INDEX "MediaRequest_mediaType_scope_idx" ON "MediaRequest"("mediaType", "scope");
