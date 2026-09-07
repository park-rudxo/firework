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
 * 응답 저장에 쓸 날짜. **시각이 아니라 날짜다.**
 *
 * 초 단위 시각을 남기면 survey_participation.createdAt 과 타이밍으로 맞춰
 * "누가 무엇을 썼는지" 복원할 수 있다. 그래서 UTC 자정으로 절삭한다.
 */
export function respondedOnToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * 자유서술은 본인이 스스로 신원을 드러낼 수 있다("제가 저번에 말씀드린…").
 * 구조로는 막을 수 없으므로 응답 화면에서 고지한다.
 */
export const FREE_TEXT_WARNING =
  "자유서술에 본인을 알아볼 수 있는 내용(이름, 기수, 특정 대화 언급 등)을 적으면 익명성이 깨질 수 있습니다.";
