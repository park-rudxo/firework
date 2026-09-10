-- AlterTable
ALTER TABLE "survey_response" ADD COLUMN     "revealed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "survey_response_surveyId_revealed_idx" ON "survey_response"("surveyId", "revealed");

-- 이미 있던 응답을 묶음 단위로 열어둔다.
--
-- 그냥 두면 revealed 가 전부 false 라, 이미 3건 이상 모인 설문에서 제작자가 보던
-- 개별 응답이 통째로 사라진다. 반대로 전부 열면 묶음 규칙이 처음부터 깨진 채로 시작한다.
-- 그래서 설문마다 3의 배수만큼만 연다. 어느 것을 열지는 id 순으로 정하는데,
-- 이 시점 이후로는 그 구성원이 고정되므로 순서가 무엇이었는지는 더 이상 드러나지 않는다.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY "surveyId" ORDER BY id) AS rn,
    count(*)     OVER (PARTITION BY "surveyId")            AS total
  FROM "survey_response"
)
UPDATE "survey_response" AS r
SET "revealed" = true
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn <= (ranked.total / 3) * 3;
