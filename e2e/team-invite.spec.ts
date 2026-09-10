import { expect, test } from "@playwright/test";

import { cleanup, createProject, createUser, signIn } from "./fixtures";

/**
 * 초대 → 본인 승인 → 팀원. 로그인이 필요한 유일한 흐름이라 여기서만 세션을 심는다.
 *
 * 테스트마다 계정과 프로젝트를 새로 만들고 끝나면 지운다. 고정 시드를 쓰면 두 번째
 * 실행에서 "이미 팀원입니다" 로 실패한다.
 */
test.describe("팀 초대", () => {
  test("초대만으로는 권한이 생기지 않고, 본인이 수락해야 팀원이 된다", async ({ browser, baseURL }) => {
    const owner = await createUser();
    const invitee = await createUser();
    const project = await createProject(owner.userId);

    const ownerContext = await browser.newContext();
    const inviteeContext = await browser.newContext();

    try {
      await signIn(ownerContext, owner.userId, baseURL!);
      await signIn(inviteeContext, invitee.userId, baseURL!);

      const ownerPage = await ownerContext.newPage();
      const inviteePage = await inviteeContext.newPage();

      // ── 승인 전에는 관리 화면에 들어갈 수 없다 ──────────────
      await inviteePage.goto(`/dashboard/projects/${project.slug}/community`);
      await expect(inviteePage.getByRole("heading", { level: 1 })).not.toContainText("소식·버그 관리");

      // ── 등록자가 초대한다 ───────────────────────────────────
      await ownerPage.goto(`/dashboard/projects/${project.slug}/team`);
      await expect(ownerPage.getByRole("heading", { name: `${project.name} · 팀` })).toBeVisible();

      // 같은 사람이 검색 결과와 대기 목록 양쪽에 나오므로 섹션으로 좁힌다.
      // 좁히지 않으면 strict mode 에서 두 개가 잡혀 실패한다.
      const searchSection = ownerPage.locator("section", {
        has: ownerPage.getByRole("heading", { name: "팀원 초대" }),
      });

      await ownerPage.getByLabel("Mattermost 사용자명으로 검색").fill(invitee.mattermostUsername);
      await ownerPage.getByRole("button", { name: "찾기" }).click();

      const candidate = searchSection.getByRole("listitem").filter({
        hasText: `@${invitee.mattermostUsername}`,
      });
      await expect(candidate).toBeVisible();
      await candidate.getByRole("combobox").selectOption("MAINTAINER");
      await candidate.getByRole("button", { name: "초대" }).click();
      await expect(ownerPage.getByRole("status")).toContainText("수락해야");

      // 초대만으로는 팀원 목록에 오르지 않는다. 대기 목록에만 뜬다.
      const pendingSection = ownerPage.locator("section", {
        has: ownerPage.getByRole("heading", { name: "수락 대기 중" }),
      });
      await expect(pendingSection).toContainText(`@${invitee.mattermostUsername}`);

      const memberSection = ownerPage.locator("section", {
        has: ownerPage.getByRole("heading", { name: "팀원", exact: true }),
      });
      await expect(memberSection).not.toContainText(`@${invitee.mattermostUsername}`);

      // 다시 찾아도 초대 버튼 대신 대기 중이라고만 나온다.
      await expect(candidate).toContainText("수락 대기 중");

      // ── 아직도 권한이 없다 ─────────────────────────────────
      await inviteePage.goto(`/dashboard/projects/${project.slug}/community`);
      await expect(inviteePage.getByRole("heading", { level: 1 })).not.toContainText("소식·버그 관리");

      // ── 본인이 수락한다 ────────────────────────────────────
      await inviteePage.goto("/invitations");
      const invite = inviteePage.getByRole("listitem").filter({ hasText: project.name });
      await expect(invite).toBeVisible();
      await expect(invite).toContainText("공동 관리자");
      await invite.getByRole("button", { name: "수락" }).click();

      // ── 수락하면 그 프로젝트의 운영 화면으로 데려간다 ───────
      // 답한 초대는 목록에서 사라지므로, 결과를 카드 안에 두면 함께 없어진다.
      await expect(inviteePage).toHaveURL(
        new RegExp(`/dashboard/projects/${project.slug}/community`),
      );
      await expect(inviteePage.getByRole("status")).toContainText("팀에 합류했습니다");
      await expect(
        inviteePage.getByRole("heading", { name: `${project.name} · 소식·버그 관리` }),
      ).toBeVisible();

      // 공동 관리자여도 팀 구성은 바꾸지 못한다.
      await inviteePage.goto(`/dashboard/projects/${project.slug}/team`);
      await expect(inviteePage.getByRole("heading", { name: `${project.name} · 팀` })).toHaveCount(0);

      // ── 초대함은 비었다. 같은 초대를 두 번 수락할 수 없다 ────
      await inviteePage.goto("/invitations");
      await expect(inviteePage.getByText("받은 초대가 없습니다.")).toBeVisible();
    } finally {
      await ownerContext.close();
      await inviteeContext.close();
      await cleanup([owner.userId, invitee.userId], [project.id]);
    }
  });

  test("등록자가 아니면 팀 화면 자체가 열리지 않는다", async ({ browser, baseURL }) => {
    const owner = await createUser();
    const stranger = await createUser();
    const project = await createProject(owner.userId);

    const context = await browser.newContext();
    try {
      await signIn(context, stranger.userId, baseURL!);
      const page = await context.newPage();
      await page.goto(`/dashboard/projects/${project.slug}/team`);
      await expect(page.getByRole("heading", { name: `${project.name} · 팀` })).toHaveCount(0);
    } finally {
      await context.close();
      await cleanup([owner.userId, stranger.userId], [project.id]);
    }
  });

  test("Mattermost 인증을 안 한 사람은 검색되지 않는다", async ({ browser, baseURL }) => {
    const owner = await createUser();
    const unverified = await createUser({ verified: false });
    const project = await createProject(owner.userId);

    const context = await browser.newContext();
    try {
      await signIn(context, owner.userId, baseURL!);
      const page = await context.newPage();
      await page.goto(`/dashboard/projects/${project.slug}/team?q=${unverified.mattermostUsername}`);
      await expect(page.getByText("검색 결과가 없습니다")).toBeVisible();
    } finally {
      await context.close();
      await cleanup([owner.userId, unverified.userId], [project.id]);
    }
  });
});
