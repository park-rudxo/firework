import "server-only";

import { db } from "@/lib/db";

export const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  readAt: true,
  createdAt: true,
} as const;

export type NotificationItem = Awaited<ReturnType<typeof listNotifications>>[number];

export async function listNotifications(userId: string, limit = 50) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: notificationSelect,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
