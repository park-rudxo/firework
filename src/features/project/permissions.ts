import "server-only";

import type { ProjectMemberRole } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * 프로젝트 권한.
 *
 * 예전에는 곳곳에서 `project.ownerId === viewer.id` 로 직접 비교했다. 그러면
 * ProjectMember 테이블에 OWNER/MAINTAINER/CONTRIBUTOR 를 만들어두고도 팀원이
 * 실제로 할 수 있는 일이 하나도 없다. 팀이 만든 프로젝트를 모으는 서비스에서
 * 등록한 한 사람만 손댈 수 있다면, 그 사람이 바쁠 때 프로젝트가 멈춘다.
 *
 * 그래서 권한 판정은 전부 이 파일을 지난다.
 *
 *  - OWNER      — 등록자. 삭제·공개·소유권 이전까지
 *  - MAINTAINER — 공동 관리자. 내용 수정, 소식 게시, 제보 처리, 설문·일정 운영
 *  - CONTRIBUTOR — 팀원으로 이름이 올라갈 뿐, 관리 권한은 없다
 *
 * 소유자 행은 프로젝트를 만들 때 함께 생기지만(actions.ts), 예전 데이터에는 없을 수
 * 있으므로 ownerId 도 항상 함께 본다.
 */
export const MANAGER_ROLES: ProjectMemberRole[] = ["OWNER", "MAINTAINER"];

export type ProjectAccess = {
  projectId: string;
  role: ProjectMemberRole | null;
  isOwner: boolean;
  /** 내용 수정·소식 게시·제보 처리처럼 운영에 해당하는 일. */
  canManage: boolean;
  /** 공개·비공개 전환, 팀원 구성 변경처럼 되돌리기 어려운 일. */
  canAdminister: boolean;
};

export const NO_ACCESS = (projectId: string): ProjectAccess => ({
  projectId,
  role: null,
  isOwner: false,
  canManage: false,
  canAdminister: false,
});

/**
 * 한 프로젝트에 대한 권한을 판정한다. 로그인하지 않았으면 아무 권한도 없다.
 */
export async function getProjectAccess(
  project: { id: string; ownerId: string },
  viewerId: string | undefined,
): Promise<ProjectAccess> {
  if (!viewerId) return NO_ACCESS(project.id);

  const isOwner = project.ownerId === viewerId;
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: viewerId } },
    select: { role: true },
  });

  const role: ProjectMemberRole | null = isOwner ? "OWNER" : (membership?.role ?? null);

  return {
    projectId: project.id,
    role,
    isOwner,
    canManage: isOwner || role === "MAINTAINER",
    canAdminister: isOwner,
  };
}

/** 관리 권한이 있는 프로젝트를 slug 로 찾는다. 없거나 권한이 없으면 null. */
export async function findManageableProject(slug: string, viewerId: string | undefined) {
  if (!viewerId) return null;
  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true, repoUrl: true },
  });
  if (!project) return null;

  const access = await getProjectAccess(project, viewerId);
  if (!access.canManage) return null;
  return { ...project, access };
}

/**
 * 알림을 받아야 할 관리 팀. 제보가 들어왔을 때 여기 있는 사람 전원에게 간다.
 * 등록자 한 명에게만 보내면 팀 프로젝트에서 제보가 그 사람 받은 편지함에 갇힌다.
 */
export async function managerUserIds(projectId: string): Promise<string[]> {
  const [project, members] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
    db.projectMember.findMany({
      where: { projectId, role: { in: MANAGER_ROLES } },
      select: { userId: true },
    }),
  ]);

  const ids = new Set(members.map((m) => m.userId));
  if (project) ids.add(project.ownerId);
  return [...ids];
}
