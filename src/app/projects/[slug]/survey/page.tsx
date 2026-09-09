import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Gift, ShieldCheck } from "lucide-react";

import { SurveyForm } from "@/components/survey/survey-form";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { getOpenSurvey, hasResponded } from "@/features/survey/queries";

export const metadata: Metadata = { title: "설문" };

export default async function SurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true, ownerId: true },
  });
  if (!project || project.status !== "PUBLISHED") notFound();

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/projects/${slug}/survey`)}`);

  const survey = await getOpenSurvey(project.id);
  if (!survey) {
    return (
      <Shell slug={slug} name={project.name}>
        <p className="text-muted-foreground">지금은 받고 있는 설문이 없습니다.</p>
      </Shell>
    );
  }

  if (project.ownerId === viewer.id) {
    return (
      <Shell slug={slug} name={project.name}>
        <p className="text-muted-foreground">
          본인 프로젝트의 설문에는 응답할 수 없습니다.{" "}
          <Link href={`/dashboard/projects/${slug}/feedback`} className="text-primary underline">
            받은 피드백 보기
          </Link>
        </p>
      </Shell>
    );
  }

  if (await hasResponded(survey.id, viewer.id)) {
    return (
      <Shell slug={slug} name={project.name}>
        <div className="rounded-card border border-success/40 bg-success/5 p-5">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
          <p className="mt-3 font-medium">이미 응답하셨습니다. 고맙습니다.</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            내용은 제작자에게 익명으로 전달되었습니다. 어떤 답을 쓰셨는지는 저희도 조회할 수 없어
            다시 보여드릴 수 없습니다.
          </p>
        </div>
      </Shell>
    );
  }

  const raffle = await db.raffle.findFirst({
    where: { surveyId: survey.id, status: "OPEN", closesAt: { gte: new Date() } },
    select: { prizeName: true, winnerCount: true, closesAt: true },
  });

  return (
    <Shell slug={slug} name={project.name}>
      <div className="rounded-card border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-success" aria-hidden />
          이 응답은 제작자에게도 익명입니다
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          응답 내용과 응답자 정보는 서로 연결되지 않는 별개의 테이블에 저장됩니다. 제작자는 물론
          운영자도 누가 어떤 답을 썼는지 알 수 없습니다.{" "}
          <Link href="/about/anonymity" className="underline">
            어떻게 보장하나요?
          </Link>
        </p>
      </div>

      {raffle ? (
        <div className="mt-3 flex items-start gap-3 rounded-card border border-accent/40 bg-accent/5 p-4">
          <Gift className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">응답하면 추첨에 자동 응모됩니다</p>
            <p className="mt-1 text-muted-foreground">
              {raffle.prizeName} · {raffle.winnerCount}명 ·{" "}
              {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(raffle.closesAt)}{" "}
              마감. 응모 기록은 응답 내용과 연결되지 않습니다.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <h1 className="text-xl font-semibold">{survey.title}</h1>
        {survey.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{survey.description}</p>
        ) : null}
      </div>

      <div className="mt-6">
        <SurveyForm surveyId={survey.id} questions={survey.questions} slug={slug} />
      </div>
    </Shell>
  );
}

function Shell({
  slug,
  name,
  children,
}: {
  slug: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/projects/${slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {name}
      </Link>
      <div className="mt-5">{children}</div>
    </div>
  );
}
