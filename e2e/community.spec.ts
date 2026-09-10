import { expect, test } from "@playwright/test";

test("프로젝트 상세에서 소식·버그 화면으로 이동한다", async ({ page }) => {
  await page.goto("/projects/moamoa");
  await page.getByRole("link", { name: "진행 소식 보기 · 버그 제보 →" }).click();
  await expect(page.getByRole("heading", { name: "모아모아 · 소식과 피드백" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "진행 소식", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인하고 구독·버그 제보하기 →" })).toBeVisible();
  await expect(page.getByRole("button", { name: "버그 제보하기" })).toHaveCount(0);
});

test("구독과 비공개 버그 화면은 로그인을 요구한다", async ({ page }) => {
  for (const path of ["/subscriptions", "/bugs", "/settings/mattermost", "/dashboard/projects/moamoa/community"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
});
