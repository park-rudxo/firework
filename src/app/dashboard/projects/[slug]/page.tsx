import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CreateEventForm } from "@/components/dashboard/create-event-form";
import { CreateRaffleForm } from "@/components/dashboard/create-raffle-form";
import { CreateSurveyForm } from "@/components/dashboard/create-survey-form";
import { EVENT_TYPE_LABEL } from "@/features/calendar/queries";
import { listProjectSurveys } from "@/features/survey/queries";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "프로젝트 운영" };

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

export default async function ProjectOpsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/projects/${slug}`)}`);

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, name: true, ownerId: true, status: true },
  });
  if (!project || project.ownerId !== viewer.id) notFound();

  const [surveys, events] = await Promise.all([
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
  ]);

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

      {/* ── 설문 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">설문</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          응답은 제작자인 본인에게도 익명으로 전달됩니다. 누가 무엇을 썼는지는 조회할 수 없습니다.
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
          관심 등록한 사람들의 캘린더에 표시됩니다. 설문·추첨 일정은 자동으로 생깁니다.
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
