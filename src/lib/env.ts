import { z } from "zod";

/**
 * 환경변수는 서버에서만 읽는다. 이 모듈을 클라이언트 컴포넌트에서 import 하면
 * 시크릿이 번들에 섞여 들어가므로, 서버 전용임을 런타임에도 못박아 둔다.
 */
/**
 * 값이 비어 있는 변수는 없는 것으로 본다.
 *
 * 호스팅 화면에서 변수 이름만 만들어두고 값을 비워두면 undefined 가 아니라 빈
 * 문자열이 들어온다. 그러면 "안 넣었을 때는 잘 되는데 이름만 만들어두면 죽는" 상태가
 * 되는데, 로그에는 "Invalid URL" 한 줄만 남아서 원인을 찾기 어렵다.
 * 소셜 자격증명에서 공백만 든 값을 설정 안 된 것으로 본 것과 같은 기준이다.
 */
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL 이 필요합니다"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "비어 있거나 너무 짧습니다 (최소 16자)"),
  BETTER_AUTH_URL: blank(z.url("주소 형식이 아닙니다 (예: https://firework.vercel.app)").default("http://localhost:3000")),

  // 소셜 프로바이더는 전부 선택이다. 설정된 것만 로그인 화면에 뜬다.
  GOOGLE_CLIENT_ID: blank(z.string().optional()),
  GOOGLE_CLIENT_SECRET: blank(z.string().optional()),
  KAKAO_CLIENT_ID: blank(z.string().optional()),
  KAKAO_CLIENT_SECRET: blank(z.string().optional()),
  NAVER_CLIENT_ID: blank(z.string().optional()),
  NAVER_CLIENT_SECRET: blank(z.string().optional()),
  GITHUB_CLIENT_ID: blank(z.string().optional()),
  GITHUB_CLIENT_SECRET: blank(z.string().optional()),

  // 저장소 메타 수집용. 없어도 동작하지만 시간당 60회로 제한된다.
  GITHUB_TOKEN: blank(z.string().optional()),

  // 이메일 인증 코드 발송. 없으면 코드를 서버 콘솔에 찍는다(개발용).
  RESEND_API_KEY: blank(z.string().optional()),
  EMAIL_FROM: blank(z.string().optional()),

  // 최초 관리자를 만드는 경로. 콤마로 구분한 이메일 목록.
  // 여기 적힌 이메일로 로그인하면 관리자로 승격된다. 그 뒤로는 관리자가
  // 화면에서 다른 사람을 임명할 수 있으므로, 이 값은 부트스트랩 용도다.
  ADMIN_EMAILS: blank(z.string().optional()),
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
    // "무엇이 잘못됐다" 만으로는 부족하다. 대부분은 .env 를 복사만 하고 비밀키를
    // 채우지 않아서 나는 오류이므로, 바로 실행할 수 있는 명령을 알려준다.
    throw new Error(
      `환경변수 설정이 올바르지 않습니다.\n${issues}\n\n` +
        `아래를 실행하면 .env 를 만들고 비밀키를 채웁니다.\n\n    npm run setup\n`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * 부트스트랩 관리자 이메일 목록.
 *
 * 이메일은 소셜 프로바이더가 알려주는 값이므로, 프로바이더를 믿을 수 있어야
 * 의미가 있다. 그래서 승격은 emailVerified 인 계정에만 적용한다(auth.ts 참고).
 */
export function bootstrapAdminEmails(env: ServerEnv): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 자격증명이 양쪽 다 채워진 프로바이더만 "설정됨"으로 본다.
 *
 * 공백을 걷어내고 본다. 공백 한 칸은 truthy 라서 그냥 두면 버튼은 뜨는데 로그인은
 * invalid_code 로 실패한다 — 설정이 안 된 것보다 알아채기 훨씬 어려운 상태다.
 */
const filled = (...values: (string | undefined)[]) => values.every((v) => (v ?? "").trim() !== "");

export function configuredProviders(env: ServerEnv) {
  return {
    google: filled(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    kakao: filled(env.KAKAO_CLIENT_ID, env.KAKAO_CLIENT_SECRET),
    naver: filled(env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET),
    github: filled(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
  };
}

export type ProviderId = keyof ReturnType<typeof configuredProviders>;
