-- CreateEnum
CREATE TYPE "ProjectInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_INVITED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_INVITE_ANSWERED';

-- CreateTable
CREATE TABLE "project_invitation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "inviteeMattermostUserId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "status" "ProjectInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "pendingInviteeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "project_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_invitation_inviteeId_status_idx" ON "project_invitation"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "project_invitation_projectId_status_idx" ON "project_invitation"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_invitation_projectId_pendingInviteeId_key" ON "project_invitation"("projectId", "pendingInviteeId");

-- AddForeignKey
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
