import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink, Star, GitFork, Scale, Clock } from "lucide-react";

import { GithubMark } from "@/components/icons/github-mark";
import { BugReportForm } from "@/components/project/bug-report";
import { MyBugReports } from "@/components/project/my-bug-reports";
import { ProjectIcon } from "@/components/project/project-card";
import { EngagementBanner, EventTimeline } from "@/components/project/project-engagement";
import { ProjectReactions } from "@/components/project/project-reactions";
import { ProjectUpdates } from "@/components/project/project-updates";
import { SubscribeControls } from "@/components/project/subscribe-controls";
import { ReportButton } from "@/components/report/report-button";
import { Screenshots } from "@/components/project/screenshots";
import { UntrustedHtml } from "@/components/project/untrusted-html";
import { bugReportSummary, listMyBugReports } from "@/features/bug/queries";
import { refreshSnapshot } from "@/features/project/actions";
import { getProjectAccess } from "@/features/project/permissions";
import { getProjectBySlug, getViewerReactions } from "@/features/project/queries";
import { CATEGORY_LABEL } from "@/features/project/schema";
import { getSubscriptionState } from "@/features/subscription/queries";
import { listProjectUpdates } from "@/features/update/queries";
import { bumpStat } from "@/features/curation/stats";
import { listProjectEvents } from "@/features/calendar/queries";
import { getOpenSurvey, hasResponded } from "@/features/survey/queries";
import { db } from "@/lib/db";
import { renderMarkdown, sanitizeHtml } from "@/lib/sanitize";
import { getViewer } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: "찾을 수 없음" };
  return { title: project.name, description: project.tagline };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewer();
  const project = await getProjectBySlug(slug, viewer?.id);
  if (!project) notFound();

  const access = await getProjectAccess(project, viewer?.id);
  const isManager = access.canManage;

  // TTL(6시간)이 지났으면 조용히 갱신한다. 실패해도 기존 스냅샷으로 계속 보여준다.
  await refreshSnapshot(project.id, project.repoUrl);

  const [
    reactions,
    descriptionHtml,
    readmeHtml,
    survey,
    events,
    subscription,
    updates,
    bugs,
    myBugs,
    mattermost,
  ] = await Promise.all([
    getViewerReactions(project.id, viewer?.id),
    project.description ? renderMarkdown(project.description) : Promise.resolve(""),
    // GitHub README 는 남이 쓴 HTML 이다. 렌더 직전에 반드시 정화한다.
    project.snapshot?.readmeHtml
      ? sanitizeHtml(project.snapshot.readmeHtml)
      : Promise.resolve(""),
    getOpenSurvey(project.id),
    listProjectEvents(project.id),
    getSubscriptionState(project.id, viewer?.id),
    listProjectUpdates(project.id),
    bugReportSummary(project.id),
    listMyBugReports(project.id, viewer?.id),
    viewer
      ? db.mattermostAccount.findUnique({
          where: { userId: viewer.id },
          select: { deliveryEnabled: true },
        })
      : Promise.resolve(null),
  ]);

  // 설문이 열려 있을 때만 추첨과 응답 여부를 확인한다.
  const [raffle, alreadyResponded] = survey
    ? await Promise.all([
        db.raffle.findFirst({
          where: { surveyId: survey.id, status: "OPEN", closesAt: { gte: new Date() } },
          select: { id: true, prizeName: true, winnerCount: true, closesAt: true },
        }),
        hasResponded(survey.id, viewer?.id),
      ])
    : [null, false];

  if (project.status === "PUBLISHED") {
    await bumpStat(project.id, "views");
  }

  const languages = (project.snapshot?.languages ?? {}) as Record<string, number>;
  const languageTotal = Object.values(languages).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {project.status !== "PUBLISHED" ? (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-3.5 text-sm">
          이 프로젝트는 아직 <strong>비공개</strong>입니다. 관리 팀에게만 보입니다.{" "}
          <Link href={`/projects/${slug}/edit`} className="underline">
            공개하러 가기
          </Link>
        </p>
      ) : null}

      <header className="flex flex-wrap items-start gap-5">
        <ProjectIcon iconUrl={project.iconUrl} name={project.name} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            {project.ownershipVerified ? (
              <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
                <BadgeCheck className="size-3.5" aria-hidden />
                저장소 소유 확인
              </span>
            ) : (
              <span
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground"
                title="등록자의 GitHub 계정이 이 저장소의 소유자나 협업자인지 확인되지 않았습니다. 조직 저장소인 경우에도 이렇게 표시됩니다."
              >
                소유 미확인
              </span>
            )}
          </div>

          <p className="mt-2 text-muted-foreground">{project.tagline}</p>

          <p className="mt-2 text-sm text-muted-foreground">
            {CATEGORY_LABEL[project.category]} · {project.owner.profile?.displayName ?? project.owner.name}
          </p>

          {project.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/projects?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {/* 써보러 가는 것이 이 서비스의 첫 동작이라 데모를 앞에 둔다. */}
        <ExternalLinkButton href={project.demoUrl} projectId={project.id} primary>
          <ExternalLink className="size-4" aria-hidden />
          데모 열기
        </ExternalLinkButton>

        {project.repoUrl ? (
          <ExternalLinkButton href={project.repoUrl} projectId={project.id}>
            <GithubMark className="size-4" />
            GitHub
          </ExternalLinkButton>
        ) : null}

        {isManager ? (
          <Link
            href={`/dashboard/projects/${slug}`}
            className="rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-surface-muted"
          >
            관리
          </Link>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <SubscribeControls
            slug={slug}
            initialSubscribed={subscription.subscribed}
            initialTopics={subscription.topics}
            subscriberCount={project._count.follows}
            signedIn={Boolean(viewer)}
            mattermostLinked={Boolean(mattermost?.deliveryEnabled)}
          />
          <ProjectReactions
            slug={slug}
            counts={{ likes: project._count.likes, tries: project._count.tries }}
            initial={{ liked: reactions.liked, tried: reactions.tried }}
            signedIn={Boolean(viewer)}
          />
          <ReportButton targetType="PROJECT" targetId={project.id} signedIn={Boolean(viewer)} />
        </div>
      </div>

      <EngagementBanner
        slug={slug}
        survey={survey ? { id: survey.id, title: survey.title, closesAt: survey.closesAt } : null}
        raffle={raffle}
        alreadyResponded={alreadyResponded}
        isOwner={isManager}
      />

      {project.snapshot ? (
        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 rounded-card border border-border bg-surface px-4 py-3 text-sm">
          <Stat icon={Star} label="스타" value={project.snapshot.stars.toLocaleString()} />
          <Stat icon={GitFork} label="포크" value={project.snapshot.forks.toLocaleString()} />
          {project.snapshot.license ? (
            <Stat icon={Scale} label="라이선스" value={project.snapshot.license} />
          ) : null}
          {project.snapshot.pushedAt ? (
            <Stat
              icon={Clock}
              label="최근 커밋"
              value={new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
                project.snapshot.pushedAt,
              )}
            />
          ) : null}
        </dl>
      ) : null}

      {languageTotal > 0 ? (
        <section className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
            {Object.entries(languages)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([lang, bytes], i) => (
                <div
                  key={lang}
                  title={`${lang} ${((bytes / languageTotal) * 100).toFixed(1)}%`}
                  style={{
                    width: `${(bytes / languageTotal) * 100}%`,
                    // 언어별 고정 색을 관리하지 않고 색상환을 균등 분할한다.
                    background: `oklch(0.65 0.15 ${(i * 55) % 360})`,
                  }}
                />
              ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {Object.entries(languages)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([lang, bytes]) => `${lang} ${((bytes / languageTotal) * 100).toFixed(0)}%`)
              .join(" · ")}
          </p>
        </section>
      ) : null}

      {project.screenshots.length > 0 ? (
        <section className="mt-8">
          <Screenshots urls={project.screenshots} name={project.name} />
        </section>
      ) : null}

      <EventTimeline events={events} />

      <ProjectUpdates updates={updates} />

      {/* ── 버그 제보 ──────────────────────────────────────
          설문과 달리 상시 열려 있다. 제작자가 설문을 열어줘야만 피드백을 낼 수
          있으면, 쓰다가 깨진 것을 전할 방법이 그동안 없다. */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">버그 제보</h2>
          {bugs.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              접수 {bugs.open}건 · 수정 완료 {bugs.fixed}건
            </p>
          ) : null}
        </div>

        <div className="mt-3">
          <BugReportForm slug={slug} signedIn={Boolean(viewer)} />
        </div>

        <MyBugReports reports={myBugs} />
      </section>

      {descriptionHtml ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">소개</h2>
          <UntrustedHtml html={descriptionHtml} className="mt-3" />
        </section>
      ) : null}

      {readmeHtml ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">README</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            GitHub 저장소에서 가져왔습니다. 스크립트와 임베드는 제거됩니다.
          </p>
          <UntrustedHtml html={readmeHtml} className="mt-3" />
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * 외부로 나가는 링크. rel 로 opener/referrer 를 끊고, 클릭을 지표로 센다.
 */
function ExternalLinkButton({
  href,
  children,
  primary,
}: {
  href: string;
  projectId: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
        primary
          ? "bg-foreground text-background hover:opacity-90"
          : "border border-border hover:bg-surface-muted"
      }`}
    >
      {children}
    </a>
  );
}
