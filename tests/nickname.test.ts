import { describe, expect, it } from "vitest";

import {
  CAMPUSES,
  isValidNickname,
  NICKNAME_EXAMPLE,
  parseNickname,
} from "@/features/profile/nickname";

describe("통과하는 닉네임", () => {
  it("예시가 통과한다", () => {
    expect(isValidNickname(NICKNAME_EXAMPLE)).toBe(true);
  });

  it("네 칸을 각각 뜯어낸다", () => {
    const result = parseNickname("13_구미_1반_박경도");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      generation: 13,
      campus: "구미",
      classNo: 1,
      name: "박경도",
    });
  });

  it("모든 캠퍼스를 받는다", () => {
    for (const campus of CAMPUSES) {
      expect(isValidNickname(`13_${campus}_1반_박경도`)).toBe(true);
    }
  });

  it("두 자리 반과 긴 이름도 받는다", () => {
    expect(isValidNickname("9_부울경_12반_남궁민수")).toBe(true);
  });

  it("앞뒤 공백은 잘라낸다", () => {
    const result = parseNickname("  13_구미_1반_박경도  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nickname).toBe("13_구미_1반_박경도");
  });

  it("저장할 값은 항상 정규화된 한 가지다", () => {
    // 03 과 3 이 다른 사람으로 보이면 같은 반에서 서로를 못 찾는다.
    const a = parseNickname("03_구미_01반_박경도");
    const b = parseNickname("3_구미_1반_박경도");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.nickname).toBe(b.value.nickname);
  });
});

describe("막히는 닉네임", () => {
  const cases: [string, string][] = [
    ["박경도", "칸이 하나뿐"],
    ["13_구미_박경도", "칸이 셋"],
    ["13_구미1반_박경도", "밑줄을 빠뜨림"],
    ["13_구미_1반_박경도_추가", "칸이 다섯"],
    ["13기_구미_1반_박경도", "기수에 글자가 붙음"],
    ["0_구미_1반_박경도", "0기는 없음"],
    ["51_구미_1반_박경도", "기수 범위 밖"],
    ["13_대구_1반_박경도", "없는 캠퍼스"],
    ["13_Gumi_1반_박경도", "영문 캠퍼스"],
    ["13_구미_1_박경도", "반이 빠짐"],
    ["13_구미_일반_박경도", "반이 숫자가 아님"],
    ["13_구미_0반_박경도", "0반은 없음"],
    ["13_구미_1반_Park", "영문 이름"],
    ["13_구미_1반_박", "한 글자 이름"],
    ["13_구미_1반_ㅂㄱㄷ", "자모만"],
    ["13_구미_1반_박경도!", "특수문자"],
    ["13 _구미_1반_박경도", "중간 공백"],
    ["", "빈 값"],
  ];

  for (const [input, why] of cases) {
    it(`${why}: ${JSON.stringify(input)}`, () => {
      expect(isValidNickname(input)).toBe(false);
    });
  }

  it("문자열이 아니어도 터지지 않는다", () => {
    expect(isValidNickname(null)).toBe(false);
    expect(isValidNickname(undefined)).toBe(false);
    expect(isValidNickname(13)).toBe(false);
  });

  it("어느 칸이 틀렸는지 말해준다", () => {
    // "형식이 올바르지 않습니다" 한 줄이면 사용자는 같은 값을 계속 넣는다.
    const campus = parseNickname("13_대구_1반_박경도");
    expect(campus.ok).toBe(false);
    if (campus.ok) return;
    expect(campus.error).toContain("대구");

    const classNo = parseNickname("13_구미_1_박경도");
    expect(classNo.ok).toBe(false);
    if (classNo.ok) return;
    expect(classNo.error).toContain("반");

    const name = parseNickname("13_구미_1반_Park");
    expect(name.ok).toBe(false);
    if (name.ok) return;
    expect(name.error).toContain("한글");
  });
});
