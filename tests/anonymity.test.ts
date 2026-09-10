import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANONYMITY_LIMIT,
  ANONYMITY_PROMISE,
  canRevealIndividualResponses,
  MIN_RESPONSES_TO_REVEAL,
  revealedResponseCount,
  shouldOpenNextBatch,
} from "@/features/survey/anonymity";

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

  it("담는 필드가 id·surveyId·answers 와 공개 여부 뿐이다", () => {
    // revealed 는 3건 묶음 공개를 위해 나중에 추가했다. 묶음의 구성원이 고정되려면
    // 공개 여부를 조회 시점에 계산하지 않고 행에 박아둬야 한다.
    // 이 필드가 남기는 것은 "아직 안 켜진 두 건 이하가 가장 최근" 이라는 사실뿐이고,
    // 그건 제작자가 화면에서 이미 아는 것과 같은 크기다.
    const fields = response
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0]!);
    expect(fields.sort()).toEqual(["answers", "id", "revealed", "survey", "surveyId"]);
  });

  it("공개 여부는 불리언이고 기본은 감춤이다", () => {
    // 순번이나 묶음 번호였다면 응답 전체를 줄 세울 수 있다. 불리언은 두 갈래뿐이라
    // 아직 안 켜진 것들이 최근이라는 사실 이상을 주지 않는다.
    expect(response).toMatch(/revealed\s+Boolean\s+@default\(false\)/);
    expect(response).not.toMatch(/revealOrder|revealedAt|batch|sequence|position/i);
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

describe("개별 응답 공개 단위", () => {
  it("임계 미만이면 한 건도 공개하지 않는다", () => {
    expect(revealedResponseCount(0)).toBe(0);
    expect(revealedResponseCount(2)).toBe(0);
  });

  it("3의 배수에 닿을 때만 묶음을 연다", () => {
    // 임계만 두고 그 위로는 전부 보여주면, 제작자가 결과 화면을 열어둔 채 기다리다가
    // 3건에서 4건이 되는 순간 "방금 늘어난 하나" 를 지목할 수 있다.
    // 그러면 그 한 건은 방금 부탁했던 사람의 것으로 좁혀진다.
    expect(shouldOpenNextBatch(1)).toBe(false);
    expect(shouldOpenNextBatch(2)).toBe(false);
    expect(shouldOpenNextBatch(3)).toBe(true);
    expect(shouldOpenNextBatch(4)).toBe(false);
    expect(shouldOpenNextBatch(5)).toBe(false);
    expect(shouldOpenNextBatch(6)).toBe(true);
  });

  it("0건에서는 열 것이 없다", () => {
    expect(shouldOpenNextBatch(0)).toBe(false);
  });

  it("보이는 건수는 묶음 단위로만 늘어난다", () => {
    expect(revealedResponseCount(3)).toBe(3);
    expect(revealedResponseCount(4)).toBe(3);
    expect(revealedResponseCount(5)).toBe(3);
    expect(revealedResponseCount(6)).toBe(6);
    expect(revealedResponseCount(8)).toBe(6);
    expect(revealedResponseCount(9)).toBe(9);
  });

  it("보이는 건수가 실제 응답 수를 넘지 않는다", () => {
    for (let n = 0; n < 40; n += 1) {
      expect(revealedResponseCount(n)).toBeLessThanOrEqual(n);
    }
  });

  it("한 번 열린 묶음은 다시 닫히지 않는다", () => {
    // 공개 여부를 조회 시점에 다시 계산하면 새 응답이 정렬 순서상 앞에 끼어들 때
    // 이미 공개됐던 것이 사라진다. 그 차이 자체가 신규 응답을 가리킨다.
    let shown = 0;
    for (let n = 1; n <= 30; n += 1) {
      const next = revealedResponseCount(n);
      expect(next).toBeGreaterThanOrEqual(shown);
      shown = next;
    }
  });
});

describe("익명성 안내 문구", () => {
  it("지킬 수 없는 약속을 하지 않는다", () => {
    // 예전 문구는 "설계상 연결이 불가능합니다" 였다. 참이 아니다 —
    // 응답자가 한 명이면 두 표를 나란히 놓기만 해도 보인다.
    const text = `${ANONYMITY_PROMISE} ${ANONYMITY_LIMIT}`;
    for (const overclaim of ["불가능", "절대", "누구도", "완전"]) {
      expect(text).not.toContain(overclaim);
    }
  });

  it("한계를 함께 알린다", () => {
    expect(ANONYMITY_LIMIT).toContain("참여자가 적을 때");
  });
});
