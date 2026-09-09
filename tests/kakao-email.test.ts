import { describe, expect, it } from "vitest";

/**
 * 카카오가 이메일을 주지 않을 때의 대체 규칙.
 *
 * 규칙 자체는 lib/auth.ts 의 mapProfileToUser 안에 있지만, 그 파일은 DB 와 세션을
 * 통째로 끌어와서 테스트에서 들여올 수 없다. 규칙만 같은 모양으로 옮겨 확인한다.
 */
const fallbackEmail = (profile: { id: number; kakao_account?: { email?: string } }) => {
  const email = profile.kakao_account?.email;
  if (email) return {};
  return { email: `kakao-${profile.id}@no-email.invalid` };
};

describe("카카오 이메일 대체", () => {
  it("이메일을 주면 건드리지 않는다", () => {
    expect(fallbackEmail({ id: 1, kakao_account: { email: "a@b.com" } })).toEqual({});
  });

  it("이메일이 없으면 회원번호로 자리표시자를 만든다", () => {
    // 비어 있는 채로 두면 계정 생성 단계에서 카카오 로그인이 통째로 실패한다.
    expect(fallbackEmail({ id: 12345 })).toEqual({
      email: "kakao-12345@no-email.invalid",
    });
  });

  it("동의항목이 있어도 값이 비면 자리표시자를 만든다", () => {
    expect(fallbackEmail({ id: 7, kakao_account: {} })).toEqual({
      email: "kakao-7@no-email.invalid",
    });
  });

  it("같은 사람은 늘 같은 값이 나온다", () => {
    // 재로그인할 때마다 값이 달라지면 계정이 갈라진다.
    expect(fallbackEmail({ id: 42 })).toEqual(fallbackEmail({ id: 42 }));
  });

  it("사람마다 다른 값이 나온다", () => {
    // email 은 unique 라 겹치면 두 번째 사람이 로그인할 수 없다.
    expect(fallbackEmail({ id: 1 })).not.toEqual(fallbackEmail({ id: 2 }));
  });
});
