import { expect, test } from "@playwright/test";

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

/** 초대함에서 수락을 누른다. 완료를 기다리지 않는다. */
async function clickAccept(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  baseURL: string,
  invitee: Fixture,
  projectName: string,
) {
  const ctx = await browser.newContext();
  await signIn(ctx, invitee.userId, baseURL);
  const page = await ctx.newPage();
  await page.goto("/invitations");
  const card = page.getByRole("listitem").filter({ hasText: projectName });
  void card.getByRole("button", { name: "수락" }).click().catch(() => undefined);
  return ctx;
}

/** 팀 화면에서 초대 취소를 누른다. 완료를 기다리지 않는다. */
async function clickCancel(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  baseURL: string,
  owner: Fixture,
  slug: string,
) {
  const ctx = await browser.newContext();
  await signIn(ctx, owner.userId, baseURL);
  const page = await ctx.newPage();
  await page.goto(`/dashboard/projects/${slug}/team`);
  void page.getByRole("button", { name: "초대 취소" }).first().click().catch(() => undefined);
  return ctx;
}

/** 설정 화면에서 연결 해제를 누른다. 완료를 기다리지 않는다. */
async function clickDisconnect(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  baseURL: string,
  user: Fixture,
) {
  const ctx = await browser.newContext();
  await signIn(ctx, user.userId, baseURL);
  const page = await ctx.newPage();
  await page.goto("/settings/mattermost");
  void page
    .getByRole("button", { name: "연결 해제 및 알림 모두 끄기" })
    .click()
    .catch(() => undefined);
  return ctx;
}

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
  const contexts: Awaited<ReturnType<typeof clickAccept>>[] = [];

  const hold = await holdRowLock("project_invitation", invitation.id);
  try {
    contexts.push(await clickAccept(browser, baseURL!, invitee, project.name));
    contexts.push(await clickCancel(browser, baseURL!, owner, project.slug));

    // 둘 다 초대 행 앞에 멈춘 것을 확인한 뒤에 풀어준다.
    await hold.waitFor(2);
    await hold.release();

    // 둘 다 끝날 시간을 준다. 어느 쪽이 이기든 남는 상태는 하나여야 한다.
    await new Promise((r) => setTimeout(r, 3_000));

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
    for (const c of contexts) await c.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("연결 해제가 먼저 끝나면 그 뒤의 승인은 실패한다", async ({ browser, baseURL }) => {
  const { owner, invitee, project, invitation } = await stage();
  const contexts: Awaited<ReturnType<typeof clickAccept>>[] = [];

  const hold = await holdRowLock("project_invitation", invitation.id);
  try {
    // 승인을 먼저 띄워 초대 행 앞에 세운다. 이 시점에 인증 연결은 아직 살아 있다.
    contexts.push(await clickAccept(browser, baseURL!, invitee, project.name));
    await hold.waitFor(1);

    // 멈춰 있는 동안 연결을 해제한다. 초대 행과는 다른 행이라 막히지 않는다.
    contexts.push(await clickDisconnect(browser, baseURL!, invitee));
    await expect
      .poll(() => readMattermostUserId(invitee.userId), { timeout: 20_000 })
      .toBeNull();

    // 이제 승인을 풀어준다. 밖에서 확인하고 안에서 쓰는 구조였다면 여기서 통과한다.
    await hold.release();
    await new Promise((r) => setTimeout(r, 3_000));

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole, "인증이 끊긴 뒤의 승인은 팀원을 만들면 안 된다").toBeNull();
    expect(state.statuses, "실패한 승인은 초대 상태도 바꾸지 않는다").toEqual(["PENDING"]);
  } finally {
    await hold.release();
    for (const c of contexts) await c.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("승인이 먼저 끝나면 그 뒤에 연결을 해제해도 팀원은 남는다", async ({ browser, baseURL }) => {
  // 순차 실행이다. 해제가 이미 끝난 승인을 되돌리면 "합류했다" 를 본 사람이
  // 다음 화면에서 팀원이 아니게 된다.
  const { owner, invitee, project } = await stage();
  const contexts: Awaited<ReturnType<typeof clickAccept>>[] = [];

  try {
    contexts.push(await clickAccept(browser, baseURL!, invitee, project.name));
    await expect
      .poll(() => readInviteState(project.id, invitee.userId).then((s) => s.memberRole), {
        timeout: 20_000,
      })
      .toBe("MAINTAINER");

    contexts.push(await clickDisconnect(browser, baseURL!, invitee));
    await expect
      .poll(() => readMattermostUserId(invitee.userId), { timeout: 20_000 })
      .toBeNull();

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole).toBe("MAINTAINER");
    expect(state.statuses).toEqual(["ACCEPTED"]);
  } finally {
    for (const c of contexts) await c.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("승인이 인증 연결 행 앞에서 멈추는 것을 관찰한다", async ({ browser, baseURL }) => {
  // 확인과 쓰기 사이가 벌어지지 않으려면, 대조가 트랜잭션 **안** 에서 그 행을 잠근 채
  // 이뤄져야 한다. 검사 쪽이 그 행을 잡고 있으면 승인은 반드시 멈춰야 한다.
  const { owner, invitee, project } = await stage();
  const contexts: Awaited<ReturnType<typeof clickAccept>>[] = [];

  const hold = await holdRowLock("MattermostIdentity", invitee.userId, "userId");
  try {
    contexts.push(await clickAccept(browser, baseURL!, invitee, project.name));
    await hold.waitFor(1);

    const during = await readInviteState(project.id, invitee.userId);
    expect(during.memberRole, "인증 행을 잠그기 전에 팀원이 만들어지면 안 된다").toBeNull();
    expect(during.statuses).toEqual(["PENDING"]);

    await hold.release();
    await expect
      .poll(() => readInviteState(project.id, invitee.userId).then((s) => s.memberRole), {
        timeout: 20_000,
      })
      .toBe("MAINTAINER");
  } finally {
    await hold.release();
    for (const c of contexts) await c.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});

test("이미 팀원이면 승인해도 역할이 덮이지 않는다", async ({ browser, baseURL }) => {
  // 등록자가 정해둔 역할이 오래된 초대 한 장으로 바뀌면 안 된다.
  const { owner, invitee, project } = await stage();
  await addMember(project.id, invitee.userId, "CONTRIBUTOR");
  const contexts: Awaited<ReturnType<typeof clickAccept>>[] = [];

  try {
    contexts.push(await clickAccept(browser, baseURL!, invitee, project.name));
    await new Promise((r) => setTimeout(r, 3_000));

    const state = await readInviteState(project.id, invitee.userId);
    expect(state.memberRole, "MAINTAINER 초대를 수락해도 그대로 CONTRIBUTOR").toBe("CONTRIBUTOR");
    expect(state.statuses).toEqual(["PENDING"]);
  } finally {
    for (const c of contexts) await c.close();
    await cleanup([owner.userId, invitee.userId], [project.id]);
  }
});
