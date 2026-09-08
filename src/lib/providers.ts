/**
 * 소셜 프로바이더의 화면용 메타데이터.
 *
 * env.ts 와 나눠 둔 이유는 하나다. env.ts 는 시크릿을 읽으므로 클라이언트
 * 컴포넌트가 값으로 import 하면 안 되는데, 로그인 버튼은 클라이언트에 있다.
 * 여기에는 비밀이 될 수 없는 것만 둔다 — 이름, 색, 순서, 환경변수 "키 이름".
 *
 * 라벨과 순서가 로그인 페이지·헤더 메뉴·설정 화면에 각각 복사돼 있던 것도
 * 여기로 모았다. 프로바이더를 하나 늘릴 때 고칠 곳을 한 군데로 만든다.
 */

export const PROVIDER_IDS = ["kakao", "naver", "google", "github"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** 국내 사용자 비중을 생각해 카카오·네이버를 위로 올린다. */
export const PROVIDER_ORDER: readonly ProviderId[] = PROVIDER_IDS;

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  kakao: "카카오",
  naver: "네이버",
  google: "Google",
  github: "GitHub",
};

/** 버튼에 쓰는 브랜드 색. 카카오·네이버는 각 사가 지정한 값이다. */
export const PROVIDER_BUTTON_CLASS: Record<ProviderId, string> = {
  kakao: "bg-[#FEE500] text-[#191600] hover:brightness-95",
  naver: "bg-[#03C75A] text-white hover:brightness-95",
  google: "border border-border bg-surface hover:bg-surface-muted",
  github: "bg-[#24292f] text-white hover:brightness-125",
};

/**
 * 이 프로바이더를 켜려면 .env 에 채워야 하는 키. 값이 아니라 이름이므로
 * 클라이언트로 보내도 된다 — 오히려 개발 중에는 이걸 보여줘야 왜 버튼이
 * 없는지 알 수 있다.
 */
export const PROVIDER_ENV_KEYS: Record<ProviderId, [string, string]> = {
  kakao: ["KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET"],
  naver: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
};

/** 자격증명을 발급받는 콘솔. 안내 문구에서 그대로 링크로 쓴다. */
export const PROVIDER_CONSOLE_URL: Record<ProviderId, string> = {
  kakao: "https://developers.kakao.com/console/app",
  naver: "https://developers.naver.com/apps/#/register",
  google: "https://console.cloud.google.com/apis/credentials",
  github: "https://github.com/settings/developers",
};

/** 프로바이더 콘솔에 등록해야 하는 콜백 주소. Better Auth 가 정한 형태다. */
export function callbackPath(provider: ProviderId): string {
  return `/api/auth/callback/${provider}`;
}
