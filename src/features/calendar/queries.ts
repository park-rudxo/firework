import "server-only";

import { db } from "@/lib/db";
import { PUBLIC_FILTER } from "@/features/project/queries";
import type { ProjectEventType } from "@prisma/client";

export const EVENT_TYPE_LABEL: Record<ProjectEventType, string> = {
  TEST: "베타 테스트",
  UPDATE: "업데이트",
  SURVEY: "설문",
  RELEASE: "정식 출시",
  RAFFLE: "추첨",
  MILESTONE: "마일스톤",
  OTHER: "기타",
};

/** 캘린더에서 타입을 구분하는 색. globals.css 의 토큰과 같은 계열로 맞췄다. */
export const EVENT_TYPE_COLOR: Record<ProjectEventType, string> = {
  TEST: "oklch(0.62 0.16 250)",
  UPDATE: "oklch(0.62 0.14 200)",
  SURVEY: "oklch(0.62 0.16 155)",
  RELEASE: "oklch(0.58 0.2 28)",
  RAFFLE: "oklch(0.65 0.16 60)",
  MILESTONE: "oklch(0.6 0.14 300)",
  OTHER: "oklch(0.6 0.02 265)",
};

export const eventSelect = {
  id: true,
  type: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  url: true,
  project: { select: { slug: true, name: true, iconUrl: true } },
} as const;

export type CalendarEvent = Awaited<ReturnType<typeof listEvents>>[number];

/**
 * 일정 조회.
 *
 * 프로젝트가 공개 상태인 것만 본다. 비공개(DRAFT)·숨김(HIDDEN)·삭제(REMOVED)
 * 프로젝트의 일정은 어떤 뷰에도 새면 안 된다.
 */
export async function listEvents({
  from,
  to,
  followedBy,
  types,
}: {
  from: Date;
  to: Date;
  /** 지정하면 그 사용자가 구독한 프로젝트의 일정만 본다. */
  followedBy?: string;
  types?: ProjectEventType[];
}) {
  return db.projectEvent.findMany({
    where: {
      // 기간이 겹치는 일정. 종료일이 없으면 시작일 하나만 본다.
      OR: [
        { startsAt: { gte: from, lte: to } },
        { endsAt: { gte: from, lte: to } },
        { AND: [{ startsAt: { lte: from } }, { endsAt: { gte: to } }] },
      ],
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
      project: {
        ...PUBLIC_FILTER,
        ...(followedBy ? { follows: { some: { userId: followedBy } } } : {}),
      },
    },
    orderBy: { startsAt: "asc" },
    select: eventSelect,
  });
}

export async function listUpcoming({
  followedBy,
  limit = 10,
}: {
  followedBy?: string;
  limit?: number;
}) {
  const now = new Date();
  return db.projectEvent.findMany({
    where: {
      OR: [{ startsAt: { gte: now } }, { endsAt: { gte: now } }],
      project: {
        ...PUBLIC_FILTER,
        ...(followedBy ? { follows: { some: { userId: followedBy } } } : {}),
      },
    },
    orderBy: { startsAt: "asc" },
    take: limit,
    select: eventSelect,
  });
}

/** 프로젝트 상세의 타임라인 섹션용. */
export async function listProjectEvents(projectId: string) {
  return db.projectEvent.findMany({
    where: { projectId },
    orderBy: { startsAt: "desc" },
    select: eventSelect,
  });
}

export async function countFollowedProjects(userId: string): Promise<number> {
  return db.projectFollow.count({
    where: { userId, project: PUBLIC_FILTER },
  });
}
