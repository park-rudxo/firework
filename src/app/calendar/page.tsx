import type { Metadata } from "next";
import Link from "next/link";
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MonthGrid } from "@/components/calendar/month-grid";
import { UpcomingList } from "@/components/calendar/upcoming-list";
import {
  countFollowedProjects,
  EVENT_TYPE_COLOR,
  EVENT_TYPE_LABEL,
  listEvents,
  listUpcoming,
} from "@/features/calendar/queries";
import { getViewer } from "@/lib/session";
import type { ProjectEventType } from "@prisma/client";

export const metadata: Metadata = { title: "일정" };

const ALL_TYPES = Object.keys(EVENT_TYPE_LABEL) as ProjectEventType[];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const viewer = await getViewer();

  const month = parseMonth(sp.month);
  // 로그인한 사람에게는 관심 프로젝트만 보는 것이 기본이다. 그게 캘린더를 쓰는 이유다.
  const followedOnly = viewer ? sp.scope !== "all" : false;
  const types = ALL_TYPES.includes(sp.type as ProjectEventType)
    ? [sp.type as ProjectEventType]
    : undefined;

  const followedBy = followedOnly && viewer ? viewer.id : undefined;

  const [events, upcoming, followCount] = await Promise.all([
    listEvents({
      // 격자가 앞뒤 달을 물고 있으므로 조회 범위도 그만큼 넓힌다.
      from: startOfWeek(startOfMonth(month)),
      to: endOfWeek(endOfMonth(month)),
      followedBy,
      types,
    }),
    listUpcoming({ followedBy, limit: 8 }),
    viewer ? countFollowedProjects(viewer.id) : Promise.resolve(0),
  ]);

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { month: sp.month, scope: sp.scope, type: sp.type, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/calendar?${qs}` : "/calendar";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">일정</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            베타 테스트, 업데이트, 설문, 출시 일정을 한눈에 봅니다.
          </p>
        </div>

        {viewer ? (
          <div className="flex rounded-xl border border-border p-0.5 text-sm">
            <Link
              href={href({ scope: undefined })}
              className={`rounded-lg px-3.5 py-1.5 ${
                followedOnly ? "bg-foreground text-background" : "text-muted-foreground"
              }`}
            >
              관심 프로젝트 {followCount > 0 ? followCount : ""}
            </Link>
            <Link
              href={href({ scope: "all" })}
              className={`rounded-lg px-3.5 py-1.5 ${
                followedOnly ? "text-muted-foreground" : "bg-foreground text-background"
              }`}
            >
              전체
            </Link>
          </div>
        ) : null}
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href={href({ type: undefined })}
          className={`rounded-full px-3.5 py-1.5 text-sm ${
            types ? "border border-border text-muted-foreground" : "bg-foreground text-background"
          }`}
        >
          전체
        </Link>
        {ALL_TYPES.map((t) => (
          <Link
            key={t}
            href={href({ type: t })}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm ${
              types?.[0] === t
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:bg-surface-muted"
            }`}
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: EVENT_TYPE_COLOR[t] }}
            />
            {EVENT_TYPE_LABEL[t]}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">{format(month, "yyyy년 M월")}</h2>
            <div className="flex items-center gap-1">
              <Link
                href={href({ month: format(subMonths(month, 1), "yyyy-MM") })}
                aria-label="이전 달"
                className="rounded-lg border border-border p-1.5 hover:bg-surface-muted"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
              <Link
                href={href({ month: undefined })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
              >
                오늘
              </Link>
              <Link
                href={href({ month: format(addMonths(month, 1), "yyyy-MM") })}
                aria-label="다음 달"
                className="rounded-lg border border-border p-1.5 hover:bg-surface-muted"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>

          <MonthGrid month={month} events={events} />

          {viewer && followedOnly && followCount === 0 ? (
            <p className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
              아직 관심 등록한 프로젝트가 없습니다. 프로젝트 페이지에서 관심 등록을 누르면 그
              프로젝트의 일정이 여기에 모입니다.{" "}
              <Link href="/projects" className="text-primary underline">
                둘러보기
              </Link>
            </p>
          ) : null}
        </section>

        <aside>
          <h2 className="text-lg font-medium">다가오는 일정</h2>
          <div className="mt-3">
            <UpcomingList events={upcoming} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** ?month=2026-09 형태. 이상한 값이면 이번 달로 떨어진다. */
function parseMonth(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}-01T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return startOfMonth(parsed);
  }
  return startOfMonth(new Date());
}
