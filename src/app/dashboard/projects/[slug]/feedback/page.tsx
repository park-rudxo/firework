import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";

import { findManageableProject } from "@/features/project/permissions";
import { getViewer } from "@/lib/session";
import { MIN_RESPONSES_TO_REVEAL } from "@/features/survey/anonymity";
import { getSurveyResults, listProjectSurveys } from "@/features/survey/queries";

export const metadata: Metadata = { title: "받은 피드백" };

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ survey?: string }>;
}) {
  const { slug } = await params;
  const { survey: surveyParam } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/projects/${slug}/feedback`)}`);

  const project = await findManageableProject(slug, viewer.id);
  if (!project) notFound();

  const surveys = await listProjectSurveys(project.id);
  const selectedId = surveyParam ?? surveys[0]?.id;
  const results = selectedId ? await getSurveyResults(selectedId) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← 내 프로젝트
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{project.name} — 받은 피드백</h1>

      <div className="mt-4 flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p className="text-muted-foreground">
          누가 어떤 답을 썼는지는 <strong className="text-foreground">저희도 알 수 없습니다.</strong>{" "}
          응답 내용과 응답자 기록이 서로 연결되지 않는 별개의 테이블에 저장되기 때문입니다.
          응답자를 알려달라는 요청에도 응할 수 없습니다.
        </p>
      </div>

      {surveys.length === 0 ? (
        <p className="mt-10 text-muted-foreground">
          아직 만든 설문이 없습니다.{" "}
          <Link href={`/dashboard/projects/${slug}`} className="text-primary underline">
            설문 만들기
          </Link>
        </p>
      ) : (
        <>
          {surveys.length > 1 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {surveys.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/projects/${slug}/feedback?survey=${s.id}`}
                  className={`rounded-full px-3.5 py-1.5 text-sm ${
                    s.id === selectedId
                      ? "bg-foreground text-background"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {s.title} ({s._count.responses})
                </Link>
              ))}
            </div>
          ) : null}

          {results ? <Results results={results} /> : null}
        </>
      )}
    </div>
  );
}

function Results({ results }: { results: NonNullable<Awaited<ReturnType<typeof getSurveyResults>>> }) {
  return (
    <div className="mt-8">
      <p className="text-sm text-muted-foreground">응답 {results.responseCount}건</p>

      {results.ratings.length > 0 ? (
        <section className="mt-6 flex flex-col gap-5">
          {results.ratings.map((r) => (
            <div key={r.questionId} className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium">{r.label}</h3>
                <p className="text-lg font-semibold">
                  {r.average.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground"> / {r.max}</span>
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-1">
                {r.distribution.map((count, i) => {
                  const pct = results.responseCount ? (count / results.responseCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-muted-foreground">{i + 1}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {results.choices.length > 0 ? (
        <section className="mt-5 flex flex-col gap-5">
          {results.choices.map((c) => {
            const total = c.counts.reduce((a, b) => a + b.count, 0);
            return (
              <div key={c.questionId} className="rounded-card border border-border bg-surface p-4">
                <h3 className="text-sm font-medium">{c.label}</h3>
                <div className="mt-3 flex flex-col gap-1.5">
                  {c.counts.map(({ option, count }) => {
                    const pct = total ? (count / total) * 100 : 0;
                    return (
                      <div key={option} className="text-xs">
                        <div className="flex justify-between">
                          <span>{option}</span>
                          <span className="text-muted-foreground">
                            {count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-muted">
                          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {results.texts.length > 0 ? (
        <section className="mt-5 flex flex-col gap-5">
          {results.texts.map((t) => (
            <div key={t.questionId} className="rounded-card border border-border bg-surface p-4">
              <h3 className="text-sm font-medium">{t.label}</h3>

              {!results.individualRevealed ? (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  응답이 {MIN_RESPONSES_TO_REVEAL}건 이상 모이면 공개됩니다. 응답이 한둘일 때는
                  내용이 곧 작성자를 가리키기 때문에 익명성을 위해 잠가둡니다. (현재{" "}
                  {results.responseCount}건)
                </p>
              ) : t.answers.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">아직 작성된 답이 없습니다.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {t.answers.map((answer, i) => (
                    <li
                      key={i}
                      className="whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm"
                    >
                      {answer}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
