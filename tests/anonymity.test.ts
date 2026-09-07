import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canRevealIndividualResponses, MIN_RESPONSES_TO_REVEAL } from "@/features/survey/anonymity";

/**
 * 익명성은 코드 규칙이 아니라 스키마 형태로 보장된다.
 * 그러니 스키마 자체를 테스트한다. 누군가 편의를 위해 SurveyResponse 에 userId 를
 * 붙이는 순간, 이 테스트가 먼저 깨져야 한다.
 */
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function modelBody(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`${name} 모델을 찾을 수 없습니다`);
  return match[1]!;
}

describe("설문 응답 스키마", () => {
  const response = modelBody("SurveyResponse");

  it("userId 컬럼이 없다", () => {
    expect(response).not.toMatch(/\buserId\b/);
  });

  it("User 로 가는 관계가 없다", () => {
    expect(response).not.toMatch(/\bUser\b/);
  });

  it("응답자를 특정할 수 있는 다른 필드도 없다", () => {
    for (const forbidden of ["ipAddress", "userAgent", "sessionId", "email", "participationId"]) {
      expect(response).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it("시간 정보를 아예 담지 않는다", () => {
    // 처음에는 "시각은 위험하니 날짜만" 으로 뒀는데 그것으로 부족했다.
    // 하루 응답이 한 건뿐인 날이면 그 날짜만으로 SurveyParticipation.createdAt 과
    // 1:1 로 붙는다. 사용자가 적은 서비스에서는 그런 날이 오히려 흔하다.
    expect(response).not.toMatch(/DateTime/);
    expect(response).not.toMatch(/createdAt|respondedOn|updatedAt|submittedAt/);
  });

  it("담는 필드가 id·surveyId·answers 뿐이다", () => {
    const fields = response
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0]!);
    expect(fields.sort()).toEqual(["answers", "id", "survey", "surveyId"]);
  });

  it("id 가 순번이 아니라 UUID 다 — 제출 순서를 추론할 수 없어야 한다", () => {
    expect(response).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
    expect(response).not.toMatch(/@default\(autoincrement\(\)\)/);
  });
});

describe("설문 참여 기록", () => {
  const participation = modelBody("SurveyParticipation");

  it("누가 응답했는지만 담고 응답 내용은 담지 않는다", () => {
    expect(participation).toMatch(/\buserId\b/);
    expect(participation).not.toMatch(/\banswers\b/);
  });

  it("응답 행을 가리키지 않는다 — 이 참조가 생기면 익명성이 깨진다", () => {
    expect(participation).not.toMatch(/SurveyResponse/);
    expect(participation).not.toMatch(/responseId/);
  });

  it("중복 응답을 막는다", () => {
    expect(participation).toMatch(/@@id\(\[surveyId, userId\]\)/);
  });
});

describe("개별 응답 공개 임계", () => {
  it("응답이 임계 미만이면 개별 응답을 감춘다", () => {
    for (let n = 0; n < MIN_RESPONSES_TO_REVEAL; n += 1) {
      expect(canRevealIndividualResponses(n)).toBe(false);
    }
  });

  it("임계 이상이면 공개한다", () => {
    expect(canRevealIndividualResponses(MIN_RESPONSES_TO_REVEAL)).toBe(true);
    expect(canRevealIndividualResponses(MIN_RESPONSES_TO_REVEAL + 10)).toBe(true);
  });
});

describe("기간별 집계 경로", () => {
  it("설문 응답 수는 개인과 무관한 합계 테이블에서 센다", () => {
    // 응답 행에 시간이 없으므로 "이번 주 인기" 같은 기간 집계는 여기서만 나온다.
    // 합계라서 개인을 되짚을 수 없다.
    const rollup = modelBody("ProjectStatDaily");
    expect(rollup).toMatch(/surveyResponses\s+Int/);
    expect(rollup).not.toMatch(/\buserId\b/);
  });
});
