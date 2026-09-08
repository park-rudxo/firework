import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { serverEnv } from "@/lib/env";

/**
 * 설정을 한 단계 건너뛰었을 때 나오는 Prisma 오류를 사람이 읽을 수 있는 말로 바꾼다.
 *
 * 원래 메시지는 "The table `public.featured_slot` does not exist" 인데, Next 의
 * 개발 오버레이를 거치면 난독화된 Turbopack 청크 이름에 파묻혀 무엇을 해야 하는지가
 * 보이지 않는다. 정작 필요한 건 실행할 명령 한 줄이다.
 */
const CONNECT_HINT =
  "데이터베이스에 연결할 수 없습니다.\n" +
  "컨테이너를 막 띄웠다면 아직 준비 중일 수 있습니다 — up 은 기다려주지 않습니다.\n\n" +
  "    docker compose up -d --wait   (준비될 때까지 기다린 뒤 반환)\n" +
  "    npm run doctor                (어디로 붙고 있는지 확인)\n";

const SETUP_HINTS: Record<string, string> = {
  // 테이블이 없다 — 마이그레이션을 안 돌렸다
  P2021:
    "데이터베이스에 테이블이 없습니다. 마이그레이션을 아직 적용하지 않은 것 같습니다.\n\n    npm run db:deploy\n    npm run db:seed\n",
  // 컬럼이 없다 — 스키마가 바뀌었는데 마이그레이션을 안 돌렸다
  P2022:
    "데이터베이스 스키마가 코드보다 오래되었습니다.\n\n    npm run db:deploy\n",
  // 연결 자체가 안 된다.
  //
  // 드라이버 어댑터를 쓰면 Prisma 의 P1001 대신 드라이버 코드가 그대로 올라오는
  // 경로가 있다. 컨테이너가 아직 준비되기 전에 붙으면 ECONNREFUSED 로 온다.
  P1001: CONNECT_HINT,
  ECONNREFUSED: CONNECT_HINT,
  ECONNRESET: CONNECT_HINT,
  ETIMEDOUT: CONNECT_HINT,
  ENOTFOUND: CONNECT_HINT,
  EAI_AGAIN: CONNECT_HINT,
};

/** Prisma 오류에서 실제 원인 한 줄만 뽑는다. 앞쪽은 쿼리 덤프라 도움이 안 된다. */
function lastLine(message: string): string {
  return message.trim().split("\n").filter((l) => l.trim()).pop()?.trim() ?? message.trim();
}

function withSetupHints<T extends PrismaClient>(client: T) {
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            const hint = SETUP_HINTS[error.code];
            if (hint) throw new Error(`${hint}\n(${error.code}: ${lastLine(error.message)})`);
          }
          if (error instanceof Prisma.PrismaClientInitializationError) {
            throw new Error(`${CONNECT_HINT}\n(${lastLine(error.message)})`);
          }
          throw error;
        }
      },
    },
  });
}

/**
 * Prisma 7 은 런타임 연결을 드라이버 어댑터로 받는다(스키마의 datasource.url 은 없어졌다).
 * 개발 중 HMR 이 돌 때마다 새 클라이언트가 생겨 커넥션이 새는 것을 막기 위해
 * globalThis 에 하나만 붙여 재사용한다.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  return withSetupHints(
    new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    }),
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
