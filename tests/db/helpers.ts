import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

/**
 * DB 를 실제로 때리는 테스트용 보조.
 *
 * 구독·알림 동의·권한은 규칙이 여러 테이블에 걸쳐 있어서, 함수 하나를 흉내내는
 * 것으로는 "구독을 끊으면 동의도 지워지는가" 같은 것을 확인할 수 없다.
 * 그래서 이쪽은 진짜 Postgres 에 대고 검증한다.
 */

export async function resetDb(): Promise<void> {
  // 자식부터 지운다. FK 는 대부분 CASCADE 지만 순서를 명시해두면 실패가 읽힌다.
  await db.outboundMessage.deleteMany();
  await db.projectNotificationPref.deleteMany();
  await db.bugReport.deleteMany();
  await db.projectUpdate.deleteMany();
  await db.projectFollow.deleteMany();
  await db.projectLike.deleteMany();
  await db.projectTry.deleteMany();
  await db.projectMember.deleteMany();
  await db.mattermostAccount.deleteMany();
  await db.project.deleteMany();
  await db.profile.deleteMany();
  await db.user.deleteMany();
}

export async function makeUser(displayName: string) {
  const id = randomUUID();
  const user = await db.user.create({
    data: {
      id,
      name: displayName,
      email: `${id}@example.test`,
      emailVerified: true,
      updatedAt: new Date(),
      profile: { create: { displayName } },
    },
  });
  return user;
}

export async function makeProject(ownerId: string, name = "테스트 프로젝트") {
  const slug = `p-${randomUUID().slice(0, 8)}`;
  return db.project.create({
    data: {
      slug,
      name,
      tagline: "한 줄 소개",
      description: "설명",
      category: "WEB",
      demoUrl: "https://example.test",
      ownerId,
      status: "PUBLISHED",
      publishedAt: new Date(),
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
}
