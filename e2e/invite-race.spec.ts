import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page, Response } from "@playwright/test";

import {
  addMember,
  cleanup,
  createInvitation,
  createProject,
  createUser,
  holdRowLock,
  readInviteState,
  readMattermostUserId,
  signIn,
  type Fixture,
} from "./fixtures";

/**
 * 초대 승인이 다른 조작과 겹칠 때. **실제 PostgreSQL 에서 겹침을 만들어 확인한다.**
 *
 * 승인은 초대 상태 전환과 ProjectMember 생성을 한 트랜잭션에서 한다. 그 트랜잭션이
 * 취소·연결 해제·계정 교체와 겹치면, 확인한 것과 쓰는 것 사이가 벌어질 수 있다.
 * 남는 상태는 언제나 하나여야 한다 — 초대 상태 하나와 그것에 맞는 멤버십.
 *
 * 겹침은 운에 맡기지 않는다. 검사 쪽이 초대 행(또는 인증 연결 행)을 먼저 잠그고,
 * 요청들이 그 앞에 멈춘 것을 확인한 뒤 풀어준다.
 */

/**
 * 이 파일은 순차로 돈다. 배리어가 서버 트랜잭션을 멈춰 세운 채로 두므로, 파일 안의
 * 검사까지 병렬로 퍼지면(프로젝트 설정이 fullyParallel 이다) 멈춘 트랜잭션이 Prisma
 * 커넥션 풀을 다 차지한다. 그러면 뒤의 제출은 잠금까지 가지도 못하고 풀을 기다린다.
 */
test.describe.configure({ mode: "default", timeout: 90_000 });

/**
 * 서버 액션 요청 하나. **누른 사실과 끝난 사실을 둘 다 잡아둔다.**
 *
 * 클릭 실패를 삼키고 잠시 뒤 상태만 보면, 아무 일도 일어나지 않은 것과 "처리했는데
 * 거절됐다" 가 구분되지 않는다. 선택자가 어긋나 클릭이 안 돼도 "멤버십 없음" 은
 * 그대로라 검사가 통과한다. 그래서 클릭은 기다려서 던지게 두고, 요청의 응답도 잡는다.
 */
type Action = {
  ctx: BrowserContext;
  page: Page;
  /** 서버 액션 POST 가 끝날 때까지. 배리어를 푼 뒤에 기다린다. */
  done: Promise<Response>;
};

async function act(
  browser: Browser,
  baseURL: string,
  user: Fixture,
  path: string,
  press: (page: Page) => Promise<void>,
): Promise<Action> {
  const ctx = await browser.newContext();
  await signIn(ctx, user.userId, baseURL);
  const page = await ctx.newPage();
  await page.goto(path);
  // 누르기 전에 걸어둔다. 누른 뒤에 걸면 빠른 응답을 놓친다.
  const done = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes(path),
    { timeout: 60_000 },
  );
  await press(page);
  return { ctx, page, done };
}

/** 요청이 실제로 서버까지 갔고 오류 없이 끝났는지. */
async function expectHandled(action: Action) {
  const response = await action.done;
  expect(response.status(), "서버 액션이 오류 없이 끝나야 한다").toBeLessThan(400);
}

const accept = (browser: Browser, baseURL: string, invitee: Fixture, projectName: string) =>
  act(browser, baseURL, invitee, "/invitations", async (page) => {
    const card = page.getByRole("listitem").filter({ hasText: projectName });
    await card.getByRole("button", { name: "수락" }).click();
  });

const cancel = (browser: Browser, baseURL: string, owner: Fixture, slug: string) =>
  act(browser, baseURL, owner, `/dashboard/projects/${slug}/team`, async (page) => {
    await page.getByRole("button", { name: "초대 취소" }).first().click();
  });

const disconnect = (browser: Browser, baseURL: string, user: Fixture) =>
  act(browser, baseURL, user, "/settings/mattermost", async (page) => {
    await page.getByRole("button", { name: "연결 해제 및 알림 모두 끄기" }).click();
  });

async function stage() {
  const owner = await createUser();
  const invitee = await createUser();
  const project = await createProject(owner.userId);
  const mattermostUserId = (await readMattermostUserId(invitee.userId))!;
  const invitation = await createInvitation(project.id, owner.userId, {
    userId: invitee.userId,
    mattermostUserId,
  });
  return { owner, invitee, project, invitation, mattermostUserId };
}

