import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "로그인 실패" };

/**
 * OAuth 콜백이 실패했을 때 오는 곳.
 *
 * Better Auth 기본 화면은 "invalid_code" 같은 코드만 보여줘서, 무엇을 확인해야
 * 하는지 알 수 없다. 실제로 무엇이 어긋났을 때 그 코드가 나오는지 적어둔다.
 */
const EXPLAIN: Record<string, { title: string; checks: string[] }> = {
  invalid_code: {
    title: "인가 코드를 토큰으로 바꾸지 못했습니다",
    checks: [
      "인가 코드는 1회용입니다. 콜백 주소를 새로고침했다면 이미 소진된 것이니 처음부터 다시 로그인해보세요.",
      "`.env` 의 클라이언트 시크릿이 맞는지 확인해주세요. Client ID 를 시크릿 칸에 넣었거나 값이 잘려 붙은 경우가 흔합니다.",
      "`.env` 의 BETTER_AUTH_URL 이 지금 접속한 주소와 같아야 합니다. 토큰 교환에 쓰는 redirect_uri 를 이 값으로 만들기 때문에, localhost 로 등록해두고 다른 주소로 접속하면 어긋납니다.",
      "프로바이더에 등록한 콜백 주소가 {BETTER_AUTH_URL}/api/auth/callback/{provider} 와 정확히 같은지 확인해주세요.",
    ],
  },
  state_not_found: {
    title: "로그인 상태 값을 찾지 못했습니다",
    checks: [
      "로그인을 시작한 창과 돌아온 창이 다르면 생깁니다. 같은 창에서 다시 시도해주세요.",
      "브라우저가 쿠키를 막고 있지 않은지 확인해주세요.",
      "로그인 시작 후 오래 두면 만료됩니다.",
    ],
  },
  provider_not_found: {
    title: "그 프로바이더가 설정되어 있지 않습니다",
    checks: [
      "`.env` 에 해당 프로바이더의 CLIENT_ID 와 CLIENT_SECRET 이 모두 있어야 합니다.",
      "`.env` 를 고친 뒤에는 개발 서버를 다시 시작해야 반영됩니다.",
    ],
  },
  access_denied: {
    title: "로그인을 취소하셨습니다",
    checks: ["프로바이더 화면에서 권한을 허용해야 로그인이 끝납니다."],
  },
};

const FALLBACK = {
  title: "로그인을 마치지 못했습니다",
  checks: [
    "`.env` 의 프로바이더 자격증명과 콜백 주소를 확인해주세요.",
    "`.env` 를 고친 뒤에는 개발 서버를 다시 시작해야 반영됩니다.",
  ],
};

export default async function SignInErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const { error, error_description: description } = await searchParams;
  const info = (error && EXPLAIN[error]) || FALLBACK;

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">{info.title}</h1>

      {error ? (
        <p className="mt-2 text-sm text-muted-foreground">
          코드: <code className="rounded bg-surface-muted px-1.5 py-0.5">{error}</code>
        </p>
      ) : null}
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}

      <h2 className="mt-8 text-sm font-medium">확인할 것</h2>
      <ul className="mt-3 flex flex-col gap-2.5 text-sm text-muted-foreground">
        {info.checks.map((check) => (
          <li key={check} className="flex gap-2">
            <span aria-hidden>·</span>
            <span>{check}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 rounded-xl bg-surface-muted p-3.5 text-xs text-muted-foreground">
        <strong className="text-foreground">터미널을 보세요.</strong> Better Auth 는 프로바이더가
        돌려준 진짜 오류를 서버 콘솔에 찍습니다. 여기 적힌 코드보다 그쪽이 훨씬 구체적입니다.
      </p>

      <Link
        href="/"
        className="mt-8 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        홈으로
      </Link>
    </div>
  );
}
