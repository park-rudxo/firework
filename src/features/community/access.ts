import "server-only";
import { db } from "@/lib/db";
import { canAdminister, canManage, isTeamMember } from "./policy";
export class CommunityError extends Error {}

export async function projectAccess(slug: string, userId: string) {
  const project = await db.project.findUnique({
    where: { slug },
    include: { members: { where: { userId } } },
  });
  if (!project || project.status === "REMOVED") throw new CommunityError("프로젝트를 찾을 수 없습니다.");
  const member = project.members[0];
  return {
    project,
    member,
    manager: canManage(project.ownerId, userId, member?.role),
    owner: canAdminister(project.ownerId, userId),
    teamMember: isTeamMember(project.ownerId, userId, member?.role),
  };
}

/**
 * 프로젝트를 이미 손에 들고 있는 호출부(설문·추첨·일정 액션)를 위한 판정.
 *
 * 판정 규칙은 projectAccess 와 같은 policy.ts 하나에서 온다 — 조회 모양만 다르다.
 * 규칙을 두 벌로 두면 한쪽만 고치는 날이 오고, 그때 권한이 갈린다.
 */
export async function memberRole(
  projectId: string,
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

export async function canManageProject(
  project: { id: string; ownerId: string },
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  return canManage(project.ownerId, userId, await memberRole(project.id, userId));
}

export async function isProjectTeamMember(
  project: { id: string; ownerId: string },
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  return isTeamMember(project.ownerId, userId, await memberRole(project.id, userId));
}

/** 관리 알림을 받아야 할 사람들. 등록자와 공동 관리자 전원이다. */
export async function managerUserIds(projectId: string, ownerId: string): Promise<string[]> {
  const members = await db.projectMember.findMany({
    where: { projectId, role: { in: ["OWNER", "MAINTAINER"] } },
    select: { userId: true },
  });
  return [...new Set([ownerId, ...members.map((m) => m.userId)])];
}
