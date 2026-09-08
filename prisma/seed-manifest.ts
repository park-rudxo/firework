/**
 * 시드가 만든 것을 나중에 정확히 지울 수 있도록, 표식을 한곳에 모아둔다.
 *
 * 데모 데이터를 넣어보고 그대로 배포하는 일이 흔한데, 그때 "전부 지우기"밖에
 * 없으면 진짜 사용자 데이터까지 함께 날아간다. 시드가 만든 행에만 붙는 표식을
 * 정해두면 `npm run db:purge` 가 그것만 골라 지울 수 있다.
 *
 * seed.ts 와 purge.ts 가 이 파일을 함께 본다. 한쪽만 고쳐 어긋나는 것을 막기 위해
 * seed.ts 는 실행 시 슬러그 목록이 일치하는지 확인한다.
 */

/** 시드 사용자 id 는 전부 이 접두사로 시작한다. */
export const SEED_USER_ID_PREFIX = "seed-user-";

/** 시드 사용자 이메일 도메인. RFC 2606 이 예약한 도메인이라 실제 주소와 겹치지 않는다. */
export const SEED_EMAIL_DOMAIN = "@example.com";

/** 시드가 만드는 프로젝트 슬러그. */
export const SEED_PROJECT_SLUGS = [
  "moamoa",
  "chulseok",
  "code-review-bot",
  "bapmuk",
  "algo-tracker",
  "ssafy-market",
  "jariitda",
] as const;
