import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { getProjectBySlug } from "@/features/project/queries";
import { SubscriptionForm } from "@/components/community/subscription-form";
import { ActionForm } from "@/components/community/action-form";
import { submitBug } from "@/features/community/actions";
import { mattermostDeliveryConfigured } from "@/features/mattermost/config";
const input = "w-full rounded-xl border border-border bg-background p-3";
export default async function ProjectCommunity({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const project = await getProjectBySlug(slug, viewer?.id);
  if (!project) notFound();
  const [updates, follow, identity] = await Promise.all([
    db.projectUpdate.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    viewer ? db.projectFollow.findUnique({ where: { projectId_userId: { projectId: project.id, userId: viewer.id } } }) : null,
    viewer ? db.mattermostIdentity.findUnique({ where: { userId: viewer.id } }) : null,
  ]);
  const ready = !!identity && mattermostDeliveryConfigured();
  return <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
    <Link href={`/projects/${slug}`} className="text-sm underline">← 프로젝트 소개</Link>
    <h1 className="text-2xl font-semibold">{project.name} · 소식과 피드백</h1>
    {viewer && project.status === "PUBLISHED" ? <section className="rounded-xl border border-border bg-surface p-5">
      <SubscriptionForm key={slug} slug={slug} following={!!follow} updates={follow?.notifyUpdates ?? false} recruitment={follow?.notifyRecruitment ?? false} ready={ready} />
    </section> : !viewer ? <Link className="text-primary underline" href={`/sign-in?next=${encodeURIComponent("/projects/" + slug + "/community")}`}>로그인하고 구독·버그 제보하기 →</Link> : null}
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">진행 소식</h2>
      {!updates.length ? <p className="text-muted-foreground">아직 게시된 소식이 없습니다.</p> : null}
      {updates.map(post => <article key={post.id} className="space-y-2 rounded-xl border border-border p-5">
        <p className="text-xs text-muted-foreground">{post.kind === "UPDATE" ? "업데이트·진행 소식" : "참여 모집"} · {post.createdAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        <h3 className="font-semibold">{post.title}</h3>
        <p className="whitespace-pre-wrap break-words text-sm">{post.body}</p>
      </article>)}
    </section>
    {viewer && project.status === "PUBLISHED" ? <section className="space-y-4">
      <h2 className="text-xl font-semibold">버그 제보</h2>
      <p className="text-sm text-muted-foreground">신고 내용과 작성자는 프로젝트 관리 팀에만 전달됩니다. 익명 설문과는 별개이며 비밀번호 등 민감한 정보는 적지 마세요.</p>
      <ActionForm action={submitBug.bind(null, slug)} label="버그 제보하기">
        <label className="block space-y-1"><span>제목</span><input name="title" required minLength={2} maxLength={120} className={input} /></label>
        <label className="block space-y-1"><span>재현 방법·기대 동작·실제 동작</span><textarea name="description" required minLength={10} maxLength={5000} rows={5} className={input} /></label>
        <label className="flex items-center gap-2 text-sm"><input name="notifyStatus" type="checkbox" disabled={!ready} /> 이 신고의 처리 상황을 Mattermost로 받기 (선택)</label>
      </ActionForm>
      <Link href="/bugs" className="inline-block text-primary underline">내 버그 신고 확인 →</Link>
    </section> : null}
  </div>;
}
