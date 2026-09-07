import "server-only";

import type { NotificationType } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * 알림 발행.
 *
 * **무엇을 알리지 않는가가 이 기능의 핵심이다.**
 *
 * 설문에 새 응답이 들어올 때마다 제작자에게 알리면, 제작자는 응답이 도착한 시각을
 * 알게 된다. 응답 행에서 시간 정보를 지워둔 의미가 그 알림 하나로 되살아난다.
 * "방금 A한테 써달라고 부탁했는데 5분 뒤 알림이 왔다" 는 추론이 성립하기 때문이다.
 *
 * 그래서 개별 응답 알림은 만들지 않는다. 임계(3건)에 도달했을 때 한 번만 알린다.
 * 그 한 번도 3번째 응답 시각을 흘리긴 하지만, 셋 중 누구인지는 가려진다.
 */
export async function notify({
  userId,
  type,
  title,
  body,
  url,
}: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  url?: string;
}): Promise<void> {
  try {
    await db.notification.create({
      data: { userId, type, title, body: body ?? null, url: url ?? null },
    });
  } catch {
    // 알림은 부가 기능이다. 실패해도 본래 작업(추첨, 신고 접수)을 깨뜨리지 않는다.
  }
}

export async function notifyMany(
  userIds: string[],
  payload: Omit<Parameters<typeof notify>[0], "userId">,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        url: payload.url ?? null,
      })),
    });
  } catch {
    // 위와 같다.
  }
}

/** 관리자 전원. 신고 알림처럼 관리자에게만 가는 것에 쓴다. */
export async function adminUserIds(): Promise<string[]> {
  const admins = await db.profile.findMany({
    where: { role: "ADMIN" },
    select: { userId: true },
  });
  return admins.map((a) => a.userId);
}
