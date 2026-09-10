import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { seal } from "@/lib/secret-box";
import { resolveDeliveryTarget } from "@/features/mattermost/deliver";
import { enqueueOutbound, notifySubscribers } from "@/features/notification/dispatch";
import { applyNotificationTopics, applySubscription } from "@/features/subscription/mutations";
import { makeProject, makeUser, resetDb } from "./helpers";

const WEBHOOK = "https://meeting.ssafy.test/hooks/abcdef123456";

/**
 * 발송 직전 확인.
 *
 * 큐에 넣는 시점과 보내는 시점 사이에 사람은 구독을 끊고, 알림을 끄고, 계정 연결을
 * 해제한다. 넣을 때 확인한 것으로 충분하다고 보면 그 취소들이 전부 무시된다.
 * 그래서 보내기 직전에 처음부터 다시 확인하고, 이 파일이 그 확인을 지킨다.
 */
describe("Mattermost 발송 직전 동의 확인", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let reader: Awaited<ReturnType<typeof makeUser>>;
  let project: Awaited<ReturnType<typeof makeProject>>;

  const link = async (userId: string, overrides: Record<string, unknown> = {}) =>
    db.mattermostAccount.create({
      data: {
        userId,
        mattermostUserId: `mm-${userId.slice(0, 8)}`,
        username: "kim.ssafy",
        serverUrl: "https://meeting.ssafy.test",
        verifiedAt: new Date(),
        webhookUrlEnc: seal(WEBHOOK),
        deliveryEnabled: true,
        ...overrides,
      },
    });

  const target = () =>
    resolveDeliveryTarget({ userId: reader.id, projectId: project.id, topic: "UPDATE" });

  beforeEach(async () => {
    await resetDb();
    process.env.BETTER_AUTH_SECRET ||= "test-secret-at-least-sixteen-characters";
    owner = await makeUser("16기_서울_1반_박제작");
    reader = await makeUser("16기_서울_2반_김구독");
    project = await makeProject(owner.id);

    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE"]);
  });

  it("계정 연결·전역 스위치·프로젝트 동의가 모두 있어야 보낸다", async () => {
    await link(reader.id);
    await expect(target()).resolves.toEqual({ webhookUrl: WEBHOOK, username: "kim.ssafy" });
  });

  it("계정을 연결하지 않았으면 보내지 않는다", async () => {
    await expect(target()).resolves.toBeNull();
  });

  it("전역 스위치가 꺼져 있으면 프로젝트 동의가 있어도 보내지 않는다", async () => {
    await link(reader.id, { deliveryEnabled: false });
    await expect(target()).resolves.toBeNull();
  });

  it("웹훅이 없으면 보낼 곳이 없다", async () => {
    await link(reader.id, { webhookUrlEnc: null });
    await expect(target()).resolves.toBeNull();
  });

  it("큐에 넣은 뒤 알림을 끄면 보내지 않는다", async () => {
    await link(reader.id);
    await enqueueOutbound([reader.id], { projectId: project.id, topic: "UPDATE", title: "소식" });

    await applyNotificationTopics(project.id, reader.id, []);
    await expect(target()).resolves.toBeNull();
  });

  it("큐에 넣은 뒤 구독을 끊으면 보내지 않는다", async () => {
    await link(reader.id);
    await enqueueOutbound([reader.id], { projectId: project.id, topic: "UPDATE", title: "소식" });

    await applySubscription(project.id, reader.id, false);
    await expect(target()).resolves.toBeNull();
  });

  it("연속 실패가 임계에 닿으면 스스로 멈춘다", async () => {
    await link(reader.id, { failureCount: 5 });
    await expect(target()).resolves.toBeNull();
  });

  it("계정 연결만 하고 알림을 켜지 않았으면 한 통도 나가지 않는다", async () => {
    // "인증하려고 연결했을 뿐" 인 사람에게 메시지가 가기 시작하면 안 된다.
    const bystander = await makeUser("16기_서울_3반_이인증");
    await link(bystander.id);

    const result = await notifySubscribers({
      projectId: project.id,
      topic: "UPDATE",
      type: "PROJECT_UPDATE_POSTED",
      title: "새 버전",
    });

    expect(result.queued).toBe(1); // 알림을 켠 reader 만
    const queued = await db.outboundMessage.findMany({ select: { userId: true } });
    expect(queued.map((q) => q.userId)).toEqual([reader.id]);
  });

  it("사이트 알림은 구독자 전원에게, 외부 발송은 켠 사람에게만 간다", async () => {
    const quiet = await makeUser("16기_서울_4반_최조용");
    await applySubscription(project.id, quiet.id, true); // 구독만, 알림은 끔

    const result = await notifySubscribers({
      projectId: project.id,
      topic: "UPDATE",
      type: "PROJECT_UPDATE_POSTED",
      title: "새 버전",
    });

    expect(result.inApp).toBe(2);
    expect(result.queued).toBe(1);
  });

  it("글쓴이 본인은 자기 소식 알림에서 빠진다", async () => {
    const result = await notifySubscribers({
      projectId: project.id,
      topic: "UPDATE",
      type: "PROJECT_UPDATE_POSTED",
      title: "새 버전",
      excludeUserIds: [reader.id],
    });

    expect(result.inApp).toBe(0);
    expect(result.queued).toBe(0);
  });
});
