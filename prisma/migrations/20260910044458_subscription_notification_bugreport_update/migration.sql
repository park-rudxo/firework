-- CreateEnum
CREATE TYPE "ProjectNotificationTopic" AS ENUM ('UPDATE', 'RECRUITING');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('RECEIVED', 'TRIAGING', 'FIXED', 'WONTFIX', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ProjectUpdateKind" AS ENUM ('PROGRESS', 'RELEASE', 'FIX', 'NOTICE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_UPDATE_POSTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_RECRUITING';
ALTER TYPE "NotificationType" ADD VALUE 'BUG_REPORT_FILED';
ALTER TYPE "NotificationType" ADD VALUE 'BUG_REPORT_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'MATTERMOST_DELIVERY_FAILED';

-- CreateTable
CREATE TABLE "project_notification_pref" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" "ProjectNotificationTopic" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_notification_pref_pkey" PRIMARY KEY ("projectId","userId","topic")
);

-- CreateTable
CREATE TABLE "mattermost_account" (
    "userId" TEXT NOT NULL,
    "mattermostUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "serverUrl" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "webhookUrlEnc" TEXT,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mattermost_account_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "outbound_message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "topic" "ProjectNotificationTopic",
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "status" "OutboundStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_report" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "environment" TEXT,
    "status" "BugReportStatus" NOT NULL DEFAULT 'RECEIVED',
    "statusNote" TEXT,
    "notifyReporter" BOOLEAN NOT NULL DEFAULT false,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_update" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "ProjectUpdateKind" NOT NULL DEFAULT 'PROGRESS',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fixedBugReportIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_notification_pref_userId_idx" ON "project_notification_pref"("userId");

-- CreateIndex
CREATE INDEX "project_notification_pref_projectId_topic_idx" ON "project_notification_pref"("projectId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "mattermost_account_mattermostUserId_key" ON "mattermost_account"("mattermostUserId");

-- CreateIndex
CREATE INDEX "outbound_message_status_createdAt_idx" ON "outbound_message"("status", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_message_userId_idx" ON "outbound_message"("userId");

-- CreateIndex
CREATE INDEX "bug_report_projectId_status_createdAt_idx" ON "bug_report"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "bug_report_reporterId_idx" ON "bug_report"("reporterId");

-- CreateIndex
CREATE INDEX "project_update_projectId_publishedAt_idx" ON "project_update"("projectId", "publishedAt");

-- AddForeignKey
ALTER TABLE "project_notification_pref" ADD CONSTRAINT "project_notification_pref_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_notification_pref" ADD CONSTRAINT "project_notification_pref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mattermost_account" ADD CONSTRAINT "mattermost_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
