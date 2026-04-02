-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('MOVIE', 'SHOW');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('REQUESTED', 'SEARCHING', 'REVIEW', 'MATCHED', 'DOWNLOADING', 'ORGANIZING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'AUTO_SELECTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DownloadSource" AS ENUM ('JACKETT', 'MAGNET', 'TORRENT_UPLOAD');

-- CreateEnum
CREATE TYPE "DownloadStatus" AS ENUM ('QUEUED', 'MATCHED', 'DOWNLOADING', 'COMPLETED', 'ORGANIZING', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaFileStatus" AS ENUM ('PENDING', 'MOVED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PlexLibraryType" AS ENUM ('MOVIES', 'TV');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaRequest" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "year" INTEGER,
    "mediaType" "MediaType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "qualityProfile" TEXT,
    "tmdbId" INTEGER,
    "searchQuery" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "aiReason" TEXT,
    "lastSearchedAt" TIMESTAMP(3),
    "nextSearchAt" TIMESTAMP(3),
    "autoDownloadThreshold" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateTorrent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "indexerKey" TEXT,
    "title" TEXT NOT NULL,
    "magnetUri" TEXT,
    "torrentUrl" TEXT,
    "infoHash" TEXT,
    "sizeBytes" BIGINT,
    "seeders" INTEGER,
    "peers" INTEGER,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateTorrent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "candidateId" TEXT,
    "source" "DownloadSource" NOT NULL,
    "status" "DownloadStatus" NOT NULL DEFAULT 'QUEUED',
    "qbTorrentHash" TEXT,
    "qbCategory" TEXT,
    "inputName" TEXT,
    "inputMagnet" TEXT,
    "originalFileName" TEXT,
    "downloadRoot" TEXT,
    "downloadPath" TEXT,
    "bytesTotal" BIGINT,
    "bytesDownloaded" BIGINT DEFAULT 0,
    "progress" DOUBLE PRECISION DEFAULT 0,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "downloadJobId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "plexLibrary" "PlexLibraryType" NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "seasonNumber" INTEGER,
    "episodeNumber" INTEGER,
    "tmdbId" INTEGER,
    "sourcePath" TEXT NOT NULL,
    "destinationPath" TEXT NOT NULL,
    "status" "MediaFileStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "indexerKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "categoryHints" JSONB,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "requestId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "MediaRequest_requestedById_idx" ON "MediaRequest"("requestedById");

-- CreateIndex
CREATE INDEX "MediaRequest_status_nextSearchAt_idx" ON "MediaRequest"("status", "nextSearchAt");

-- CreateIndex
CREATE INDEX "MediaRequest_mediaType_title_year_idx" ON "MediaRequest"("mediaType", "title", "year");

-- CreateIndex
CREATE INDEX "CandidateTorrent_requestId_confidence_idx" ON "CandidateTorrent"("requestId", "confidence");

-- CreateIndex
CREATE INDEX "CandidateTorrent_infoHash_idx" ON "CandidateTorrent"("infoHash");

-- CreateIndex
CREATE INDEX "CandidateTorrent_status_idx" ON "CandidateTorrent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadJob_qbTorrentHash_key" ON "DownloadJob"("qbTorrentHash");

-- CreateIndex
CREATE INDEX "DownloadJob_requestId_status_idx" ON "DownloadJob"("requestId", "status");

-- CreateIndex
CREATE INDEX "DownloadJob_candidateId_idx" ON "DownloadJob"("candidateId");

-- CreateIndex
CREATE INDEX "DownloadJob_status_updatedAt_idx" ON "DownloadJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "MediaFile_downloadJobId_idx" ON "MediaFile"("downloadJobId");

-- CreateIndex
CREATE INDEX "MediaFile_plexLibrary_status_idx" ON "MediaFile"("plexLibrary", "status");

-- CreateIndex
CREATE INDEX "MediaFile_title_year_idx" ON "MediaFile"("title", "year");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerProfile_name_key" ON "IndexerProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerProfile_indexerKey_key" ON "IndexerProfile"("indexerKey");

-- CreateIndex
CREATE INDEX "IndexerProfile_enabled_idx" ON "IndexerProfile"("enabled");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MediaRequest" ADD CONSTRAINT "MediaRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTorrent" ADD CONSTRAINT "CandidateTorrent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadJob" ADD CONSTRAINT "DownloadJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadJob" ADD CONSTRAINT "DownloadJob_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateTorrent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_downloadJobId_fkey" FOREIGN KEY ("downloadJobId") REFERENCES "DownloadJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MediaRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
