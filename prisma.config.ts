import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 부터 .env 를 자동으로 읽지 않는다. CLI(마이그레이션·studio)가 쓸 값이므로
// 여기서 직접 로드한다. 런타임(Next.js)은 프레임워크가 알아서 .env 를 읽는다.
config();

/**
 * 연결 문자열이 Prisma 7 부터 schema.prisma 의 datasource 블록에서 이 파일로 옮겨졌다.
 * 여기 url 은 Prisma CLI 전용이고, 런타임 PrismaClient 는 src/lib/db.ts 에서
 * 드라이버 어댑터(@prisma/adapter-pg)로 따로 연결한다.
 *
 * 운영에서 Neon 같은 서버리스 Postgres 를 쓰면 런타임은 풀러(-pooler)를 거치는 게
 * 유리하지만, 마이그레이션은 풀러(PgBouncer)를 통과하면 어드바이저리 락과 DDL 이
 * 어긋난다. 그래서 DIRECT_DATABASE_URL 이 있으면 CLI 는 그쪽(풀러를 거치지 않는
 * 직결 주소)을 쓴다. 로컬처럼 풀러가 없으면 안 넣으면 되고, 그때는 DATABASE_URL 이다.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_DATABASE_URL
      ? env("DIRECT_DATABASE_URL")
      : env("DATABASE_URL"),
  },
});
