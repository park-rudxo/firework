/**
 * 익명성 규칙을 한곳에 모아둔다. 이 파일에 적힌 것들이 "제작자에게도 익명"이라는
 * 약속의 실제 내용이다.
 *
 * 구조적 보장은 스키마에 있다:
 *   - survey_response 에는 userId 가 없다
 *   - survey_participation 에는 응답 내용이 없다
 *   - 둘 사이에 FK 가 없다
 *
 * 이 파일은 그 위에 얹는 표현 계층의 규칙이다.
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
