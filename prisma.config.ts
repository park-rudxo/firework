import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 부터 .env 를 자동으로 읽지 않는다. CLI(마이그레이션·studio)가 쓸 값이므로
// 여기서 직접 로드한다. 런타임(Next.js)은 프레임워크가 알아서 .env 를 읽는다.
config();

/**
 * 연결 문자열이 Prisma 7 부터 schema.prisma 의 datasource 블록에서 이 파일로 옮겨졌다.
 * 여기 url 은 Prisma CLI 전용이고, 런타임 PrismaClient 는 src/lib/db.ts 에서
 * 드라이버 어댑터(@prisma/adapter-pg)로 따로 연결한다.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
