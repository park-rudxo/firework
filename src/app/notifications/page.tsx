import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, Flag, Gift, Link2Off, MessageSquare, ShieldCheck, UserPlus } from "lucide-react";
import type { NotificationType } from "@prisma/client";

import { MarkAllRead } from "@/components/notification/mark-all-read";
import { listNotifications } from "@/features/notification/queries";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "알림" };

const ICON: Record<NotificationType, typeof Bell> = {
  BUG_REPORTED: Flag,
  BUG_STATUS_CHANGED: MessageSquare,
  RAFFLE_WON: Gift,
  RAFFLE_READY_TO_DRAW: Gift,
  RAFFLE_CONTACT_SUBMITTED: Gift,
  SURVEY_THRESHOLD_REACHED: MessageSquare,
  REPORT_FILED: Flag,
  REPORT_RESOLVED: Flag,
  BROKEN_LINK_REPORTED: Link2Off,
  ADMIN_GRANTED: ShieldCheck,
  PROJECT_INVITED: UserPlus,
  PROJECT_INVITE_ANSWERED: UserPlus,
};

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/notifications");

  const items = await listNotifications(viewer.id);
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">알림</h1>
        {hasUnread ? <MarkAllRead /> : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">아직 알림이 없습니다.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {items.map((n) => {
            const Icon = ICON[n.type];
            const unread = n.readAt === null;
            const content = (
              <div
                className={`flex gap-3 rounded-card border p-4 transition-colors ${
                  unread
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${unread ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ko })}
                  </p>
                </div>
              </div>
            );

            return (
              <li key={n.id}>{n.url ? <Link href={n.url}>{content}</Link> : content}</li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
