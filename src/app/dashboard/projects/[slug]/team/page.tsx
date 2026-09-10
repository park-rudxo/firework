import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TeamForm } from "@/components/community/team-form";
import { projectAccess } from "@/features/community/access";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
} from "@/features/team/actions";
import { listProjectInvitations, listProjectMembers, searchInvitees } from "@/features/team/queries";
import { getViewer } from "@/lib/session";

export const metadata = { title: "팀 관리" };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "등록자",
  MAINTAINER: "공동 관리자",
  CONTRIBUTOR: "팀원",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "수락 대기",
  ACCEPTED: "수락함",
  DECLINED: "거절함",
  CANCELLED: "취소됨",
};

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

export default async function TeamManagement({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/projects/${slug}/team`)}`);

  // 팀 구성은 등록자만 바꾼다. 공동 관리자가 팀을 바꿀 수 있으면
  // 등록자가 모르는 사이에 팀이 달라진다.
  const access = await projectAccess(slug, viewer.id).catch(() => null);
  if (!access?.owner) notFound();
  const { project } = access;

  const [members, invitations, candidates] = await Promise.all([
    listProjectMembers(project.id),
    listProjectInvitations(project.id),
    q ? searchInvitees(project.id, q) : Promise.resolve([]),
  ]);

  const pending = invitations.filter((i) => i.status === "PENDING");
  const answered = invitations.filter((i) => i.status !== "PENDING");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <Link href="/dashboard" className="text-sm underline">
        ← 내 프로젝트
      </Link>
      <h1 className="text-2xl font-semibold">{project.name} · 팀</h1>
      <p className="text-sm text-muted-foreground">
        초대만으로는 팀원이 되지 않습니다. 상대가 수락해야 권한이 생기고, 수락한 뒤에도 알림은
        꺼져 있습니다.
      </p>

      {/* ── 초대하기 ─────────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">팀원 초대</h2>
        <p className="text-sm text-muted-foreground">
          Mattermost 계정 인증을 마친 사람만 검색됩니다. 닉네임은 본인이 적는 값이라 동명이인을
          가려낼 수 없어서, 인증된 계정에만 초대를 겁니다. 상대가 아직 연결하지 않았다면 먼저
          <Link href="/settings/mattermost" className="text-primary underline">
            {" "}
            계정 연결
          </Link>
          을 부탁해주세요.
        </p>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5 text-sm">
            Mattermost 사용자명
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="kim.ssafy"
              aria-label="Mattermost 사용자명으로 검색"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>
          <button className="rounded-xl border border-border px-4 py-2 text-sm">찾기</button>
        </form>

        {q && candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            검색 결과가 없습니다. Mattermost 계정 인증을 마친 사람만 찾을 수 있습니다.
          </p>
        ) : null}

        {candidates.length > 0 ? (
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li
                key={c.mattermostUserId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <span className="font-medium">@{c.username}</span>
                <span className="text-sm text-muted-foreground">
                  {c.user.profile?.displayName ?? c.user.name}
                </span>

                {/* 이미 팀원이거나 초대가 대기 중이어도 폼은 그대로 둔다.
                    걷어내면 방금 한 초대의 결과 메시지까지 함께 사라져,
                    됐는지 실패했는지 알 수 없다. 버튼 자리만 안내로 바뀐다. */}
                <TeamForm
                  action={inviteMember.bind(null, slug)}
                  label="초대"
                  className="ml-auto"
                  note={
                    c.state === "MEMBER"
                      ? "이미 팀원"
                      : c.state === "PENDING"
                        ? "수락 대기 중"
                        : undefined
                  }
                >
                  {/* 사용자명이 아니라 불변 id 로 보낸다. 폼이 열려 있는 사이에
                      사용자명이 바뀌어도 엉뚱한 사람을 초대하지 않는다. */}
                  <input type="hidden" name="mattermostUserId" value={c.mattermostUserId} />
                  <label className="flex flex-col gap-1.5 text-sm">
                    역할
                    <select
                      name="role"
                      defaultValue="CONTRIBUTOR"
                      aria-label={`${c.username} 의 역할`}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <option value="CONTRIBUTOR">팀원 (이름만 올라감)</option>
                      <option value="MAINTAINER">공동 관리자 (운영까지)</option>
                    </select>
                  </label>
                </TeamForm>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── 대기 중인 초대 ───────────────────────────────── */}
      {pending.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold">수락 대기 중</h2>
          <ul className="space-y-2">
            {pending.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <span className="font-medium">
                  {i.invitee.profile?.displayName ?? i.invitee.name}
                </span>
                {i.invitee.mattermostIdentity ? (
                  <span className="text-sm text-muted-foreground">
                    @{i.invitee.mattermostIdentity.username}
                  </span>
                ) : null}
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">
                  {ROLE_LABEL[i.role]}
                </span>
                <span className="text-xs text-muted-foreground">{fmt.format(i.createdAt)}</span>
                <TeamForm
                  action={cancelInvitation.bind(null, slug)}
                  label="초대 취소"
                  className="ml-auto"
                  danger
                >
                  <input type="hidden" name="invitationId" value={i.id} />
                </TeamForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── 팀원 ─────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">팀원</h2>
        <p className="text-sm text-muted-foreground">
          공동 관리자는 소식 게시·제보 처리·설문·일정까지 맡습니다. 공개 여부와 팀 구성은
          등록자만 바꿉니다.
        </p>
        <ul className="space-y-2">
          <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
            <span className="font-medium">{viewer.displayName}</span>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">등록자</span>
          </li>
          {members
            .filter((m) => m.user.id !== project.ownerId)
            .map((m) => (
              <li
                key={m.user.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <span className="font-medium">{m.user.profile?.displayName ?? m.user.name}</span>
                {m.user.mattermostIdentity ? (
                  <span className="text-sm text-muted-foreground">
                    @{m.user.mattermostIdentity.username}
                  </span>
                ) : null}
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">
                  {ROLE_LABEL[m.role]}
                </span>

                <div className="ml-auto flex flex-wrap items-end gap-2">
                  <TeamForm action={changeMemberRole.bind(null, slug)} label="역할 저장">
                    <input type="hidden" name="userId" value={m.user.id} />
                    <label className="flex flex-col gap-1.5 text-sm">
                      역할
                      <select
                        name="role"
                        defaultValue={m.role === "MAINTAINER" ? "MAINTAINER" : "CONTRIBUTOR"}
                        aria-label={`${m.user.profile?.displayName ?? m.user.name} 의 역할`}
                        className="rounded-xl border border-border bg-background px-3 py-2"
                      >
                        <option value="CONTRIBUTOR">팀원</option>
                        <option value="MAINTAINER">공동 관리자</option>
                      </select>
                    </label>
                  </TeamForm>
                  <TeamForm action={removeMember.bind(null, slug)} label="제거" danger>
                    <input type="hidden" name="userId" value={m.user.id} />
                  </TeamForm>
                </div>
              </li>
            ))}
        </ul>
      </section>

      {answered.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">지난 초대</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {answered.map((i) => (
              <li key={i.id}>
                {i.invitee.profile?.displayName ?? i.invitee.name} · {ROLE_LABEL[i.role]} ·{" "}
                {STATUS_LABEL[i.status]}
                {i.respondedAt ? ` · ${fmt.format(i.respondedAt)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
