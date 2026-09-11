import { expect, test } from "@playwright/test";

import {
  cleanup,
  countPerUser,
  createProject,
  createSurvey,
  createUser,
  readSurveyState,
  signIn,
  type SurveyState,
} from "./fixtures";

/**
 * 묶음 공개의 동시성. **실제 PostgreSQL 을 지나는 경로로만 확인한다.**
 *
 * 트랜잭션만으로는 같은 설문의 제출이 직렬화되지 않는다. 기존 2건인 설문에 두 사람이
 * 동시에 내면 각 트랜잭션이 자기 응답을 넣고 각자 "3건이 됐다" 고 보아 둘 다 묶음을
 * 열 수 있다. 그러면 4건이 공개되고, 두 사람은 각각 나머지 하나가 상대의 것임을 안다.
 * 목으로는 이 경합이 재현되지 않는다.
 */

/** 몇 명이 동시에 제출하고, 끝난 뒤 불변식을 확인한다. */
async function submitTogether(
  browser: Parameters<Parameters<typeof test>[1]>[0]["browser"],
  baseURL: string,
  slug: string,
  count: number,
) {
  const users = await Promise.all(Array.from({ length: count }, () => createUser()));
  const contexts = await Promise.all(users.map(() => browser.newContext()));

  await Promise.all(contexts.map((c, i) => signIn(c, users[i]!.userId, baseURL)));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  // 먼저 전부 폼을 열어두고, 제출만 동시에 터뜨린다.
  await Promise.all(pages.map((p) => p.goto(`/projects/${slug}/survey`)));
  await Promise.all(
    pages.map((p, i) => p.getByLabel("한마디").fill(`동시응답${i}`)),
  );
  await Promise.all(
    pages.map((p) => p.getByRole("button", { name: "익명으로 제출" }).click()),
  );
  // 제출 직후 revalidate 가 돌면 폼의 성공 화면 대신 "이미 응답하셨습니다" 가 뜬다.
  // 둘 중 무엇이 나오든 제출은 끝난 것이다.
  await Promise.all(
    pages.map((p) =>
      p.getByText(/응답 완료|이미 응답하셨습니다/).first().waitFor({ timeout: 20_000 }),
    ),
  );

  await Promise.all(contexts.map((c) => c.close()));
  return users;
}

/** 공개 수는 언제나 3의 배수만큼 늘고, 남은 비공개는 0~2건이다. */
function expectInvariants(before: SurveyState, after: SurveyState) {
  const opened = after.revealed - before.revealed;
  expect(opened % 3, `공개 증가량 ${opened} 은 3의 배수여야 한다`).toBe(0);
  expect(opened).toBeGreaterThanOrEqual(0);
  expect(after.hidden, `남은 비공개 ${after.hidden} 건은 3건 미만이어야 한다`).toBeLessThan(3);
  // 한 번 공개된 것은 계속 공개돼 있어야 한다. 아니면 그 차이가 신규 응답을 가리킨다.
  for (const id of before.revealedIds) expect(after.revealedIds).toContain(id);
}

for (const start of [0, 1, 2, 3]) {
  test(`기존 ${start}건에서 3명이 동시에 제출해도 묶음이 어긋나지 않는다`, async ({
    browser,
    baseURL,
  }) => {
    const owner = await createUser();
    const project = await createProject(owner.userId);
    const survey = await createSurvey(project.id, { existingResponses: start });

    const before = await readSurveyState(survey.id);
    let users: Awaited<ReturnType<typeof submitTogether>> = [];
    try {
      users = await submitTogether(browser, baseURL!, project.slug, 3);

      const after = await readSurveyState(survey.id);
      expect(after.total).toBe(start + 3);
      expectInvariants(before, after);

      // 각자 한 번씩만 들어갔는지
      for (const u of users) {
        const counts = await countPerUser(survey.id, u.userId);
        expect(counts.participations).toBe(1);
      }
    } finally {
      await cleanup([owner.userId, ...users.map((u) => u.userId)], [project.id]);
    }
  });
}

test("예전에 5건이 전부 공개된 설문은 다시 감춰지지 않는다", async ({ browser, baseURL }) => {
  const owner = await createUser();
  const project = await createProject(owner.userId);
  // 예전 구현에서는 3건 이상이면 전부 보였다. 그 상태를 그대로 만든다.
  const survey = await createSurvey(project.id, { existingResponses: 5, existingRevealed: 5 });

  const before = await readSurveyState(survey.id);
  expect(before.revealed).toBe(5);

  let users: Awaited<ReturnType<typeof submitTogether>> = [];
  try {
    // 새 응답 1·2건에서는 그대로 5건이어야 한다.
    users = await submitTogether(browser, baseURL!, project.slug, 2);
    let after = await readSurveyState(survey.id);
    expect(after.total).toBe(7);
    expect(after.revealed, "새 응답이 2건뿐이면 아직 열리지 않는다").toBe(5);
    expectInvariants(before, after);

    // 세 번째가 들어오면 8건이 된다 — 전체 건수가 아니라 안 열린 건수로 세기 때문이다.
    const more = await submitTogether(browser, baseURL!, project.slug, 1);
    users = [...users, ...more];
    after = await readSurveyState(survey.id);
    expect(after.total).toBe(8);
    expect(after.revealed).toBe(8);
    expect(after.hidden).toBe(0);
  } finally {
    await cleanup([owner.userId, ...users.map((u) => u.userId)], [project.id]);
  }
});

test("같은 사람이 동시에 두 번 내도 한 번만 들어간다", async ({ browser, baseURL }) => {
  const owner = await createUser();
  const responder = await createUser();
  const project = await createProject(owner.userId);
  const survey = await createSurvey(project.id);

  const context = await browser.newContext();
  try {
    await signIn(context, responder.userId, baseURL!);
    const a = await context.newPage();
    const b = await context.newPage();

    await Promise.all([a.goto(`/projects/${project.slug}/survey`), b.goto(`/projects/${project.slug}/survey`)]);
    await Promise.all([a.getByLabel("한마디").fill("첫번째"), b.getByLabel("한마디").fill("두번째")]);
    await Promise.all([
      a.getByRole("button", { name: "익명으로 제출" }).click().catch(() => undefined),
      b.getByRole("button", { name: "익명으로 제출" }).click().catch(() => undefined),
    ]);
    await a.waitForTimeout(3_000);

    const state = await readSurveyState(survey.id);
    expect(state.total, "응답은 한 건만 남아야 한다").toBe(1);
    const counts = await countPerUser(survey.id, responder.userId);
    expect(counts.participations).toBe(1);
  } finally {
    await context.close();
    await cleanup([owner.userId, responder.userId], [project.id]);
  }
});
