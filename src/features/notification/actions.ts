"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export async function markNotificationRead(id: string): Promise<void> {
  const viewer = await requireViewer();
  // where 에 userId 를 함께 걸어 남의 알림을 읽음 처리하지 못하게 한다.
  await db.notification.updateMany({
    where: { id, userId: viewer.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const viewer = await requireViewer();
  await db.notification.updateMany({
    where: { userId: viewer.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
