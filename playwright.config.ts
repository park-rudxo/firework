import { defineConfig, devices } from "@playwright/test";

/**
 * 공개 화면 흐름만 다룬다. 로그인 뒤의 흐름(설문 제출, 추첨 실행)은 소셜 OAuth 가
 * 필요해서 여기서 재현할 수 없다. 그쪽은 순수 함수 단위 테스트(tests/)와
 * 스키마 검사로 덮는다.
 *
 * DATABASE_URL 이 가리키는 DB 에 마이그레이션과 시드가 적용돼 있어야 한다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // 브라우저가 이미 깔린 이미지(CI 러너, 샌드박스)에서는 이 경로를 주면
        // 버전이 어긋난 브라우저를 새로 내려받지 않는다.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
