import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 알림 동의는 "행이 있으면 켜짐" 으로만 표현한다.
 *
 * 불리언 컬럼에 기본값을 주면, 나중에 기본값을 true 로 바꾸는 한 줄로 전원에게
 * 메시지가 나가버린다. 행이 없으면 꺼진 것이고, 그것이 기본값이며, 기본값을
 * 뒤집을 방법이 없다 — 이 성질을 스키마로 못박아 두고 테스트로 지킨다.
 */
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function modelBody(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`${name} 모델을 찾을 수 없습니다`);
  return match[1]!;
}

describe("프로젝트 알림 동의", () => {
  const pref = modelBody("ProjectNotificationPref");

  it("불리언 스위치가 아니라 행의 존재로 표현한다", () => {
    expect(pref).not.toMatch(/Boolean/);
    expect(pref).not.toMatch(/@default\(true\)/);
  });

  it("사용자·프로젝트·주제 조합마다 하나만 있을 수 있다", () => {
    expect(pref).toMatch(/@@id\(\[projectId, userId, topic\]\)/);
  });

  it("프로젝트나 사용자가 사라지면 동의도 함께 사라진다", () => {
    expect(pref.match(/onDelete: Cascade/g)?.length).toBe(2);
  });
});

describe("Mattermost 계정", () => {
  const account = modelBody("MattermostAccount");

  it("수신은 기본이 꺼짐이다", () => {
    // 인증하려고 연결했을 뿐인 사람에게 메시지가 가기 시작하면 안 된다.
    expect(account).toMatch(/deliveryEnabled\s+Boolean\s+@default\(false\)/);
  });

  it("웹훅 주소를 평문 컬럼에 두지 않는다", () => {
    expect(account).toMatch(/webhookUrlEnc/);
    expect(account).not.toMatch(/webhookUrl\s+String/);
  });

  it("한 Mattermost 계정은 한 firework 계정에만 붙는다", () => {
    // 다중 계정을 막는 것이 이 연결을 인증으로 쓰는 이유다.
    expect(account).toMatch(/mattermostUserId\s+String\s+@unique/);
  });
});

describe("외부 발송 큐", () => {
  const message = modelBody("OutboundMessage");

  it("보내지 않고 닫는 상태가 실패와 구분된다", () => {
    // 동의가 사라져서 안 보낸 것은 실패가 아니다. 재시도할 이유가 없다.
    expect(schema).toMatch(/enum OutboundStatus \{[\s\S]*?CANCELLED[\s\S]*?\}/);
    expect(message).toMatch(/status\s+OutboundStatus\s+@default\(PENDING\)/);
  });
});
