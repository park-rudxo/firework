import "server-only";
import { db } from "@/lib/db";

/**
 * 팀 초대 조회.
 *
 * 검색과 초대는 **Mattermost 인증을 마친 계정에만** 건다. 닉네임은 본인이 적어내는
 * 값이라 동명이인과 사칭을 가려내지 못한다. 인증되지 않은 사람은 검색에도 잡히지
 * 않고, 대신 "먼저 계정을 연결해달라" 고 안내한다 — 계정을 대신 만들어주거나
 * Mattermost 구성원 명부를 통째로 긁어오지 않는다.
 */

export const invitationSelect = {
  id: true,
  role: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  invitee: {
    select: {
      id: true,
      name: true,
      profile: { select: { displayName: true } },
      mattermostIdentity: { select: { username: true } },
    },
  },
} as const;

export async function listProjectInvitations(projectId: string) {
  return db.projectInvitation.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: invitationSelect,
  });
}

export async function listProjectMembers(projectId: string) {
  return db.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          profile: { select: { displayName: true } },
          mattermostIdentity: { select: { username: true } },
        },
      },
    },
  });
}

/** 내가 받은 대기 중인 초대. 초대함과 헤더 배지에 쓴다. */
export async function listMyInvitations(userId: string) {
  return db.projectInvitation.findMany({
    where: { inviteeId: userId, status: "PENDING", project: { status: { not: "REMOVED" } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      project: { select: { slug: true, name: true, tagline: true, iconUrl: true } },
      inviter: { select: { name: true, profile: { select: { displayName: true } } } },
    },
  });
}

export async function pendingInvitationCount(userId: string): Promise<number> {
  return db.projectInvitation.count({
    where: { inviteeId: userId, status: "PENDING", project: { status: { not: "REMOVED" } } },
  });
}

/** 후보가 지금 어떤 상태인지. 왜 초대할 수 없는지를 화면에서 그대로 보여준다. */
export type InviteeState = "INVITABLE" | "PENDING" | "MEMBER";

/**
 * 초대할 사람 찾기.
 *
 * Mattermost 사용자명으로만 찾는다. 결과에 담아 보내는 것은 사용자명이 아니라
 * **불변 사용자 id** 다 — 사용자명은 바뀔 수 있고, 폼이 열려 있는 사이에 바뀌면
 * 엉뚱한 사람을 초대하게 된다.
 *
 * 이미 팀원이거나 초대가 대기 중인 사람도 목록에는 남기고 이유만 붙인다.
 * 목록에서 빼버리면 방금 초대한 사람이 화면에서 사라져, 초대가 된 것인지 실패한
 * 것인지 알 수 없다.
 */
export async function searchInvitees(projectId: string, query: string, limit = 8) {
  const term = query.trim();
  if (term.length < 2) return [];

  const [project, members, pending, rows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
    db.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
    db.projectInvitation.findMany({
      where: { projectId, status: "PENDING" },
      select: { inviteeId: true },
    }),
    db.mattermostIdentity.findMany({
      where: { username: { contains: term, mode: "insensitive" } },
      orderBy: { username: "asc" },
      take: limit,
      select: {
        mattermostUserId: true,
        username: true,
        user: { select: { id: true, name: true, profile: { select: { displayName: true } } } },
      },
    }),
  ]);

  const memberIds = new Set<string>([
    ...(project ? [project.ownerId] : []),
    ...members.map((m) => m.userId),
  ]);
  const pendingIds = new Set(pending.map((p) => p.inviteeId));

  return rows.map((r) => ({
    ...r,
    state: (memberIds.has(r.user.id)
      ? "MEMBER"
      : pendingIds.has(r.user.id)
        ? "PENDING"
        : "INVITABLE") as InviteeState,
  }));
}
