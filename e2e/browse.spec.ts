import { expect, test } from "@playwright/test";

/**
 * 로그인 없이 지나갈 수 있는 경로. 시드 데이터가 들어 있어야 한다.
 */

test("홈에 큐레이션 섹션과 프로젝트 카드가 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "SSAFY 프로젝트, 한곳에서." })).toBeVisible();

  // 플레이스토어식 섹션. 비어 있는 섹션은 렌더되지 않으므로 최소 하나는 있어야 한다.
  const sections = page.locator("section h2");
  await expect(sections.first()).toBeVisible();
  expect(await sections.count()).toBeGreaterThan(0);

  await expect(page.getByRole("link", { name: /모아모아/ }).first()).toBeVisible();
});

test("둘러보기에서 검색과 카테고리 필터가 동작한다", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "둘러보기" })).toBeVisible();

  await page.getByRole("searchbox", { name: "프로젝트 검색" }).fill("출석");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("heading", { name: "출석왕" })).toBeVisible();

  await page.goto("/projects?category=TOOL");
  await expect(page.getByRole("link", { name: /알고 트래커/ })).toBeVisible();
});

test("프로젝트 상세에 GitHub 메타와 설문 유도가 보인다", async ({ page }) => {
  await page.goto("/projects/moamoa");

  await expect(page.getByRole("heading", { name: "모아모아", level: 1 })).toBeVisible();
  // GitHub 스냅샷에서 온 값
  await expect(page.getByText("MIT")).toBeVisible();
  // 설문이 열려 있으면 유도 배너가 뜬다
  await expect(page.getByRole("link", { name: "피드백 남기기" })).toBeVisible();
  // 외부 링크는 opener 를 끊어야 한다
  const repoLink = page.getByRole("link", { name: /GitHub/ }).first();
  await expect(repoLink).toHaveAttribute("rel", /noopener/);
});

test("로그인이 필요한 화면은 로그인으로 보낸다", async ({ page }) => {
  await page.goto("/projects/moamoa/survey");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("일정 화면이 뜬다", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "일정", level: 1 })).toBeVisible();
  // 월간 격자의 요일 머리글
  await expect(page.getByText("월", { exact: true }).first()).toBeVisible();
});

test("익명성 정책이 무엇을 담지 않는지 밝힌다", async ({ page }) => {
  await page.goto("/about/anonymity");
  await expect(page.getByText("작성자 정보 없음")).toBeVisible();
  await expect(page.getByText("언제 썼는지도 없음")).toBeVisible();
});

test("신고 정책이 자동 숨김이 없다고 밝힌다", async ({ page }) => {
  await page.goto("/about/reporting");
  await expect(
    page.getByRole("heading", { name: "신고만으로는 아무것도 내려가지 않습니다" }),
  ).toBeVisible();
});