test("승인과 취소가 겹쳐도 최종 상태는 하나고 멤버십이 그것과 맞는다", async ({
  browser,
  baseURL,
}) => {
  const { owner, invitee, project, invitation } = await stage();
  const open: Action[] = [];

  const hold = await holdRowLock("project_invitation", invitation.id);
  try {
    open.push(await accept(browser, baseURL!, invitee, project.name));
    open.push(await cancel(browser, baseURL!, owner, project.slug));

    // 둘 다 초대 행 앞에 멈춘 것을 확인한 뒤에 풀어준다.
    await hold.waitFor(2);
    await hold.release();

    // 둘 다 서버까지 갔고 끝났다는 것을 확인한 뒤에야 상태를 본다.
    for (const a of open) await expectHandled(a);

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.statuses, "초대는 한 장이고 상태도 하나다").toHaveLength(1);
    const status = state.statuses[0]!;
    expect(["ACCEPTED", "CANCELLED"]).toContain(status);
    if (status === "ACCEPTED") {
      expect(state.memberRole, "수락이 이겼으면 팀원이 있어야 한다").toBe("MAINTAINER");
    } else {
      expect(state.memberRole, "취소가 이겼으면 팀원이 없어야 한다").toBeNull();
    }
  } finally {
    await hold.release();
    for (const a of open) await a.ctx.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("연결 해제가 먼저 끝나면 그 뒤의 승인은 실패한다", async ({ browser, baseURL }) => {
  const { owner, invitee, project, invitation } = await stage();
  const open: Action[] = [];

  const hold = await holdRowLock("project_invitation", invitation.id);
  try {
    // 승인을 먼저 띄워 초대 행 앞에 세운다. 이 시점에 인증 연결은 아직 살아 있다.
    const accepting = await accept(browser, baseURL!, invitee, project.name);
    open.push(accepting);
    await hold.waitFor(1);

    // 멈춰 있는 동안 연결을 해제한다. 초대 행과는 다른 행이라 막히지 않는다.
    const disconnecting = await disconnect(browser, baseURL!, invitee);
    open.push(disconnecting);
    await expectHandled(disconnecting);
    expect(await readMattermostUserId(invitee.userId)).toBeNull();

    // 이제 승인을 풀어준다. 밖에서 확인하고 안에서 쓰는 구조였다면 여기서 통과한다.
    await hold.release();
    await expectHandled(accepting);

    // 처리된 끝에 거절됐다는 것까지 화면에서 확인한다. 클릭이 안 된 것과 구분된다.
    await expect(accepting.page.getByRole("alert").first()).toContainText("Mattermost", {
      timeout: 30_000,
    });

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole, "인증이 끊긴 뒤의 승인은 팀원을 만들면 안 된다").toBeNull();
    expect(state.statuses, "실패한 승인은 초대 상태도 바꾸지 않는다").toEqual(["PENDING"]);
  } finally {
    await hold.release();
    for (const a of open) await a.ctx.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("승인이 먼저 끝나면 그 뒤에 연결을 해제해도 팀원은 남는다", async ({ browser, baseURL }) => {
  // 순차 실행이다. 이미 끝난 승인을 해제가 되돌리면 "합류했다" 를 본 사람이
  // 다음 화면에서 팀원이 아니게 된다.
  const { owner, invitee, project } = await stage();
  const open: Action[] = [];

  try {
    const accepting = await accept(browser, baseURL!, invitee, project.name);
    open.push(accepting);
    await expectHandled(accepting);
    expect((await readInviteState(project.id, invitee.userId)).memberRole).toBe("MAINTAINER");

    const disconnecting = await disconnect(browser, baseURL!, invitee);
    open.push(disconnecting);
    await expectHandled(disconnecting);
    expect(await readMattermostUserId(invitee.userId)).toBeNull();

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole).toBe("MAINTAINER");
    expect(state.statuses).toEqual(["ACCEPTED"]);
  } finally {
    for (const a of open) await a.ctx.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("승인은 팀원을 만들기 전에 인증 연결 행을 먼저 잡는다", async ({ browser, baseURL }) => {
  // 확인과 쓰기 사이가 벌어지지 않으려면 대조가 트랜잭션 안에서 그 행을 잠근 채
  // 이뤄져야 한다. 멈춘 것만으로는 부족하므로, 멈춘 세션이 무엇을 이미 쥐고 있는지 본다.
  const { owner, invitee, project } = await stage();
  const open: Action[] = [];

  const hold = await holdRowLock("MattermostIdentity", invitee.userId, "userId");
  try {
    const accepting = await accept(browser, baseURL!, invitee, project.name);
    open.push(accepting);
    await hold.waitFor(1);

    const held = await hold.relationsHeldByWaiters();
    expect(held, "인증 연결 행까지는 갔어야 한다").toContain("MattermostIdentity");
    expect(held, "대조가 끝나기 전에 팀원을 만들면 안 된다").not.toContain("project_member");

    await hold.release();
    await expectHandled(accepting);
    expect((await readInviteState(project.id, invitee.userId)).memberRole).toBe("MAINTAINER");
  } finally {
    await hold.release();
    for (const a of open) await a.ctx.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("이미 팀원이면 승인해도 역할이 덮이지 않는다", async ({ browser, baseURL }) => {
  // 등록자가 정해둔 역할이 오래된 초대 한 장으로 바뀌면 안 된다.
  const { owner, invitee, project } = await stage();
  await addMember(project.id, invitee.userId, "CONTRIBUTOR");
  const open: Action[] = [];

  try {
    const accepting = await accept(browser, baseURL!, invitee, project.name);
    open.push(accepting);
    await expectHandled(accepting);
    // 처리한 끝에 거절했다는 것까지 확인한다.
    await expect(accepting.page.getByRole("alert").first()).toContainText("이미", {
      timeout: 30_000,
    });

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole, "MAINTAINER 초대를 수락해도 그대로 CONTRIBUTOR").toBe("CONTRIBUTOR");
    expect(state.statuses).toEqual(["PENDING"]);
  } finally {
    for (const a of open) await a.ctx.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});
