import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BugStatusBadge } from "@/components/project/bug-report";
import { CreateEventForm } from "@/components/dashboard/create-event-form";
import { PostUpdateForm } from "@/components/dashboard/post-update-form";
import { CreateRaffleForm } from "@/components/dashboard/create-raffle-form";
import { CreateSurveyForm } from "@/components/dashboard/create-survey-form";
import { listProjectBugReports } from "@/features/bug/queries";
import { OPEN_BUG_STATUSES } from "@/features/bug/schema";
import { EVENT_TYPE_LABEL } from "@/features/calendar/queries";
import { listProjectUpdates } from "@/features/update/queries";
import { UPDATE_KIND_LABEL } from "@/features/update/schema";
import { listProjectSurveys } from "@/features/survey/queries";
import { findManageableProject } from "@/features/project/permissions";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트 운영" };

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

export default async function ProjectOpsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/projects/${slug}`)}`);

  const project = await findManageableProject(slug, viewer.id);
  if (!project) notFound();

  const [surveys, events, bugs, updates] = await Promise.all([
    listProjectSurveys(project.id),
    db.projectEvent.findMany({
      where: { projectId: project.id },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        startsAt: true,
        endsAt: true,
        autoSourceType: true,
      },
    }),
    listProjectBugReports(project.id),
    listProjectUpdates(project.id, 10),
  ]);

  const openBugs = bugs.filter((b) => OPEN_BUG_STATUSES.includes(b.status));

  const openSurvey = surveys.find((s) => s.isOpen);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← 내 프로젝트
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{project.name} — 운영</h1>

      {project.status !== "PUBLISHED" ? (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3.5 text-sm">
          비공개 상태에서는 설문 응답을 받을 수 없습니다.{" "}
          <Link href={`/projects/${slug}/edit`} className="underline">
            공개하러 가기
          </Link>
        </p>
      ) : null}

      {/* ── 버그 제보 ────────────────────────────────────
          제보는 상시 들어온다. 설문보다 위에 두는 이유는, 이미 쓰고 있는 사람이
          막힌 곳을 알려준 것이라 시의성이 가장 높기 때문이다. */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">버그 제보</h2>
          <Link
            href={`/dashboard/projects/${slug}/bugs`}
            className="text-sm text-muted-foreground underline"
          >
            전체 보기 ({bugs.length})
          </Link>
        </div>

        {openBugs.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {openBugs.slice(0, 5).map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-sm"
              >
                <BugStatusBadge status={b.status} />
                <span className="font-medium">{b.title}</span>
                <Link
                  href={`/dashboard/projects/${slug}/bugs`}
                  className="ml-auto text-muted-foreground underline"
                >
                  처리하기
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">처리를 기다리는 제보가 없습니다.</p>
        )}
      </section>

      {/* ── 진행 소식 ────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">진행 소식</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          GitHub 커밋은 무언가 바뀌었다는 말만 해줍니다. 사용자에게 무엇이 달라졌는지는 여기에
          적어주세요. 서비스 운영이 끝난 뒤에도 프로젝트 페이지에 남습니다.
        </p>

        {updates.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {updates.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-sm"
              >
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {UPDATE_KIND_LABEL[u.kind]}
                </span>
                <span className="font-medium">{u.title}</span>
                <span className="ml-auto text-muted-foreground">{fmt.format(u.publishedAt)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4">
          <PostUpdateForm
            slug={slug}
            openBugs={openBugs.map((b) => ({ id: b.id, title: b.title }))}
          />
        </div>
      </section>

      {/* ── 설문 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">설문</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          응답은 작성자 정보 없이 전달됩니다. 누가 무엇을 썼는지 조회할 수 있는 경로는 없습니다.
          다만 참여자가 적을 때는 내용만으로 짐작될 수 있어, 개별 응답은 3건 단위 묶음으로 공개합니다.
        </p>

        {surveys.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {surveys.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-sm"
              >
                <span className="font-medium">{s.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.isOpen ? "bg-success/10 text-success" : "bg-surface-muted text-muted-foreground"
                  }`}
                >
                  {s.isOpen ? "진행 중" : "마감"}
                </span>
                <span className="text-muted-foreground">응답 {s._count.responses}건</span>
                {s.raffles.length > 0 ? (
                  <Link href={`/raffles/${s.raffles[0]!.id}`} className="text-primary underline">
                    추첨: {s.raffles[0]!.prizeName}
                  </Link>
                ) : null}
                <Link
                  href={`/dashboard/projects/${slug}/feedback?survey=${s.id}`}
                  className="ml-auto text-muted-foreground underline"
                >
                  결과 보기
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {!openSurvey ? (
          <div className="mt-4">
            <CreateSurveyForm slug={slug} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            진행 중인 설문이 있습니다. 새 설문은 기존 설문을 마감한 뒤 만들 수 있습니다.
          </p>
        )}
      </section>

      {/* ── 추첨 ─────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">경품 추첨</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          설문 응답자를 대상으로 추첨합니다. 개설 시점에 시드의 해시가 공개되므로 결과를 나중에
          손볼 수 없고, 참여자가 직접 검증할 수 있습니다.
        </p>

        {openSurvey ? (
          openSurvey.raffles.length > 0 ? (
            <p className="mt-4 rounded-card border border-border bg-surface p-4 text-sm">
              이 설문에는 이미 추첨이 있습니다.{" "}
              <Link href={`/raffles/${openSurvey.raffles[0]!.id}`} className="text-primary underline">
                추첨 페이지로
              </Link>
            </p>
          ) : (
            <div className="mt-4">
              <CreateRaffleForm slug={slug} surveyId={openSurvey.id} />
            </div>
          )
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            추첨은 진행 중인 설문에 붙입니다. 설문을 먼저 만들어주세요.
          </p>
        )}
      </section>

      {/* ── 일정 ─────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">일정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          구독한 사람들의 캘린더에 표시됩니다. 설문·추첨 일정은 자동으로 생깁니다.
          테스터 모집과 정식 출시는 알림을 켜둔 구독자에게도 갑니다.
        </p>

        {events.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-sm"
              >
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {EVENT_TYPE_LABEL[e.type]}
                </span>
                <span className="font-medium">{e.title}</span>
                <span className="text-muted-foreground">
                  {fmt.format(e.startsAt)}
                  {e.endsAt ? ` – ${fmt.format(e.endsAt)}` : ""}
                </span>
                {e.autoSourceType ? (
                  <span className="ml-auto text-xs text-muted-foreground">자동 생성</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4">
          <CreateEventForm slug={slug} />
        </div>
      </section>
    </div>
  );
}
