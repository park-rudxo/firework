/**
 * 프로바이더 콘솔에서 무엇을 해야 자격증명이 나오는지.
 *
 * .env.example 에는 콘솔 주소만 있었다. 그것만으로 끝나는 건 GitHub 정도고
 * 나머지 셋은 "동의항목을 켜라", "제공 정보에 이메일을 넣어라" 같은 단계가 있어서
 * 모르면 값을 넣고도 로그인이 실패한다. 실제로 막히는 지점만 골라 적어둔다.
 *
 * setup-env.mjs 와 doctor.mjs 가 같이 쓴다. node 내장 기능만 쓰므로
 * npm ci 전에도 돌아간다.
 */

/** 화면에 내는 순서. 국내 사용자 비중을 생각해 카카오·네이버를 위로 올린다. */
export const PROVIDERS = [
  {
    id: "kakao",
    envPrefix: "KAKAO",
    label: "카카오",
    console: "https://developers.kakao.com/console/app",
    steps: [
      "내 애플리케이션 → 애플리케이션 추가하기",
      "앱 설정 → 플랫폼 → Web 사이트 도메인에 {origin} 등록",
      "카카오 로그인 → 활성화 설정 ON, Redirect URI 에 {callback} 등록",
      "카카오 로그인 → 동의항목에서 닉네임·프로필 사진·카카오계정(이메일) 켜기",
      "앱 키의 REST API 키 → KAKAO_CLIENT_ID",
      "카카오 로그인 → 보안 → Client Secret 생성 후 활성화 상태를 '사용함' 으로 → KAKAO_CLIENT_SECRET",
    ],
    gotcha:
      "이메일 동의항목은 개인 개발자 앱에서 잠겨 있을 수 있다. 그러면 비즈니스 앱으로 전환해야 열린다. 이메일이 안 오면 가입 자체가 email_not_found 로 실패한다.",
  },
  {
    id: "naver",
    envPrefix: "NAVER",
    label: "네이버",
    console: "https://developers.naver.com/apps/#/register",
    steps: [
      "애플리케이션 등록 → 사용 API 에서 '네이버 로그인' 선택",
      "제공 정보 선택에서 회원이름·이메일 주소 체크",
      "로그인 오픈 API 서비스 환경 → PC 웹 추가",
      "서비스 URL 에 {origin}, Callback URL 에 {callback} 등록",
      "Client ID / Client Secret → NAVER_CLIENT_ID / NAVER_CLIENT_SECRET",
    ],
    gotcha:
      "검수를 넘기기 전에는 개발자 본인과 멤버로 등록한 계정만 로그인된다. 다른 사람에게 시켜보려면 콘솔의 멤버 관리에 그 계정을 먼저 추가해야 한다.",
  },
  {
    id: "google",
    envPrefix: "GOOGLE",
    label: "Google",
    console: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "프로젝트를 하나 고르거나 새로 만들기",
      "OAuth 동의 화면을 먼저 구성 (User Type 외부, 앱 이름·지원 이메일)",
      "사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션",
      "승인된 리디렉션 URI 에 {callback} 등록",
      "클라이언트 ID / 클라이언트 보안 비밀번호 → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
    ],
    gotcha:
      "게시 상태가 '테스트' 면 동의 화면의 테스트 사용자에 넣은 계정만 로그인된다. 남에게 시켜볼 거면 그 계정을 추가하거나 앱을 게시해야 한다.",
  },
  {
    id: "github",
    envPrefix: "GITHUB",
    label: "GitHub",
    console: "https://github.com/settings/developers",
    steps: [
      "OAuth Apps → New OAuth App",
      "Homepage URL 에 {origin}",
      "Authorization callback URL 에 {callback}",
      "Client ID 와 Generate a new client secret → GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET",
    ],
    gotcha:
      "프로젝트 업로더는 GitHub 연결이 필수라 이건 사실상 항상 필요하다. 저장소 메타 수집용 GITHUB_TOKEN 과는 다른 값이다.",
  },
];

/**
 * BETTER_AUTH_URL 이 비어 있어도 안내는 나와야 하므로 기본값을 둔다.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function origin(env = process.env) {
  const raw = (env.BETTER_AUTH_URL ?? "").trim();
  if (!raw) return "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/**
 * @param {(typeof PROVIDERS)[number]} provider
 * @param {Record<string, string | undefined>} [env]
 */
export function callbackUrl(provider, env = process.env) {
  return `${origin(env)}/api/auth/callback/${provider.id}`;
}

/**
 * 공백만 든 값은 채워진 것으로 보지 않는다. env.ts 의 filled 와 같은 기준이다.
 *
 * @param {string | undefined} v
 */
const filled = (v) => (v ?? "").trim() !== "";

/**
 * @param {(typeof PROVIDERS)[number]} provider
 * @param {Record<string, string | undefined>} values
 */
export function isConfigured(provider, values) {
  return (
    filled(values[`${provider.envPrefix}_CLIENT_ID`]) &&
    filled(values[`${provider.envPrefix}_CLIENT_SECRET`])
  );
}

/**
 * 아직 안 켜진 프로바이더 하나의 설정 절차를 줄 단위로 뽑는다.
 *
 * @param {(typeof PROVIDERS)[number]} provider
 * @param {Record<string, string | undefined>} [env]
 */
export function setupLines(provider, env = process.env) {
  const callback = callbackUrl(provider, env);
  /** @param {string} s */
  const fill = (s) => s.replaceAll("{callback}", callback).replaceAll("{origin}", origin(env));
  return [
    `${provider.label} — ${provider.console}`,
    ...provider.steps.map((s, i) => `  ${i + 1}. ${fill(s)}`),
    `  ! ${fill(provider.gotcha)}`,
  ];
}
