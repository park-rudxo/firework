import "server-only";
import { db } from "@/lib/db";
import { canManage } from "./policy";
export class CommunityError extends Error {}
export async function projectAccess(slug: string, userId: string) {
  const project = await db.project.findUnique({
    where: { slug },
    include: { members: { where: { userId } } },
  });
  if (!project || project.status === "REMOVED") throw new CommunityError("프로젝트를 찾을 수 없습니다.");
  const member = project.members[0];
  return { project, member, manager: canManage(project.ownerId, userId, member?.role) };
}
