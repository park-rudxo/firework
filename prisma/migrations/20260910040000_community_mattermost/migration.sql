-- CreateEnum
CREATE TYPE "ProjectUpdateKind" AS ENUM ('UPDATE', 'RECRUITMENT');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'FIXED');

-- CreateEnum
CREATE TYPE "DeliveryKind" AS ENUM ('UPDATE', 'RECRUITMENT', 'MANAGEMENT', 'BUG_STATUS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BUG_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'BUG_STATUS_CHANGED';

-- AlterTable
ALTER TABLE "project_member" ADD COLUMN     "notificationChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notifyManagement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "project_follow" ADD COLUMN     "notificationChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notifyRecruitment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyUpdates" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MattermostIdentity" (
    "userId" TEXT NOT NULL,
    "mattermostUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MattermostIdentity_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProjectUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "ProjectUpdateKind" NOT NULL DEFAULT 'UPDATE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "BugStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT NOT NULL DEFAULT '',
    "notifyStatus" BOOLEAN NOT NULL DEFAULT false,
    "notificationChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MattermostDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "DeliveryKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MattermostDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MattermostIdentity_mattermostUserId_key" ON "MattermostIdentity"("mattermostUserId");

-- CreateIndex
CREATE INDEX "ProjectUpdate_projectId_createdAt_idx" ON "ProjectUpdate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "BugReport_projectId_createdAt_idx" ON "BugReport"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "BugReport_reporterId_createdAt_idx" ON "BugReport"("reporterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MattermostDelivery_dedupeKey_key" ON "MattermostDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "MattermostDelivery_status_availableAt_idx" ON "MattermostDelivery"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "MattermostIdentity" ADD CONSTRAINT "MattermostIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MattermostDelivery" ADD CONSTRAINT "MattermostDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MattermostDelivery" ADD CONSTRAINT "MattermostDelivery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
