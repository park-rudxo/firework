import { expect, test } from "@playwright/test";

/**
 * 로그인 없이 확인할 수 있는 부분만 다룬다. 구독을 실제로 누르는 흐름은 소셜 OAuth 가
 * 필요해 여기서 재현할 수 없고, 그쪽 규칙(구독과 알림의 분리, 발송 직전 동의 확인)은
 * 진짜 Postgres 에 대고 도는 tests/db 가 덮는다.
 */

test("상세 화면에 구독 버튼과 진행 소식이 보인다", async ({ page }) => {
  await page.goto("/projects/moamoa");

  // 구독은 좋아요·써봤어요와 다른 버튼이다. 하나로 합치면 "관심은 있는데 알림은 싫다" 를
  // 표현할 방법이 없어진다.
  await expect(page.getByRole("button", { name: /구독/ })).toBeVisible();

  await expect(page.getByRole("heading", { name: "진행 소식" })).toBeVisible();
  await expect(page.getByText("v1.0 을 공개했습니다")).toBeVisible();
});

test("구독하지 않은 사람에게는 알림 버튼이 없다", async ({ page }) => {
  await page.goto("/projects/moamoa");

  // 종 버튼은 구독한 뒤에만 나타난다.
  await expect(page.getByRole("button", { name: "알림 설정" })).toHaveCount(0);
});

test("버그 제보는 로그인 안내로 막힌다", async ({ page }) => {
  await page.goto("/projects/moamoa");

  const section = page.locator("section", { has: page.getByRole("heading", { name: "버그 제보" }) });
  await expect(section.getByRole("link", { name: "로그인" })).toBeVisible();

  // 공개 화면에는 건수만 나온다. 제보 본문은 제보자와 관리 팀만 본다.
  await expect(section.getByText(/접수 \d+건 · 수정 완료 \d+건/)).toBeVisible();
  await expect(page.getByText("로그인하고 마이페이지에 들어가면")).toHaveCount(0);
});

test("알림 설정과 구독 목록은 로그인해야 볼 수 있다", async ({ page }) => {
  await page.goto("/settings/notifications");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/subscriptions");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("다른 팀의 제보 큐에는 들어갈 수 없다", async ({ page }) => {
  await page.goto("/dashboard/projects/moamoa/bugs");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("익명성 정책이 지킬 수 없는 약속을 하지 않는다", async ({ page }) => {
  await page.goto("/about/anonymity");

  await expect(page.getByRole("heading", { name: /작성자 정보 없이 전달됩니다/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "이건 저희가 막을 수 없습니다" })).toBeVisible();
  await expect(page.getByText("참여자가 적으면 표본 자체가 익명성을 깹니다")).toBeVisible();
});
