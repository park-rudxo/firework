import Link from "next/link";
import { CalendarDays, Compass, Sparkles } from "lucide-react";

import { getViewer } from "@/lib/session";
import { NotificationBell } from "@/components/notification/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";

const nav = [
  { href: "/projects", label: "둘러보기", icon: Compass },
  { href: "/calendar", label: "일정", icon: CalendarDays },
];

export async function SiteHeader() {
  const viewer = await getViewer();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" aria-hidden />
          <span>firework</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {viewer ? <NotificationBell userId={viewer.id} /> : null}
          <UserMenu viewer={viewer} />
        </div>
      </div>
    </header>
  );
}
