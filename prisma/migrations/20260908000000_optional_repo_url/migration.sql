-- 저장소가 없는 프로젝트(배포된 웹서비스, 스토어 앱)도 등록할 수 있게 한다.
-- repoUrl 과 demoUrl 중 최소 하나는 있어야 한다는 규칙은 애플리케이션에서 강제한다.
-- DB 제약으로 걸면 두 값이 모두 비는 중간 상태를 만드는 수정 경로에서 다루기 어렵다.
ALTER TABLE "Project" ALTER COLUMN "repoUrl" DROP NOT NULL;
