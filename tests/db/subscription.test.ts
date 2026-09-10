import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  applyNotificationTopics,
  applySubscription,
  SubscriptionError,
} from "@/features/subscription/mutations";
import { getSubscriptionState, subscriberIdsFor } from "@/features/subscription/queries";
import { makeProject, makeUser, resetDb } from "./helpers";

/**
 * 이 파일이 지키는 약속 하나: **구독했다는 사실만으로는 밖으로 아무것도 나가지 않는다.**
 *
 * 알림은 기본이 꺼짐이고, 켜는 것은 사용자의 별도 행동이며, 구독을 끊으면 그 허락도
 * 함께 사라진다. 하나라도 무너지면 켠 적 없는 알림이 남의 채팅창에 도착한다.
 */
describe("구독과 알림 동의", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let reader: Awaited<ReturnType<typeof makeUser>>;
  let project: Awaited<ReturnType<typeof makeProject>>;

  beforeEach(async () => {
    await resetDb();
    owner = await makeUser("16기_서울_1반_박제작");
    reader = await makeUser("16기_서울_2반_김구독");
    project = await makeProject(owner.id);
  });

  it("구독만으로는 알림 동의가 생기지 않는다", async () => {
    await applySubscription(project.id, reader.id, true);

    const state = await getSubscriptionState(project.id, reader.id);
    expect(state.subscribed).toBe(true);
    expect(state.topics).toEqual([]);

    expect(await subscriberIdsFor(project.id, "UPDATE")).toEqual([]);
    expect(await subscriberIdsFor(project.id, "RECRUITING")).toEqual([]);
  });

  it("구독하지 않은 사람은 알림을 켤 수 없다", async () => {
    await expect(applyNotificationTopics(project.id, reader.id, ["UPDATE"])).rejects.toBeInstanceOf(
      SubscriptionError,
    );
    expect(await db.projectNotificationPref.count()).toBe(0);
  });

  it("켠 주제만 발송 대상이 된다", async () => {
    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE"]);

    expect(await subscriberIdsFor(project.id, "UPDATE")).toEqual([reader.id]);
    expect(await subscriberIdsFor(project.id, "RECRUITING")).toEqual([]);
  });

  it("구독을 끊으면 알림 동의도 함께 지워진다", async () => {
    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE", "RECRUITING"]);
    expect(await db.projectNotificationPref.count()).toBe(2);

    await applySubscription(project.id, reader.id, false);
    expect(await db.projectNotificationPref.count()).toBe(0);
  });

  it("다시 구독해도 예전 알림이 되살아나지 않는다", async () => {
    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE"]);
    await applySubscription(project.id, reader.id, false);

    // 여기가 핵심이다. 다시 구독했을 때 "원래 켜져 있었으니까" 로 복원하면,
    // 알림을 껐던 조작이 무효가 된다.
    const again = await applySubscription(project.id, reader.id, true);
    expect(again.topics).toEqual([]);
    expect(await subscriberIdsFor(project.id, "UPDATE")).toEqual([]);
  });

  it("빈 목록을 주면 전부 꺼진다", async () => {
    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE", "RECRUITING"]);

    const state = await applyNotificationTopics(project.id, reader.id, []);
    expect(state.topics).toEqual([]);
    expect(await db.projectNotificationPref.count()).toBe(0);
  });

  it("한 주제만 끄면 나머지는 남는다", async () => {
    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE", "RECRUITING"]);

    await applyNotificationTopics(project.id, reader.id, ["RECRUITING"]);
    expect(await subscriberIdsFor(project.id, "UPDATE")).toEqual([]);
    expect(await subscriberIdsFor(project.id, "RECRUITING")).toEqual([reader.id]);
  });

  it("구독 행이 없으면 남은 동의 행이 있어도 꺼진 것으로 본다", async () => {
    await applySubscription(project.id, reader.id, true);
    await applyNotificationTopics(project.id, reader.id, ["UPDATE"]);

    // 정상 경로로는 생기지 않는 상태지만, 화면은 DB 정합성보다 사용자의 마지막
    // 의사표시를 따라야 한다.
    await db.projectFollow.deleteMany({ where: { projectId: project.id, userId: reader.id } });

    const state = await getSubscriptionState(project.id, reader.id);
    expect(state).toEqual({ subscribed: false, topics: [] });
  });

  it("로그인하지 않은 사람에게는 아무 상태도 없다", async () => {
    expect(await getSubscriptionState(project.id, undefined)).toEqual({
      subscribed: false,
      topics: [],
    });
  });
});
