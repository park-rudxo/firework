import Link from "next/link";
import { CalendarDays, Gift, MessageSquare } from "lucide-react";

import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type CalendarEvent } from "@/features/calendar/queries";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

/** 설문·추첨 참여 유도. 상세 페이지에서 GitHub 버튼 바로 아래에 온다. */
export function EngagementBanner({
  slug,
  survey,
  raffle,
  alreadyResponded,
  isOwner,
}: {
  slug: string;
  survey: { id: string; title: string; closesAt: Date | null } | null;
  raffle: { id: string; prizeName: string; winnerCount: number; closesAt: Date } | null;
  alreadyResponded: boolean;
  isOwner: boolean;
}) {
  if (!survey) return null;

  return (
    <section className="mt-6 rounded-card border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <MessageSquare className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />

        <div className="min-w-0 flex-1">
          <h2 className="font-medium">{survey.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            써보고 느낀 점을 남겨주세요. <strong>제작자에게도 익명</strong>으로 전달됩니다.
            {survey.closesAt ? ` ${fmt.format(survey.closesAt)} 마감.` : ""}
          </p>

          {raffle ? (
            <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm">
              <Gift className="size-4 text-accent" aria-hidden />
              <span>
                응답하면 <strong>{raffle.prizeName}</strong> 추첨({raffle.winnerCount}명)에 자동
                응모됩니다.
              </span>
              <Link href={`/raffles/${raffle.id}`} className="text-primary underline">
                추첨 상세
              </Link>
            </p>
          ) : null}
        </div>

        <div className="shrink-0">
          {isOwner ? (
            <Link
              href={`/dashboard/projects/${slug}/feedback`}
              className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium"
            >
              받은 피드백 보기
            </Link>
          ) : alreadyResponded ? (
            <span className="rounded-xl bg-surface-muted px-4 py-2.5 text-sm text-muted-foreground">
              응답 완료
            </span>
          ) : (
            <Link
              href={`/projects/${slug}/survey`}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              피드백 남기기
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** 프로젝트의 일정 타임라인. 지난 일정도 함께 보여 진행 흐름을 읽게 한다. */
export function EventTimeline({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return null;

  const now = new Date();

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="size-5" aria-hidden />
        일정
      </h2>

      <ol className="mt-4 flex flex-col gap-2">
        {events.map((event) => {
          const past = (event.endsAt ?? event.startsAt) < now;
          return (
            <li
              key={event.id}
              className={`flex gap-3 rounded-card border border-border bg-surface p-3.5 ${
                past ? "opacity-55" : ""
              }`}
            >
              <span
                aria-hidden
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ background: EVENT_TYPE_COLOR[event.type] }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {EVENT_TYPE_LABEL[event.type]} · {fmt.format(event.startsAt)}
                  {event.endsAt ? ` – ${fmt.format(event.endsAt)}` : ""}
                </p>
                <p className="mt-0.5 font-medium">{event.title}</p>
                {event.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                ) : null}
              </div>
              {event.url ? (
                <Link
                  href={event.url}
                  className="shrink-0 self-center text-sm text-primary underline"
                >
                  열기
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
