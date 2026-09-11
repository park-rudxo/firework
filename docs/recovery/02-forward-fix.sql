-- P3009 전진 복구 — 부분 적용된 20260910040000_community_mattermost 를 끝까지 채운다.
--
-- **먼저 01-diagnose.sql 을 돌리고, 복구 가능한 스냅샷을 확보한 뒤에만 실행한다.**
--
-- 왜 이렇게 하나:
--   이 마이그레이션은 enum 값 추가를 포함해서 Prisma 가 트랜잭션 없이 실행한다.
--   그래서 실패하면 앞부분이 그대로 남는다. 남은 상태 위에 원본 SQL 을 다시 돌리면
--   "type already exists" 로 또 실패한다. 원본 파일은 고치지 않기로 했으므로
--   (이미 적용된 SQL 은 건드리지 않는다) 빠진 것만 채우는 스크립트를 따로 둔다.
--
-- 성질:
--   - 전부 IF NOT EXISTS / 존재 검사. 어느 지점에서 멈췄든, 몇 번을 돌리든 같은 결과가 된다.
--   - 기존 행을 읽거나 지우거나 바꾸지 않는다. DROP 도 UPDATE 도 없다.
--   - 새 컬럼은 전부 DEFAULT 가 있어 기존 행이 그대로 채워진다. 알림 기본값은 false 다.
--
-- 실행: psql "<DIRECT_DATABASE_URL>" -f 02-forward-fix.sql
--   반드시 **풀러를 거치지 않는 직결 주소**로 실행한다. PgBouncer 뒤에서는
--   ALTER TYPE ... ADD VALUE 가 트랜잭션 블록 안이라며 거절될 수 있다.

\set ON_ERROR_STOP on

-- ── 1~4. enum 타입 ────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ProjectUpdateKind') THEN
    CREATE TYPE "ProjectUpdateKind" AS ENUM ('UPDATE', 'RECRUITMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='BugStatus') THEN
    CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'FIXED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DeliveryKind') THEN
    CREATE TYPE "DeliveryKind" AS ENUM ('UPDATE', 'RECRUITMENT', 'MANAGEMENT', 'BUG_STATUS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DeliveryStatus') THEN
    CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');
  END IF;
END $$;

-- ── 5~6. NotificationType 에 값 추가 ──────────────────────────
-- 트랜잭션 블록 밖에서 실행돼야 한다. psql 기본(autocommit)이면 그렇게 된다.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BUG_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BUG_STATUS_CHANGED';

-- ── 7~11. 기존 테이블의 새 컬럼 ───────────────────────────────
-- DEFAULT 가 있으므로 기존 행이 그대로 채워진다. 알림은 전부 꺼진 상태로 들어간다.
ALTER TABLE "project_member"
  ADD COLUMN IF NOT EXISTS "notificationChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "notifyManagement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "project_follow"
  ADD COLUMN IF NOT EXISTS "notificationChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "notifyRecruitment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notifyUpdates" BOOLEAN NOT NULL DEFAULT false;

-- ── 12~15. 새 테이블 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MattermostIdentity" (
    "userId" TEXT NOT NULL,
    "mattermostUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MattermostIdentity_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "ProjectUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "ProjectUpdateKind" NOT NULL DEFAULT 'UPDATE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BugReport" (
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

CREATE TABLE IF NOT EXISTS "MattermostDelivery" (
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

-- ── 16~21. 인덱스 ─────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "MattermostIdentity_mattermostUserId_key" ON "MattermostIdentity"("mattermostUserId");
CREATE INDEX IF NOT EXISTS "ProjectUpdate_projectId_createdAt_idx" ON "ProjectUpdate"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "BugReport_projectId_createdAt_idx" ON "BugReport"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "BugReport_reporterId_createdAt_idx" ON "BugReport"("reporterId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MattermostDelivery_dedupeKey_key" ON "MattermostDelivery"("dedupeKey");
CREATE INDEX IF NOT EXISTS "MattermostDelivery_status_availableAt_idx" ON "MattermostDelivery"("status", "availableAt");

-- ── 22~28. 외래 키 ────────────────────────────────────────────
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('MattermostIdentity_userId_fkey',    'MattermostIdentity', 'userId',     'user'),
      ('ProjectUpdate_projectId_fkey',      'ProjectUpdate',      'projectId',  'Project'),
      ('ProjectUpdate_authorId_fkey',       'ProjectUpdate',      'authorId',   'user'),
      ('BugReport_projectId_fkey',          'BugReport',          'projectId',  'Project'),
      ('BugReport_reporterId_fkey',         'BugReport',          'reporterId', 'user'),
      ('MattermostDelivery_userId_fkey',    'MattermostDelivery', 'userId',     'user'),
      ('MattermostDelivery_projectId_fkey', 'MattermostDelivery', 'projectId',  'Project')
    ) AS t(name, child, col, parent)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I("id") ON DELETE CASCADE ON UPDATE CASCADE',
        fk.child, fk.name, fk.col, fk.parent);
    END IF;
  END LOOP;
END $$;
