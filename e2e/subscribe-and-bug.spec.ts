import { expect, test } from "@playwright/test";

import { cleanup, createProject, createUser, signIn } from "./fixtures";

/**
 * 구독 해제·재구독과 버그 접수·처리. 로그인이 필요해 세션을 심고 돌린다.
 *
 * 계정과 프로젝트는 테스트마다 새로 만들고 끝나면 지운다. 앞선 검증이 고정 시드로
 * 돌렸다가 두 번째 실행에서 중복 데이터에 걸렸다.
 */
test.describe("구독과 버그 제보", () => {
  test("구독을 끊었다 다시 해도 알림은 꺼진 채로 시작한다", async ({ browser, baseURL }) => {
    const owner = await createUser();
    const reader = await createUser();
    const project = await createProject(owner.userId);

    const context = await browser.newContext();
    try {
      await signIn(context, reader.userId, baseURL!);
      const page = await context.newPage();
      await page.goto(`/projects/${project.slug}/community`);

      const subscribe = page.getByRole("checkbox", { name: "구독" });
      await subscribe.check();
      await page.getByRole("button", { name: "구독·알림 설정 저장" }).click();
      await expect(page.getByRole("status")).toContainText("저장했습니다");

      // 구독만으로는 알림이 켜지지 않는다.
      await page.reload();
      await expect(page.getByRole("checkbox", { name: "구독" })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: /업데이트·진행 소식 받기/ })).not.toBeChecked();
      await expect(page.getByRole("checkbox", { name: /모집 소식 받기/ })).not.toBeChecked();

      // 해제 후 재구독. 예전 설정이 되살아나면 사용자가 껐던 조작이 무효가 된다.
      await page.getByRole("checkbox", { name: "구독" }).uncheck();
      await page.getByRole("button", { name: "구독·알림 설정 저장" }).click();
      await expect(page.getByRole("status")).toContainText("구독을 해제");

      await page.reload();
      await page.getByRole("checkbox", { name: "구독" }).check();
      await page.getByRole("button", { name: "구독·알림 설정 저장" }).click();
      await page.reload();
      await expect(page.getByRole("checkbox", { name: /업데이트·진행 소식 받기/ })).not.toBeChecked();
    } finally {
      await context.close();
      await cleanup([owner.userId, reader.userId], [project.id]);
    }
  });

  test("제보한 버그를 관리 팀이 수정 완료로 바꾸면 제보자가 확인한다", async ({ browser, baseURL }) => {
    const owner = await createUser();
    const reporter = await createUser();
    const project = await createProject(owner.userId);

    const ownerContext = await browser.newContext();
    const reporterContext = await browser.newContext();

    // 같은 제목이 여러 번 실행에서 겹치면 locator 가 두 개를 잡는다.
    const title = `화면이 멈춥니다 ${Date.now()}`;

    try {
      await signIn(ownerContext, owner.userId, baseURL!);
      await signIn(reporterContext, reporter.userId, baseURL!);
      const ownerPage = await ownerContext.newPage();
      const reporterPage = await reporterContext.newPage();

      // ── 제보 ────────────────────────────────────────────────
      await reporterPage.goto(`/projects/${project.slug}/community`);
      await reporterPage.getByLabel("제목").fill(title);
      await reporterPage
        .getByLabel("재현 방법·기대 동작·실제 동작")
        .fill("로그인하고 마이페이지에 들어가면 화면이 비어 있습니다.");
      await reporterPage.getByRole("button", { name: "버그 제보하기" }).click();
      await expect(reporterPage.getByRole("status")).toContainText("제보했습니다");

      // ── 관리 팀이 처리한다 ──────────────────────────────────
      await ownerPage.goto(`/dashboard/projects/${project.slug}/community`);
      const card = ownerPage.locator("article, li, section").filter({ hasText: title }).last();
      await expect(card).toBeVisible();

      // 상태 선택은 이름이 아니라 폼 안의 select 로 잡는다. 라벨 문구가 바뀌어도 버틴다.
      await card.locator("select[name=status]").selectOption("FIXED");
      await card.getByRole("button", { name: /저장/ }).click();
      await expect(ownerPage.getByRole("status")).toContainText("저장했습니다");

      // ── 제보자가 결과를 본다 ────────────────────────────────
      await reporterPage.goto("/bugs");
      const mine = reporterPage.locator("article, li").filter({ hasText: title }).last();
      await expect(mine).toContainText("수정 완료");
    } finally {
      await ownerContext.close();
      await reporterContext.close();
      await cleanup([owner.userId, reporter.userId], [project.id]);
    }
  });
});
