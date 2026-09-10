-- P3009 진단 — 읽기 전용. 아무것도 바꾸지 않는다.
--
-- 실패한 마이그레이션(20260910040000_community_mattermost)은 enum 값 추가(ALTER TYPE ... ADD VALUE)를
-- 포함한다. Prisma 는 그런 문장이 있으면 마이그레이션 파일을 **트랜잭션 없이** 실행한다.
-- 그래서 실패해도 그 앞까지는 그대로 남는다 — 격리 DB에서 재현해 확인했다.
--
-- 그 결과 applied_steps_count 는 0 인데 테이블 4개와 컬럼 5개가 이미 만들어져 있는 상태가 나온다.
-- **applied_steps_count 로 부분 적용 여부를 판단하면 안 된다.** 아래 2번으로 판단한다.
--
-- 실행: 운영 DB 에 psql 로 접속해 전체를 붙여넣고, 출력 전부를 그대로 회신.

\echo '=== 0. 접속 대상 확인 (비밀값 아님) ==='
SELECT current_database() AS db,
       current_schema()   AS schema,
       current_user       AS role,
       inet_server_addr() AS host,
       version()          AS pg_version;

\echo ''
\echo '=== 1. 마이그레이션 이력 — 원래 오류가 logs 에 있다 ==='
SELECT migration_name,
       started_at,
       finished_at,
       rolled_back_at,
       applied_steps_count,
       logs
FROM public._prisma_migrations
ORDER BY started_at DESC
LIMIT 10;

