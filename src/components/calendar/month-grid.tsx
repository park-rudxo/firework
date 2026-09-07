import Link from "next/link";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { EVENT_TYPE_COLOR, type CalendarEvent } from "@/features/calendar/queries";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 하루에 들어오는 일정. 종료일이 있으면 그 사이 모든 날에 걸친다. */
function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const d = startOfDay(day);
  return events.filter((e) => {
    const start = startOfDay(e.startsAt);
    if (!e.endsAt) return isSameDay(start, d);
    return d >= start && d <= startOfDay(e.endsAt);
  });
}

export function MonthGrid({ month, events }: { month: Date; events: CalendarEvent[] }) {
  // 달의 첫 주 일요일부터 마지막 주 토요일까지 — 격자가 항상 꽉 찬다.
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  return (
    <div className="overflow-hidden rounded-card border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
        {WEEKDAYS.map((label, i) => (
          <div
            key={label}
            className={`py-2 text-center text-xs font-medium ${
              i === 0 ? "text-danger" : i === 6 ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = eventsOnDay(events, day);
          const outside = !isSameMonth(day, month);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 border-b border-r border-border p-1.5 last:border-r-0 ${
                outside ? "bg-surface-muted/40" : "bg-surface"
              }`}
            >
              <div
                className={`mb-1 text-xs ${
                  isToday(day)
                    ? "inline-flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground"
                    : outside
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground"
                }`}
              >
                {format(day, "d")}
              </div>

              <ul className="flex flex-col gap-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <li key={event.id}>
                    <Link
                      href={event.url ?? `/projects/${event.project.slug}`}
                      title={`${event.project.name} — ${event.title}`}
                      className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-surface-muted"
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: EVENT_TYPE_COLOR[event.type] }}
                      />
                      <span className="truncate">{event.title}</span>
                    </Link>
                  </li>
                ))}
                {dayEvents.length > 3 ? (
                  <li className="px-1 text-[11px] text-muted-foreground">
                    +{dayEvents.length - 3}
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
