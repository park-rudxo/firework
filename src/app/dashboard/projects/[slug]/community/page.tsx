import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { projectAccess } from "@/features/community/access";
import { BUG_STATUS_LABEL } from "@/features/community/policy";
import { publishUpdate, setManagementNotifications, updateBug } from "@/features/community/actions";
import { ActionForm } from "@/components/community/action-form";
import { mattermostDeliveryConfigured } from "@/features/mattermost/config";
const input = "w-full rounded-xl border border-border bg-background p-3";
export default async function CommunityManagement({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const access = await projectAccess(slug, viewer.id).catch(() => null);
  if (!access?.manager) notFound();
  const { project, member } = access;
  const [bugs, identity] = await Promise.all([
    db.bugReport.findMany({ where: { projectId: project.id }, include: { reporter: { select: { name: true, profile: { select: { displayName: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.mattermostIdentity.findUnique({ where: { userId: viewer.id } }),
  ]);
  const ready = !!identity && mattermostDeliveryConfigured();
  return <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
    <Link href="/dashboard" className="text-sm underline">← 내 프로젝트</Link>
    <h1 className="text-2xl font-semibold">{project.name} · 소식·버그 관리</h1>
    <Link href={`/projects/${slug}/community`} className="text-primary underline">사용자에게 보이는 소식 페이지 →</Link>
    <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">내 관리 알림</h2>
      <ActionForm action={setManagementNotifications.bind(null, slug)}>
        <label className="flex items-center gap-2"><input name="management" type="checkbox" defaultChecked={member?.notifyManagement ?? false} disabled={!ready} /> 새 버그 신고를 Mattermost로 받기</label>
        <p className="text-sm text-muted-foreground">기본은 꺼짐입니다. 신고 내용은 이 화면에서 확인하고, 메시지에는 확인 링크만 보냅니다.</p>
        {!ready ? <Link href="/settings/mattermost" className="text-sm underline">Mattermost 연결 상태 확인 →</Link> : null}
      </ActionForm>
    </section>
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">진행 소식 게시</h2>
      <ActionForm action={publishUpdate.bind(null, slug)} label="소식 게시">
        <label className="block space-y-1"><span>소식 종류</span><select name="kind" className={input}><option value="UPDATE">업데이트·진행 소식</option><option value="RECRUITMENT">테스트·설문·이벤트 모집</option></select></label>
        <label className="block space-y-1"><span>제목</span><input name="title" required minLength={2} maxLength={120} className={input} /></label>
        <label className="block space-y-1"><span>내용</span><textarea name="body" required minLength={2} maxLength={5000} rows={5} className={input} /></label>
        <p className="text-sm text-muted-foreground">공개 프로젝트의 소식은 누구나 볼 수 있습니다. 선택한 종류의 알림에 동의한 구독자만 메시지를 받습니다.</p>
      </ActionForm>
    </section>
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">받은 버그 신고</h2>
      {!bugs.length ? <p className="text-muted-foreground">접수된 버그 신고가 없습니다.</p> : null}
      {bugs.map(bug => <article key={bug.id} className="space-y-3 rounded-xl border border-border p-5">
        <h3 className="font-semibold">{bug.title}</h3>
        <p className="text-xs text-muted-foreground">{bug.reporter.profile?.displayName ?? bug.reporter.name} · {bug.createdAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        <p className="whitespace-pre-wrap break-words text-sm">{bug.description}</p>
        <ActionForm action={updateBug.bind(null, bug.id)} label="처리 상태 저장">
          <label className="block space-y-1"><span>처리 상태</span><select name="status" defaultValue={bug.status} className={input}>{Object.entries(BUG_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block space-y-1"><span>신고자에게 남길 답변</span><textarea name="resolution" defaultValue={bug.resolution} maxLength={5000} rows={3} className={input} /></label>
        </ActionForm>
      </article>)}
    </section>
  </div>;
}