\echo ''
\echo '=== 2. 어디까지 적용됐나 — 파일의 실행 순서대로 ==='
\echo '    위에서부터 t 가 이어지다 f 로 바뀌는 지점이 실패한 문장이다.'
WITH steps(seq, kind, label, present) AS (
  VALUES
    ( 1,'TYPE',  'ProjectUpdateKind',              (SELECT count(*)>0 FROM pg_type WHERE typname='ProjectUpdateKind')),
    ( 2,'TYPE',  'BugStatus',                      (SELECT count(*)>0 FROM pg_type WHERE typname='BugStatus')),
    ( 3,'TYPE',  'DeliveryKind',                   (SELECT count(*)>0 FROM pg_type WHERE typname='DeliveryKind')),
    ( 4,'TYPE',  'DeliveryStatus',                 (SELECT count(*)>0 FROM pg_type WHERE typname='DeliveryStatus')),
    ( 5,'ENUM',  'NotificationType.BUG_REPORTED',  (SELECT count(*)>0 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='NotificationType' AND e.enumlabel='BUG_REPORTED')),
    ( 6,'ENUM',  'NotificationType.BUG_STATUS_CHANGED', (SELECT count(*)>0 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='NotificationType' AND e.enumlabel='BUG_STATUS_CHANGED')),
    ( 7,'COLUMN','project_member.notificationChangedAt', (SELECT count(*)>0 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_member' AND column_name='notificationChangedAt')),
    ( 8,'COLUMN','project_member.notifyManagement',(SELECT count(*)>0 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_member' AND column_name='notifyManagement')),
    ( 9,'COLUMN','project_follow.notificationChangedAt',(SELECT count(*)>0 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_follow' AND column_name='notificationChangedAt')),
    (10,'COLUMN','project_follow.notifyRecruitment',(SELECT count(*)>0 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_follow' AND column_name='notifyRecruitment')),
    (11,'COLUMN','project_follow.notifyUpdates',   (SELECT count(*)>0 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_follow' AND column_name='notifyUpdates')),
    (12,'TABLE', 'MattermostIdentity',             (SELECT count(*)>0 FROM information_schema.tables WHERE table_schema='public' AND table_name='MattermostIdentity')),
    (13,'TABLE', 'ProjectUpdate',                  (SELECT count(*)>0 FROM information_schema.tables WHERE table_schema='public' AND table_name='ProjectUpdate')),
    (14,'TABLE', 'BugReport',                      (SELECT count(*)>0 FROM information_schema.tables WHERE table_schema='public' AND table_name='BugReport')),
    (15,'TABLE', 'MattermostDelivery',             (SELECT count(*)>0 FROM information_schema.tables WHERE table_schema='public' AND table_name='MattermostDelivery')),
    (16,'INDEX', 'MattermostIdentity_mattermostUserId_key', (SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND indexname='MattermostIdentity_mattermostUserId_key')),
    (17,'INDEX', 'ProjectUpdate_projectId_createdAt_idx',   (SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND indexname='ProjectUpdate_projectId_createdAt_idx')),
    (18,'INDEX', 'BugReport_projectId_createdAt_idx',       (SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND indexname='BugReport_projectId_createdAt_idx')),
    (19,'INDEX', 'BugReport_reporterId_createdAt_idx',      (SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND indexname='BugReport_reporterId_createdAt_idx')),
    (20,'INDEX', 'MattermostDelivery_dedupeKey_key',        (SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND indexname='MattermostDelivery_dedupeKey_key')),
    (21,'INDEX', 'MattermostDelivery_status_availableAt_idx',(SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND indexname='MattermostDelivery_status_availableAt_idx')),
    (22,'FK',    'MattermostIdentity_userId_fkey',    (SELECT count(*)>0 FROM pg_constraint WHERE conname='MattermostIdentity_userId_fkey')),
    (23,'FK',    'ProjectUpdate_projectId_fkey',      (SELECT count(*)>0 FROM pg_constraint WHERE conname='ProjectUpdate_projectId_fkey')),
    (24,'FK',    'ProjectUpdate_authorId_fkey',       (SELECT count(*)>0 FROM pg_constraint WHERE conname='ProjectUpdate_authorId_fkey')),
    (25,'FK',    'BugReport_projectId_fkey',          (SELECT count(*)>0 FROM pg_constraint WHERE conname='BugReport_projectId_fkey')),
    (26,'FK',    'BugReport_reporterId_fkey',         (SELECT count(*)>0 FROM pg_constraint WHERE conname='BugReport_reporterId_fkey')),
    (27,'FK',    'MattermostDelivery_userId_fkey',    (SELECT count(*)>0 FROM pg_constraint WHERE conname='MattermostDelivery_userId_fkey')),
    (28,'FK',    'MattermostDelivery_projectId_fkey', (SELECT count(*)>0 FROM pg_constraint WHERE conname='MattermostDelivery_projectId_fkey'))
)
SELECT seq, kind, label, present FROM steps ORDER BY seq;

\echo ''
\echo '=== 3. 한 줄 요약 — 28개 중 몇 개가 적용됐나 ==='
WITH steps(present) AS (
  SELECT (SELECT count(*)>0 FROM pg_type WHERE typname='ProjectUpdateKind')
  UNION ALL SELECT (SELECT count(*)>0 FROM information_schema.tables WHERE table_schema='public' AND table_name='MattermostDelivery')
  UNION ALL SELECT (SELECT count(*)>0 FROM pg_constraint WHERE conname='MattermostDelivery_projectId_fkey')
)
SELECT bool_or(present) AS "일부라도_적용됨", bool_and(present) AS "끝까지_적용됨" FROM steps;

\echo ''
\echo '=== 4. 보존돼야 할 기존 데이터 (복구 전 기준값) ==='
SELECT (SELECT count(*) FROM "user")                AS users,
       (SELECT count(*) FROM profile)               AS profiles,
       (SELECT count(*) FROM "Project")             AS projects,
       (SELECT count(*) FROM project_member)        AS members,
       (SELECT count(*) FROM project_follow)        AS follows,
       (SELECT count(*) FROM "Survey")              AS surveys,
       (SELECT count(*) FROM survey_response)       AS responses,
       (SELECT count(*) FROM survey_participation)  AS participations,
       (SELECT count(*) FROM notification)          AS notifications;

\echo ''
\echo '=== 5. 이후 마이그레이션이 이미 들어갔는지 (들어갔으면 안 된다) ==='
SELECT (SELECT count(*)>0 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='survey_response' AND column_name='revealed') AS "revealed_컬럼_있음",
       (SELECT count(*)>0 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='project_invitation') AS "초대_테이블_있음";

\echo ''
\echo '=== 6. 설문별 응답 수 — REVIEW.md 백필 판단에 쓴다 ==='
SELECT s.id AS survey_id, count(r.id) AS responses,
       (count(r.id) >= 3) AS "예전_구현에서_전부_공개되던_설문"
FROM "Survey" s LEFT JOIN survey_response r ON r."surveyId" = s.id
GROUP BY s.id ORDER BY responses DESC;
