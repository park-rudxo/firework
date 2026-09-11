-- 예전에 공개돼 있던 응답을 다시 공개 상태로 되돌린다.
--
-- **P3009 복구와 무관하다.** 같은 폴더의 01·02 와 섞지 않는다.
-- 20260910090000_preserve_existing_revealed 가 배포를 세웠을 때만 쓴다.
--
-- ── 실행 전에 반드시 확인할 것 ────────────────────────────────────────
--
-- 이 SQL 은 응답 3건 이상인 설문의 **모든** 응답을 공개로 바꾼다. 마이그레이션이 이걸
-- 자동으로 하지 않는 이유는 하나다 — 20260910072918 이 적용된 뒤 이 DB 를 보는 앱이
-- 응답을 하나라도 받았다면, 그 새 응답까지 함께 열리기 때문이다. 그러면 제작자 화면의
-- 건수가 늘고, 늘어난 그 한 건이 곧 신규 응답이 된다. 익명성 설계가 막으려는 바로 그
-- 노출이다.
--
-- 그러므로 다음을 확인한 뒤에만 실행한다.
--
--   1. 20260910072918 이 이 DB 에 적용된 시각
--        SELECT migration_name, finished_at FROM _prisma_migrations
--         WHERE migration_name LIKE '2026091007%' ORDER BY finished_at;
--   2. 그 시각 이후 이 DB 를 쓰는 앱이 떠 있었는지 (배포 이력, 로컬 접속 이력)
--   3. 그 사이 설문 응답이 늘지 않았는지 (ProjectStatDaily.surveyResponses 는 날짜별
--      합계라 개인과 무관하게 확인할 수 있다)
--
-- 하나라도 확인되지 않으면 실행하지 않는다. 잘못 연 응답은 되돌릴 수 없다 —
-- 다시 감추는 것 자체가 "그 한 건이 새 응답" 이라는 신호이기 때문이다.
--
-- 확인 결과는 docs/HANDOFF.md 에 남긴다.

BEGIN;

-- 바꾸기 전 상태. 실행 뒤 숫자와 대조한다.
SELECT "surveyId",
       count(*)                                AS 전체,
       count(*) FILTER (WHERE "revealed")      AS 공개,
       count(*) FILTER (WHERE NOT "revealed")  AS 미공개
  FROM "survey_response"
 GROUP BY "surveyId"
HAVING count(*) >= 3 AND count(*) FILTER (WHERE NOT "revealed") > 0
 ORDER BY "surveyId";

UPDATE "survey_response"
   SET "revealed" = true
 WHERE "surveyId" IN (
   SELECT "surveyId" FROM "survey_response" GROUP BY "surveyId" HAVING count(*) >= 3
 );

-- 1·2건짜리 설문은 그때도 잠겨 있었다. 여기서 열리면 안 된다.
SELECT count(*) AS "열리면_안_되는데_열린_설문_수"
  FROM (
    SELECT "surveyId"
      FROM "survey_response"
     GROUP BY "surveyId"
    HAVING count(*) < 3 AND count(*) FILTER (WHERE "revealed") > 0
  ) s;

-- 위 결과를 확인한 뒤 COMMIT. 어긋나면 ROLLBACK.
COMMIT;
