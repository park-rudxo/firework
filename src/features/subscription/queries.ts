import "server-only";

import type { ProjectNotificationTopic } from "@prisma/client";

import { db } from "@/lib/db";
import { projectCardSelect } from "@/features/project/queries";

export const TOPIC_LABEL: Record<ProjectNotificationTopic, string> = {
  UPDATE: "업데이트·진행 소식",
  RECRUITING: "참여 모집",
};

export const TOPIC_HINT: Record<ProjectNotificationTopic, string> = {
  UPDATE: "새 버전, 기능 추가, 출시 소식",
  RECRUITING: "베타 테스트, 설문, 이벤트",
};

export const ALL_TOPICS: ProjectNotificationTopic[] = ["UPDATE", "RECRUITING"];

export type SubscriptionState = {
  subscribed: boolean;
  topics: ProjectNotificationTopic[];
};

/** 구독하지 않은 상태. 알림도 당연히 꺼져 있다. */
export const NOT_SUBSCRIBED: SubscriptionState = { subscribed: false, topics: [] };

export async function getSubscriptionState(
  projectId: string,
  viewerId: string | undefined,
): Promise<SubscriptionState> {
  if (!viewerId) return NOT_SUBSCRIBED;

  const [follow, prefs] = await Promise.all([
    db.projectFollow.findUnique({
      where: { projectId_userId: { projectId, userId: viewerId } },
      select: { createdAt: true },
    }),
    db.projectNotificationPref.findMany({
      where: { projectId, userId: viewerId },
      select: { topic: true },
    }),
  ]);

  // 구독이 없으면 남은 동의 행이 있더라도 꺼진 것으로 본다.
  // 해제 시 함께 지우므로 정상적으로는 생기지 않지만, 화면이 DB 정합성보다
  // 사용자의 마지막 의사표시를 따르게 해둔다.
  if (!follow) return NOT_SUBSCRIBED;
  return { subscribed: true, topics: prefs.map((p) => p.topic) };
}

/** 내가 구독한 프로젝트. 알림을 켜둔 주제까지 함께 준다. */
export async function listMySubscriptions(viewerId: string) {
  const [follows, prefs] = await Promise.all([
    db.projectFollow.findMany({
      where: { userId: viewerId, project: { status: { not: "REMOVED" } } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, project: { select: projectCardSelect } },
    }),
    db.projectNotificationPref.findMany({
      where: { userId: viewerId },
      select: { projectId: true, topic: true },
    }),
  ]);

  const byProject = new Map<string, ProjectNotificationTopic[]>();
  for (const pref of prefs) {
    byProject.set(pref.projectId, [...(byProject.get(pref.projectId) ?? []), pref.topic]);
  }

  return follows.map((f) => ({
    subscribedAt: f.createdAt,
    project: f.project,
    topics: byProject.get(f.project.id) ?? [],
  }));
}

/**
 * 이 주제의 알림을 켜둔 구독자.
 *
 * 동의 행과 구독 행을 **둘 다** 확인한다. 동의 행만 보면, 구독을 끊었는데 지우기가
 * 실패해 남은 행 하나로 메시지가 계속 나간다.
 */
export async function subscriberIdsFor(
  projectId: string,
  topic: ProjectNotificationTopic,
): Promise<string[]> {
  const rows = await db.projectNotificationPref.findMany({
    where: { projectId, topic },
    select: { userId: true },
  });
  if (rows.length === 0) return [];

  const follows = await db.projectFollow.findMany({
    where: { projectId, userId: { in: rows.map((r) => r.userId) } },
    select: { userId: true },
  });
  return follows.map((f) => f.userId);
}

/** 구독자 수. 카드와 상세에 그대로 쓴다. */
export async function subscriberCount(projectId: string): Promise<number> {
  return db.projectFollow.count({ where: { projectId } });
}
