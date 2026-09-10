import "server-only";

import { db } from "@/lib/db";
import { open } from "@/lib/secret-box";
import { notify } from "@/features/notification/create";
import {
  absoluteUrl,
  formatMessage,
  MattermostError,
  sendWebhookMessage,
} from "@/features/mattermost/client";

/**
 * 연속 실패 임계. 여기 닿으면 발송을 멈추고 본인에게 사이트 알림으로 알린다.
 * 웹훅을 지웠거나 계정을 옮긴 사람에게 계속 POST 를 쏘지 않기 위해서다.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** 한 건에 대한 재시도 한도. */
export const MAX_ATTEMPTS = 3;

export type DeliveryOutcome = "sent" | "cancelled" | "failed" | "skipped";

/**
 * **발송 직전 동의 확인.** 이 함수가 이 기능에서 가장 중요한 곳이다.
 *
 * 큐에 넣는 시점과 보내는 시점 사이에 사람은 구독을 끊고, 알림을 끄고, 계정 연결을
 * 해제한다. 넣을 때 확인한 것으로 충분하다고 보면 그 취소들이 전부 무시된다.
 * 그래서 보내기 직전에 처음부터 다시 확인한다.
 *
 * 확인하는 것:
 *   1. Mattermost 계정이 아직 연결돼 있는가
 *   2. 전역 수신 스위치가 켜져 있는가
 *   3. 보낼 경로(웹훅)가 남아 있고 열리는가
 *   4. (프로젝트 알림이면) 그 프로젝트를 아직 구독 중인가
 *   5. (프로젝트 알림이면) 그 주제 알림이 아직 켜져 있는가
 *
 * 하나라도 어긋나면 보내지 않고 CANCELLED 로 닫는다. 실패가 아니라 취소다 —
 * 재시도할 이유가 없기 때문이다.
 */
export async function resolveDeliveryTarget(message: {
  userId: string;
  projectId: string | null;
  topic: "UPDATE" | "RECRUITING" | null;
}): Promise<{ webhookUrl: string; username: string } | null> {
  const account = await db.mattermostAccount.findUnique({
    where: { userId: message.userId },
    select: {
      username: true,
      webhookUrlEnc: true,
      deliveryEnabled: true,
      failureCount: true,
    },
  });

  if (!account) return null;
  if (!account.deliveryEnabled) return null;
  if (account.failureCount >= MAX_CONSECUTIVE_FAILURES) return null;

  const webhookUrl = open(account.webhookUrlEnc);
  if (!webhookUrl) return null;

  if (message.projectId && message.topic) {
    const [follow, pref] = await Promise.all([
      db.projectFollow.findUnique({
        where: { projectId_userId: { projectId: message.projectId, userId: message.userId } },
        select: { createdAt: true },
      }),
      db.projectNotificationPref.findUnique({
        where: {
          projectId_userId_topic: {
            projectId: message.projectId,
            userId: message.userId,
            topic: message.topic,
          },
        },
        select: { createdAt: true },
      }),
    ]);
    if (!follow || !pref) return null;
  }

  return { webhookUrl, username: account.username };
}

/**
 * 큐를 비운다.
 *
 * 크론이나 워커를 따로 두지 않고, 알림을 만든 요청이 끝난 뒤와 관리자 화면에서 부른다.
 * 규모가 커지면 이 함수를 그대로 워커에 옮기면 된다.
 */
export async function deliverPending(limit = 25): Promise<Record<DeliveryOutcome, number>> {
  const tally: Record<DeliveryOutcome, number> = { sent: 0, cancelled: 0, failed: 0, skipped: 0 };

  const pending = await db.outboundMessage.findMany({
    where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const message of pending) {
    const outcome = await deliverOne(message);
    tally[outcome] += 1;
  }

  return tally;
}

async function deliverOne(message: {
  id: string;
  userId: string;
  projectId: string | null;
  topic: "UPDATE" | "RECRUITING" | null;
  title: string;
  body: string | null;
  url: string | null;
  attempts: number;
}): Promise<DeliveryOutcome> {
  const target = await resolveDeliveryTarget(message);

  if (!target) {
    // 동의가 사라졌다. 재시도하지 않고 닫는다.
    await db.outboundMessage.update({
      where: { id: message.id },
      data: { status: "CANCELLED", lastError: "발송 직전 확인에서 수신 동의가 없었습니다." },
    });
    return "cancelled";
  }

  try {
    await sendWebhookMessage({
      webhookUrl: target.webhookUrl,
      username: target.username,
      text: formatMessage({
        title: message.title,
        body: message.body,
        url: absoluteUrl(message.url),
      }),
    });

    await Promise.all([
      db.outboundMessage.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      }),
      // 한 번 성공하면 연속 실패는 0 으로 돌아간다.
      db.mattermostAccount.update({
        where: { userId: message.userId },
        data: { failureCount: 0, lastFailureAt: null },
      }),
    ]);
    return "sent";
  } catch (err) {
    const reason = err instanceof MattermostError ? err.message : "알 수 없는 오류";
    const attempts = message.attempts + 1;

    await db.outboundMessage.update({
      where: { id: message.id },
      data: {
        attempts,
        lastError: reason,
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
      },
    });

    const account = await db.mattermostAccount.update({
      where: { userId: message.userId },
      data: { failureCount: { increment: 1 }, lastFailureAt: new Date() },
      select: { failureCount: true },
    });

    // 임계에 닿으면 스스로 멈추고, 사이트 알림으로만 알린다.
    // 발송이 고장난 상태를 발송으로 알릴 수는 없다.
    if (account.failureCount === MAX_CONSECUTIVE_FAILURES) {
      await notify({
        userId: message.userId,
        type: "MATTERMOST_DELIVERY_FAILED",
        title: "Mattermost 알림 발송이 중단됐습니다",
        body: "웹훅 주소가 더 이상 동작하지 않는 것 같습니다. 설정에서 다시 연결해주세요.",
        url: "/settings/notifications",
      });
    }

    return attempts >= MAX_ATTEMPTS ? "failed" : "skipped";
  }
}
