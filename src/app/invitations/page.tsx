import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectIcon } from "@/components/project/project-card";
import { TeamForm } from "@/components/community/team-form";
import { respondToInvitation } from "@/features/team/actions";
import { listMyInvitations } from "@/features/team/queries";
import { getViewer } from "@/lib/session";

export const metadata = { title: "초대함" };

const ROLE_LABEL: Record<string, string> = {
  MAINTAINER: "공동 관리자",
  CONTRIBUTOR: "팀원",
};

const ROLE_HINT: Record<string, string> = {
  MAINTAINER: "소식 게시, 버그 제보 처리, 설문·일정 운영까지 맡습니다.",
  CONTRIBUTOR: "팀원으로 이름이 올라갑니다. 운영 권한은 없습니다.",
};

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

/**
 * 받은 초대.
 *
 * 초대는 사이트 안에서만 알린다. 초대받았다는 이유로 Mattermost 메시지를 보내지
 * 않는다 — 그 사람은 이 프로젝트의 알림을 켠 적이 없다.
 */
export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/invitations");

  const invitations = await listMyInvitations(viewer.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">초대함</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        수락해야 팀원이 됩니다. 수락한 뒤에도 알림은 꺼져 있고, 필요하면 직접 켜시면 됩니다.
      </p>

      {/* 답한 초대는 목록에서 사라진다. 결과를 카드 안에 두면 함께 없어져,
          눌렀는데 아무 일도 없었던 것처럼 보인다. */}
      {done === "declined" ? (
        <p role="status" className="mt-4 rounded-xl border border-border bg-surface p-3.5 text-sm">
          초대를 거절했습니다.
        </p>
      ) : null}

      {invitations.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          받은 초대가 없습니다.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {invitations.map((i) => (
            <li
              key={i.id}
              id={`invite-${i.id}`}
              className="scroll-mt-20 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <ProjectIcon iconUrl={i.project.iconUrl} name={i.project.name} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/projects/${i.project.slug}`}
                    className="font-medium hover:underline"
                  >
                    {i.project.name}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">{i.project.tagline}</p>
                </div>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">
                  {ROLE_LABEL[i.role] ?? i.role}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {i.inviter.profile?.displayName ?? i.inviter.name} 님이 초대했습니다 ·{" "}
                {fmt.format(i.createdAt)}
                <span className="mt-1 block">{ROLE_HINT[i.role] ?? ""}</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <TeamForm action={respondToInvitation} label="수락">
                  <input type="hidden" name="invitationId" value={i.id} />
                  <input type="hidden" name="accept" value="yes" />
                </TeamForm>
                <TeamForm action={respondToInvitation} label="거절" danger>
                  <input type="hidden" name="invitationId" value={i.id} />
                  <input type="hidden" name="accept" value="no" />
                </TeamForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
