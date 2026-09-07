import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { serverEnv } from "@/lib/env";

/**
 * Prisma 7 은 런타임 연결을 드라이버 어댑터로 받는다(스키마의 datasource.url 은 없어졌다).
 * 개발 중 HMR 이 돌 때마다 새 클라이언트가 생겨 커넥션이 새는 것을 막기 위해
 * globalThis 에 하나만 붙여 재사용한다.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
