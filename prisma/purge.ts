import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  SEED_EMAIL_DOMAIN,
  SEED_PROJECT_SLUGS,
  SEED_USER_ID_PREFIX,
} from "./seed-manifest";

config();

/**
 * 데모(시드) 데이터만 골라 지운다.
 *
 * 실서비스를 열기 전에 반드시 한 번 돌려야 하는 명령이다. 시드는 화면을 확인하려고
 * 넣는 것이라, 그대로 두고 배포하면 "모아모아" 같은 가짜 프로젝트가 홈에 그대로 뜬다.
 *
 * **전체 삭제가 아니다.** 시드가 만든 표식(seed-manifest.ts)이 붙은 행만 지운다.
 * 그래서 이미 진짜 사용자가 들어온 뒤에 돌려도 안전하다.
 *
 * 실행: npm run db:purge
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const users = await db.user.findMany({
    where: {
      id: { startsWith: SEED_USER_ID_PREFIX },
      email: { endsWith: SEED_EMAIL_DOMAIN },
    },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  // 시드 사용자가 만든 프로젝트, 그리고 소유자가 바뀌었더라도 슬러그로 알아볼 수 있는 것.
  const projects = await db.project.findMany({
    where: {
      OR: [
        { ownerId: { in: userIds } },
        { slug: { in: [...SEED_PROJECT_SLUGS] } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });

  if (userIds.length === 0 && projects.length === 0) {
    console.log("지울 데모 데이터가 없습니다. 이미 깨끗합니다.");
    return;
  }

  console.log(`데모 프로젝트 ${projects.length}개, 데모 계정 ${userIds.length}개를 지웁니다.`);
  for (const p of projects) console.log(`  · ${p.name} (/${p.slug})`);

  // 프로젝트를 먼저 지운다. 설문·응답·추첨·일정·통계는 전부 프로젝트에 cascade 로 매달려 있다.
  // 사용자를 지우면 그 사용자가 소유한 프로젝트도 함께 사라지지만, 소유자가 바뀐
  // 데모 프로젝트가 남을 수 있어 두 경로를 모두 밟는다.
  await db.project.deleteMany({ where: { id: { in: projects.map((p) => p.id) } } });

  // 사용자에 매달린 것(프로필·세션·계정·반응·참여·응모·신고·알림)도 cascade 로 함께 지워진다.
  await db.user.deleteMany({ where: { id: { in: userIds } } });

  // 프로젝트가 사라져도 남는 것들. 대상이 없어진 신고는 관리자 큐만 어지럽힌다.
  const orphanReports = await db.report.deleteMany({
    where: { targetType: "PROJECT", targetId: { in: projects.map((p) => p.id) } },
  });

  console.log(
    `\n완료. 프로젝트 ${projects.length}개, 계정 ${userIds.length}개, 신고 ${orphanReports.count}건을 지웠습니다.`,
  );
  console.log("진짜 사용자 데이터는 건드리지 않았습니다.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
