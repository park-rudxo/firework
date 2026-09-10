import "server-only";

import type { NotificationType, ProjectNotificationTopic } from "@prisma/client";

import { db } from "@/lib/db";
import { notifyMany } from "@/features/notification/create";
import { subscriberIdsFor } from "@/features/subscription/queries";

/**
 * 구독자에게 소식을 보낸다.
 *
 * 두 경로가 서로 다른 허락 위에서 움직인다.
 *
 *  - **사이트 알림**은 구독자 전원에게 간다. 구독은 "관심 목록에 담겠다" 는 뜻이고,
 *    사이트 알림은 본인이 들어와서 볼 때만 보이므로 밀어내는 성질이 없다.
 *  - **Mattermost 메시지**는 그 프로젝트의 그 주제에 알림을 직접 켠 사람에게만 간다.
 *    켠 적이 없으면 한 통도 나가지 않는다.
 *
 * 큐에 넣기만 하고 실제 발송은 deliverPending 이 한다. 넣는 시점과 보내는 시점
 * 사이에 구독을 끊는 사람이 있고, 그 취소가 지켜져야 하기 때문이다.
 */
export async function notifySubscribers({
  projectId,
  topic,
  type,
  title,
  body,
  url,
  excludeUserIds = [],
}: {
  projectId: string;
  topic: ProjectNotificationTopic;
  type: NotificationType;
  title: string;
  body?: string;
  url?: string;
  excludeUserIds?: string[];
}): Promise<{ inApp: number; queued: number }> {
  const excluded = new Set(excludeUserIds);

  const [followers, optedIn] = await Promise.all([
    db.projectFollow.findMany({ where: { projectId }, select: { userId: true } }),
    subscriberIdsFor(projectId, topic),
  ]);

  const inAppTargets = followers.map((f) => f.userId).filter((id) => !excluded.has(id));
  await notifyMany(inAppTargets, { type, title, body, url });

  const outboundTargets = optedIn.filter((id) => !excluded.has(id));
  await enqueueOutbound(outboundTargets, { projectId, topic, title, body, url });

  return { inApp: inAppTargets.length, queued: outboundTargets.length };
}

/** 외부 발송 큐에 넣는다. 여기서는 아무것도 보내지 않는다. */
export async function enqueueOutbound(
  userIds: string[],
  payload: {
    projectId?: string | null;
    topic?: ProjectNotificationTopic | null;
    title: string;
    body?: string;
    url?: string;
  },
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await db.outboundMessage.createMany({
      data: userIds.map((userId) => ({
        userId,
        projectId: payload.projectId ?? null,
        topic: payload.topic ?? null,
        title: payload.title,
        body: payload.body ?? null,
        url: payload.url ?? null,
      })),
    });
  } catch {
    // 알림은 부가 기능이다. 큐 적재가 실패해도 원래 작업(소식 게시 등)은 이미 끝났다.
  }
}
