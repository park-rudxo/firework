import { expect, test } from "@playwright/test";

import {
  cleanup,
  createProject,
  createUser,
  disconnectMattermost,
  readInviteState,
  reconnectMattermost,
  signIn,
} from "./fixtures";

/**
 * 초대는 계정이 아니라 **그때 확인된 Mattermost 사용자** 에게 건 것이다.
 *
 * 계정만 보면, A 로 인증받아 초대받은 뒤 A 연결을 끊고 B 를 붙여도 그 초대를 수락할 수
 * 있다. 초대한 사람은 A 를 보고 초대했는데 팀에는 B 가 들어온다.
 */

/** 등록자로 로그인해 검색·초대까지 마친다. */
async function invite(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  baseURL: string,
  owner: { userId: string },
  invitee: { mattermostUsername: string },
  slug: string,
) {
  const ctx = await browser.newContext();
  await signIn(ctx, owner.userId, baseURL);
  const page = await ctx.newPage();
  await page.goto(`/dashboard/projects/${slug}/team?q=${invitee.mattermostUsername}`);

  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "팀원 초대" }),
  });
  const row = section.getByRole("listitem").filter({ hasText: `@${invitee.mattermostUsername}` });
  await row.getByRole("combobox").selectOption("MAINTAINER");
  await row.getByRole("button", { name: "초대" }).click();
  await expect(page.getByRole("status")).toContainText("수락해야");
  await ctx.close();
}

/** 초대받은 사람으로 로그인해 수락을 눌러본다. 결과 메시지를 돌려준다. */
async function tryAccept(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  baseURL: string,
  invitee: { userId: string },
  projectName: string,
) {
  const ctx = await browser.newContext();
  await signIn(ctx, invitee.userId, baseURL);
  const page = await ctx.newPage();
  await page.goto("/invitations");

  const card = page.getByRole("listitem").filter({ hasText: projectName });
  await card.getByRole("button", { name: "수락" }).click();
  await page.waitForTimeout(1500);

  const url = page.url();
  const alert = await page
    .getByRole("alert")
    .first()
    .textContent()
    .catch(() => null);
  await ctx.close();
  return { url, alert };
}

test("초대받을 때와 다른 Mattermost 계정으로는 수락할 수 없다", async ({ browser, baseURL }) => {
  const owner = await createUser();
  const invitee = await createUser();
  const project = await createProject(owner.userId);

  try {
    await invite(browser, baseURL!, owner, invitee, project.slug);

    // A 를 끊고 B 를 붙인다. firework 계정은 그대로다.
    await reconnectMattermost(invitee.userId, `mm-swapped-${Date.now()}`);

    const result = await tryAccept(browser, baseURL!, invitee, project.name);
    expect(result.alert ?? "").toContain("다른 Mattermost 계정");
    expect(result.url).toContain("/invitations");

    // 실패했으면 아무것도 남지 않아야 한다 — 멤버십도, 수락 처리도.
    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole).toBeNull();
    expect(state.statuses).toEqual(["PENDING"]);
  } finally {
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("원래 계정으로 돌아오면 정상 수락된다", async ({ browser, baseURL }) => {
  const owner = await createUser();
  const invitee = await createUser();
  const project = await createProject(owner.userId);

  try {
    await invite(browser, baseURL!, owner, invitee, project.slug);
    await reconnectMattermost(invitee.userId, `mm-swapped-${Date.now()}`);
    await tryAccept(browser, baseURL!, invitee, project.name);

    // 초대 시점의 id 로 되돌린다.
    await reconnectMattermost(invitee.userId, `mm-${invitee.mattermostUsername.split(".")[1]}`);
    const ok = await tryAccept(browser, baseURL!, invitee, project.name);
    expect(ok.url).toContain("/dashboard/projects/");

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole).toBe("MAINTAINER");
    expect(state.statuses).toEqual(["ACCEPTED"]);
  } finally {
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("연결을 아예 해제하면 수락할 수 없다", async ({ browser, baseURL }) => {
  const owner = await createUser();
  const invitee = await createUser();
  const project = await createProject(owner.userId);

  try {
    await invite(browser, baseURL!, owner, invitee, project.slug);
    await disconnectMattermost(invitee.userId);

    const result = await tryAccept(browser, baseURL!, invitee, project.name);
    expect(result.alert ?? "").toContain("Mattermost");

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole).toBeNull();
    expect(state.statuses).toEqual(["PENDING"]);
  } finally {
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});
