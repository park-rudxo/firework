import { z } from "zod";

/**
 * 환경변수는 서버에서만 읽는다. 이 모듈을 클라이언트 컴포넌트에서 import 하면
 * 시크릿이 번들에 섞여 들어가므로, 서버 전용임을 런타임에도 못박아 둔다.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL 이 필요합니다"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET 은 최소 16자여야 합니다"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),

  // 소셜 프로바이더는 전부 선택이다. 설정된 것만 로그인 화면에 뜬다.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  NAVER_CLIENT_ID: z.string().optional(),
  NAVER_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // 저장소 메타 수집용. 없어도 동작하지만 시간당 60회로 제한된다.
  GITHUB_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * 빌드 타임에는 환경변수가 없을 수 있으므로 모듈 최상단이 아니라 호출 시점에 검증한다.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`환경변수 설정이 올바르지 않습니다.\n${issues}\n\n.env.example 을 참고하세요.`);
  }

  cached = parsed.data;
  return cached;
}

/** 자격증명이 양쪽 다 채워진 프로바이더만 "설정됨"으로 본다. */
export function configuredProviders(env: ServerEnv) {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    kakao: Boolean(env.KAKAO_CLIENT_ID && env.KAKAO_CLIENT_SECRET),
    naver: Boolean(env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET),
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  };
}

export type ProviderId = keyof ReturnType<typeof configuredProviders>;
