import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";

import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type CalendarEvent } from "@/features/calendar/queries";

export function UpcomingList({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">예정된 일정이 없습니다.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={event.url ?? `/projects/${event.project.slug}`}
            className="flex gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-primary/50"
          >
            <span
              aria-hidden
              className="mt-1 h-full w-1 shrink-0 rounded-full"
              style={{ background: EVENT_TYPE_COLOR[event.type] }}
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {relativeDay(event.startsAt)} · {EVENT_TYPE_LABEL[event.type]}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">{event.title}</p>
              <p className="truncate text-xs text-muted-foreground">{event.project.name}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function relativeDay(date: Date): string {
  if (isToday(date)) return "오늘";
  if (isTomorrow(date)) return "내일";
  return format(date, "M월 d일");
}
