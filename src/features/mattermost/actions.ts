"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { serverEnv, mattermostConfigured } from "@/lib/env";
import { seal } from "@/lib/secret-box";
import { requireViewer } from "@/lib/session";
import { MattermostError, parseWebhookUrl } from "@/features/mattermost/client";
import { deliverPending } from "@/features/mattermost/deliver";

export type MattermostState = { ok: boolean; message: string | null };

/**
 * 개인 Incoming Webhook 주소를 등록한다.
 *
 * 계정 연결(인증)과는 별개의 단계다. 연결은 "이 사람이 누구인지 확인했다" 이고,
 * 이것은 "이 경로로 메시지를 보내도 된다" 이다. 연결만 하고 웹훅을 안 넣어도 되고,
 * 그때는 사이트 알림만 받는다.
 *
 * 등록해도 곧바로 나가지는 않는다. 전역 스위치(deliveryEnabled)와 프로젝트별 동의가
 * 각각 켜져야 한 통이 나간다.
 */
export async function saveWebhook(_prev: MattermostState, form: FormData): Promise<MattermostState> {
  const viewer = await requireViewer();

  const account = await db.mattermostAccount.findUnique({
    where: { userId: viewer.id },
    select: { userId: true },
  });
  if (!account) return { ok: false, message: "먼저 Mattermost 계정을 연결해주세요." };

  const raw = String(form.get("webhookUrl") ?? "").trim();
  if (!raw) return { ok: false, message: "웹훅 주소를 입력해주세요." };

  try {
    parseWebhookUrl(raw);
  } catch (err) {
    if (err instanceof MattermostError) return { ok: false, message: err.message };
    throw err;
  }

  await db.mattermostAccount.update({
    where: { userId: viewer.id },
    data: { webhookUrlEnc: seal(raw), failureCount: 0, lastFailureAt: null },
  });

  revalidatePath("/settings/notifications");
  return { ok: true, message: "웹훅을 등록했습니다. 알림은 아직 꺼져 있습니다." };
}

/**
 * 전역 수신 스위치.
 *
 * 끄면 프로젝트별 동의와 무관하게 한 통도 나가지 않고, 큐에 남아 있던 것도
 * 발송 직전 확인에서 취소된다. "당분간 조용히" 를 프로젝트마다 끄지 않고 한 번에
 * 할 수 있어야 한다.
 */
export async function setDeliveryEnabled(enabled: boolean): Promise<MattermostState> {
  const viewer = await requireViewer();

  const account = await db.mattermostAccount.findUnique({
    where: { userId: viewer.id },
    select: { webhookUrlEnc: true },
  });
  if (!account) return { ok: false, message: "먼저 Mattermost 계정을 연결해주세요." };
  if (enabled && !account.webhookUrlEnc) {
    return { ok: false, message: "먼저 개인 웹훅 주소를 등록해주세요." };
  }

  await db.mattermostAccount.update({
    where: { userId: viewer.id },
    data: { deliveryEnabled: enabled, ...(enabled ? { failureCount: 0, lastFailureAt: null } : {}) },
  });

  revalidatePath("/settings/notifications");
  return { ok: true, message: enabled ? "Mattermost 알림을 켰습니다." : "Mattermost 알림을 껐습니다." };
}

/**
 * 연결 해제.
 *
 * 대기 중이던 메시지도 함께 취소한다. 해제 뒤에 큐에 남은 것이 나가면, 사용자가 한
 * 해제가 지켜지지 않은 것이 된다. 발송 직전 확인이 어차피 걸러내지만, 취소했다는
 * 사실이 화면에 바로 보이는 편이 낫다.
 */
export async function disconnectMattermost(): Promise<MattermostState> {
  const viewer = await requireViewer();

  await db.$transaction([
    db.outboundMessage.updateMany({
      where: { userId: viewer.id, status: "PENDING" },
      data: { status: "CANCELLED", lastError: "계정 연결이 해제되었습니다." },
    }),
    db.mattermostAccount.deleteMany({ where: { userId: viewer.id } }),
  ]);

  revalidatePath("/settings/notifications");
  return { ok: true, message: "Mattermost 연결을 해제했습니다." };
}

/** 테스트 발송. 지금 설정으로 실제로 도착하는지 확인하는 용도다. */
export async function sendTestMessage(): Promise<MattermostState> {
  const viewer = await requireViewer();
  if (!mattermostConfigured(serverEnv())) {
    return { ok: false, message: "Mattermost 연동이 아직 설정되지 않았습니다." };
  }

  const account = await db.mattermostAccount.findUnique({
    where: { userId: viewer.id },
    select: { deliveryEnabled: true, webhookUrlEnc: true },
  });
  if (!account?.webhookUrlEnc) return { ok: false, message: "먼저 웹훅 주소를 등록해주세요." };
  if (!account.deliveryEnabled) return { ok: false, message: "Mattermost 알림이 꺼져 있습니다." };

  await db.outboundMessage.create({
    data: {
      userId: viewer.id,
      title: "firework 테스트 메시지",
      body: "이 메시지가 보이면 알림 설정이 정상입니다.",
      url: "/settings/notifications",
    },
  });

  const result = await deliverPending(5);
  revalidatePath("/settings/notifications");

  if (result.sent > 0) return { ok: true, message: "보냈습니다. Mattermost 를 확인해주세요." };
  return { ok: false, message: "보내지 못했습니다. 웹훅 주소를 다시 확인해주세요." };
}
