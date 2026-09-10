import { config } from "dotenv";

/**
 * Prisma CLI 와 마찬가지로 .env 를 직접 읽는다. Next.js 는 프레임워크가 읽어주지만
 * vitest 는 그렇지 않아서, DB 를 쓰는 테스트가 DATABASE_URL 을 못 찾고 죽는다.
 * 이미 환경에 값이 있으면(CI) 덮어쓰지 않는다.
 */
config();
