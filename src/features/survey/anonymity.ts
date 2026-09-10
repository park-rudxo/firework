/**
 * 익명성 규칙을 한곳에 모아둔다.
 *
 * **약속의 크기를 정확히 적어둔다.** 이 서비스가 지키는 것은
 * "제작자에게 작성자 정보를 제공하지 않는다" 이지, "누구도 절대 알아낼 수 없다" 가
 * 아니다. 뒤쪽은 참이 아니고, 참이 아닌 것을 약속하면 그 약속을 믿고 쓴 사람이 다친다.
 *
 * 구조로 보장되는 것:
 *   - survey_response 에는 userId 가 없다
 *   - survey_participation 에는 응답 내용이 없다
 *   - 둘 사이에 FK 가 없다
 *   - 제작자 화면 어디에도 둘을 잇는 조회가 없다
 *
 * 구조로 보장되지 **않는** 것:
 *   - 응답자가 한 명뿐이면 두 테이블을 나란히 놓기만 해도 대응이 보인다.
 *     참여자 수가 적을 때는 구조가 아니라 표본 크기가 익명성을 깬다.
 *   - DB 에 직접 접근할 수 있는 운영자는 여전히 추론할 수 있다.
 *     아래의 표현 계층 규칙은 제작자 화면을 막을 뿐 DB 를 막지 못한다.
 *
 * 그래서 아래 규칙들은 "완전한 익명" 이 아니라 "재식별을 어렵게 하는 조치" 다.
 *
 * 상수 중 일부(FREE_TEXT_WARNING)는 응답 폼에서도 써야 하므로 server-only 로 막지 않는다.
 * 대신 민감한 값은 절대 여기 두지 않는다.
 */

/**
 * 개별 응답을 공개하기 위한 최소 응답 수.
 *
 * 응답이 한두 개뿐이면 제작자가 "누가 응답했는지" 아는 상황에서 내용이 곧
 * 작성자를 가리킨다. 그 임계 아래에서는 집계만 보여주고 개별 응답은 잠근다.
 */
export const MIN_RESPONSES_TO_REVEAL = 3;

export function canRevealIndividualResponses(responseCount: number): boolean {
  return responseCount >= MIN_RESPONSES_TO_REVEAL;
}

/**
 * 지금 감춰둔 것을 한꺼번에 공개할 때인가.
 *
 * 임계만 두고 그 위로는 전부 보여주면, 제작자가 결과 화면을 열어둔 채 기다리다가
 * 3건에서 4건이 되는 순간 "방금 늘어난 하나" 를 지목할 수 있다. 그러면 그 한 건은
 * 방금 부탁했던 사람의 것으로 좁혀진다. 응답 행에서 시간을 지운 의미가 화면에서
 * 되살아나는 셈이다.
 *
 * 그래서 3의 배수에 닿을 때만 연다. 4·5번째가 들어와도 화면은 그대로 3건이고,
 * 6건이 되는 순간 셋이 함께 나타난다.
 *
 * **공개된 묶음의 구성원은 고정되어야 한다.** 조회할 때마다 "앞에서 3건" 을 다시
 * 고르면 안 된다 — 새 응답이 정렬 순서상 앞에 끼어들면 이미 공개됐던 것이 사라지고
 * 새 것이 나타나, 바로 그 차이가 신규 응답을 가리킨다. 그래서 공개 여부는 조회 시점에
 * 계산하지 않고 survey_response.revealed 에 박아둔다. 한 번 켜지면 꺼지지 않는다.
 */
export function shouldOpenNextBatch(responseCount: number): boolean {
  return responseCount > 0 && responseCount % MIN_RESPONSES_TO_REVEAL === 0;
}

/** 응답이 n 건일 때 화면에 보이는 개별 응답 수. 검증과 안내에 쓴다. */
export function revealedResponseCount(responseCount: number): number {
  if (responseCount < MIN_RESPONSES_TO_REVEAL) return 0;
  return Math.floor(responseCount / MIN_RESPONSES_TO_REVEAL) * MIN_RESPONSES_TO_REVEAL;
}

/**
 * 응답에는 시간 정보를 저장하지 않는다.
 *
 * 처음에는 "시각은 위험하니 날짜만" 으로 두었는데, 그것으로 부족하다.
 * 하루 응답이 한 건뿐인 날이면 그 날짜만으로 survey_participation.createdAt 과
 * 1:1 로 붙는다. 사용자가 적은 서비스에서는 그런 날이 오히려 흔하다.
 *
 * 그래서 응답 행에는 언제 썼는지를 아예 남기지 않는다. 기간별 집계가 필요한
 * 곳(홈의 주간 인기)은 개인과 무관한 합계 카운터를 쓴다.
 */
export const RESPONSES_STORE_NO_TIME = true;

/**
 * 자유서술은 본인이 스스로 신원을 드러낼 수 있다("제가 저번에 말씀드린…").
 * 구조로는 막을 수 없으므로 응답 화면에서 고지한다.
 */
export const FREE_TEXT_WARNING =
  "자유서술에 본인을 알아볼 수 있는 내용(이름, 기수, 특정 대화 언급 등)을 적으면 익명성이 깨질 수 있습니다.";

/**
 * 화면에 그대로 쓰는 안내 문구.
 *
 * 예전 문구는 "설계상 연결이 불가능합니다" 였다. 참이 아니다 — 응답자가 한 명이면
 * 표만 나란히 놓아도 보인다. 지킬 수 있는 것만 적는다.
 */
export const ANONYMITY_PROMISE =
  "응답은 제작자에게 작성자 정보 없이 전달됩니다. 누가 무엇을 썼는지 제작자 화면에서 조회할 수 있는 경로는 없습니다.";

export const ANONYMITY_LIMIT =
  "다만 참여자가 적을 때는 내용만으로 짐작될 수 있습니다. 개별 응답은 3건 단위로 묶어서 공개하고, 그 아래에서는 집계만 보여줍니다.";
