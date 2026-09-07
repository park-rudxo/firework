import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canRevealIndividualResponses, MIN_RESPONSES_TO_REVEAL, respondedOnToday } from "@/features/survey/anonymity";

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

  it("제출 시각이 아니라 날짜만 저장한다", () => {
    // timestamp 를 남기면 SurveyParticipation.createdAt 과 타이밍으로 조인할 수 있다.
    expect(response).toMatch(/respondedOn\s+DateTime\s+@db\.Date/);
    expect(response).not.toMatch(/createdAt/);
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

describe("응답 날짜", () => {
  it("시각 성분이 전부 0이다", () => {
    const d = respondedOnToday();
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });
});
