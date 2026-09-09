-- 데모 주소를 필수로, 저장소 주소를 선택으로 바꾼다.
--
-- 이 서비스는 "둘러본다 → 써본다 → 피드백을 남긴다" 가 한 줄로 이어지는 것이 전부다.
-- 써볼 곳이 없으면 나머지가 성립하지 않으므로 데모가 필수 자리에 온다.
-- 반대로 저장소는 없을 수도 있다(비공개 저장소, 저장소가 없는 노코드 결과물 등).

-- 데모가 비어 있던 기존 프로젝트는 저장소 주소로 메운다. NOT NULL 로 바꾸기 전에
-- 남은 NULL 이 하나라도 있으면 마이그레이션 자체가 실패한다.
UPDATE "Project" SET "demoUrl" = "repoUrl" WHERE "demoUrl" IS NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "repoUrl" DROP NOT NULL,
ALTER COLUMN "demoUrl" SET NOT NULL;
