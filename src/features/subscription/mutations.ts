import "server-only";

import type { ProjectNotificationTopic } from "@prisma/client";

import { db } from "@/lib/db";
import { ALL_TOPICS, type SubscriptionState } from "@/features/subscription/queries";

/**
 * 구독과 알림 동의를 바꾸는 실제 동작.
 *
 * Server Action(actions.ts)에서 인증만 떼어냈다. 여기 규칙들은 화면 없이도 검증할 수
 * 있어야 하는 것들이라 — 특히 "구독을 끊으면 알림도 지워진다" 는 —
 * 세션에 묶이지 않은 자리에 둔다.
 */

export class SubscriptionError extends Error {}

/**
 * 구독 켜고 끄기.
 *
 * **구독은 알림이 아니다.** 켤 때 알림 동의를 만들지 않는다. 밖으로 메시지를 보내도
 * 좋다는 허락은 사용자가 따로 해야 한다.
 *
 * 끊을 때는 동의를 함께 지운다. 남겨두면 다시 구독한 순간 예전 동의가 되살아나
 * 사용자가 켠 적 없는 알림이 온다. 껐던 조작이 무효가 되는 셈이다.
 */
export async function applySubscription(
  projectId: string,
  userId: string,
  subscribed: boolean,
): Promise<SubscriptionState> {
  if (subscribed) {
    await db.projectFollow.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId },
      update: {},
    });
    return { subscribed: true, topics: [] };
  }

  await db.$transaction([
    db.projectNotificationPref.deleteMany({ where: { projectId, userId } }),
    db.projectFollow.deleteMany({ where: { projectId, userId } }),
  ]);
  return { subscribed: false, topics: [] };
}

/**
 * 알림으로 받을 주제를 정한다. 빈 목록이면 전부 끈다.
 *
 * 구독하지 않은 상태에서는 켤 수 없다. 유튜브에서 구독하지 않고 종만 누를 수 없는
 * 것과 같고, 무엇보다 구독 해제가 알림 해제까지 확실히 덮으려면 이 순서가 지켜져야 한다.
 */
export async function applyNotificationTopics(
  projectId: string,
  userId: string,
  topics: ProjectNotificationTopic[],
): Promise<SubscriptionState> {
  const following = await db.projectFollow.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { createdAt: true },
  });
  if (!following) throw new SubscriptionError("먼저 구독해주세요.");

  const wanted = [...new Set(topics)].filter((t) => ALL_TOPICS.includes(t));

  await db.$transaction([
    db.projectNotificationPref.deleteMany({
      where: { projectId, userId, topic: { notIn: wanted } },
    }),
    ...wanted.map((topic) =>
      db.projectNotificationPref.upsert({
        where: { projectId_userId_topic: { projectId, userId, topic } },
        create: { projectId, userId, topic },
        update: {},
      }),
    ),
  ]);

  return { subscribed: true, topics: wanted };
}
