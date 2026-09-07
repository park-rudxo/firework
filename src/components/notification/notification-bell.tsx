import Link from "next/link";
import { Bell } from "lucide-react";

import { unreadCount } from "@/features/notification/queries";

export async function NotificationBell({ userId }: { userId: string }) {
  const count = await unreadCount(userId);

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `알림 ${count}건` : "알림"}
      className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <Bell className="size-4" aria-hidden />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
