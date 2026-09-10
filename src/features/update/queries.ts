import "server-only";

import { db } from "@/lib/db";

/**
 * 진행 소식.
 *
 * GitHub 커밋은 "무언가 바뀌었다" 는 말은 해주지만 사용자에게 뜻이 없다.
 * 여기 쌓이는 것은 제작자가 사람 말로 적은 변경 소식이고, 서비스 운영이 끝난 뒤에도
 * 프로젝트 페이지에 남는다. 배포 주소가 죽어도 무엇을 만들었고 어떻게 고쳐왔는지는
 * 남아야, 다음 기수가 찾아볼 것이 생긴다.
 */
export const projectUpdateSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  fixedBugReportIds: true,
  publishedAt: true,
  author: { select: { name: true, profile: { select: { displayName: true } } } },
} as const;

export type ProjectUpdateItem = Awaited<ReturnType<typeof listProjectUpdates>>[number];

export async function listProjectUpdates(projectId: string, limit = 20) {
  return db.projectUpdate.findMany({
    where: { projectId },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: projectUpdateSelect,
  });
}

/** 구독 목록 화면에서 "내가 구독한 프로젝트에 뭐가 올라왔나" 를 한 번에 본다. */
export async function listUpdatesForSubscriber(viewerId: string, limit = 30) {
  return db.projectUpdate.findMany({
    where: { project: { follows: { some: { userId: viewerId } }, status: "PUBLISHED" } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      ...projectUpdateSelect,
      project: { select: { slug: true, name: true, iconUrl: true } },
    },
  });
}
