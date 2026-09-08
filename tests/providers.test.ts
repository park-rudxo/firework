import { describe, expect, it } from "vitest";

import { configuredProviders, enabledProviders, type ServerEnv } from "@/lib/env";
import { PROVIDER_ENV_KEYS, PROVIDER_IDS, PROVIDER_LABEL, callbackPath } from "@/lib/providers";
import {
  PROVIDERS,
  callbackUrl,
  classifyProbeLocation,
  isConfigured,
  setupLines,
} from "../scripts/providers.mjs";

const base = {
  DATABASE_URL: "postgresql://x",
  BETTER_AUTH_SECRET: "0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
} as ServerEnv;

const withEnv = (extra: Record<string, string>) => ({ ...base, ...extra }) as ServerEnv;

describe("설정된 프로바이더 판별", () => {
  it("ID 와 SECRET 이 둘 다 있어야 켜진 것으로 본다", () => {
    expect(configuredProviders(withEnv({ KAKAO_CLIENT_ID: "a" })).kakao).toBe(false);
    expect(configuredProviders(withEnv({ KAKAO_CLIENT_SECRET: "b" })).kakao).toBe(false);
    expect(
      configuredProviders(withEnv({ KAKAO_CLIENT_ID: "a", KAKAO_CLIENT_SECRET: "b" })).kakao,
    ).toBe(true);
  });

  it("공백만 든 값은 채워진 것으로 보지 않는다", () => {
    // 공백 한 칸은 truthy 라서 그냥 두면 버튼은 뜨는데 로그인이 invalid_code 로 실패한다.
    const env = withEnv({ NAVER_CLIENT_ID: "  ", NAVER_CLIENT_SECRET: "\t" });
    expect(configuredProviders(env).naver).toBe(false);
  });

  it("아무것도 없으면 넷 다 꺼져 있다", () => {
    expect(Object.values(configuredProviders(base)).every((v) => v === false)).toBe(true);
  });

  it("켜진 것만 화면 순서대로 돌려준다 — 카카오·네이버가 먼저다", () => {
    const env = withEnv({
      GITHUB_CLIENT_ID: "a",
      GITHUB_CLIENT_SECRET: "b",
      NAVER_CLIENT_ID: "c",
      NAVER_CLIENT_SECRET: "d",
    });
    expect(enabledProviders(env)).toEqual(["naver", "github"]);
  });
});

describe("프로바이더 메타데이터", () => {
  it("모든 프로바이더에 라벨·환경변수 키·콜백 경로가 있다", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_LABEL[id]).toBeTruthy();
      expect(PROVIDER_ENV_KEYS[id]).toEqual([
        `${id.toUpperCase()}_CLIENT_ID`,
        `${id.toUpperCase()}_CLIENT_SECRET`,
      ]);
      expect(callbackPath(id)).toBe(`/api/auth/callback/${id}`);
    }
  });

  /**
   * 스크립트는 .mjs 라 src 의 TypeScript 를 import 할 수 없어서 목록이 두 벌이다.
   * 한쪽에만 프로바이더를 추가하면 doctor 가 조용히 빼먹으므로 여기서 묶어둔다.
   */
  it("스크립트 쪽 목록이 src 와 같은 프로바이더를 같은 순서로 담는다", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual([...PROVIDER_IDS]);
    for (const p of PROVIDERS) {
      expect([`${p.envPrefix}_CLIENT_ID`, `${p.envPrefix}_CLIENT_SECRET`]).toEqual(
        PROVIDER_ENV_KEYS[p.id as (typeof PROVIDER_IDS)[number]],
      );
    }
  });
});

describe("설정 안내", () => {
  const kakao = PROVIDERS.find((p) => p.id === "kakao")!;

  it("콜백 주소는 BETTER_AUTH_URL 을 따르고 끝의 슬래시를 지운다", () => {
    expect(callbackUrl(kakao, { BETTER_AUTH_URL: "https://firework.app/" })).toBe(
      "https://firework.app/api/auth/callback/kakao",
    );
    // 값이 없어도 안내는 나와야 하므로 기본값으로 떨어진다.
    expect(callbackUrl(kakao, {})).toBe("http://localhost:3000/api/auth/callback/kakao");
  });

  it("안내에는 실제 콜백 주소가 치환돼 들어간다", () => {
    for (const p of PROVIDERS) {
      const lines = setupLines(p, { BETTER_AUTH_URL: "http://localhost:3000" }).join("\n");
      expect(lines).not.toContain("{callback}");
      expect(lines).not.toContain("{origin}");
      expect(lines).toContain(p.console);
    }
  });

  it("isConfigured 는 env.ts 와 같은 기준을 쓴다", () => {
    expect(isConfigured(kakao, { KAKAO_CLIENT_ID: "a", KAKAO_CLIENT_SECRET: " " })).toBe(false);
    expect(isConfigured(kakao, { KAKAO_CLIENT_ID: "a", KAKAO_CLIENT_SECRET: "b" })).toBe(true);
  });
});

/**
 * 아래 두 문자열은 실제 구글 응답의 Location 을 그대로 옮긴 것이다.
 * 구글이 신호를 바꾸면 doctor 가 조용히 "확인됨" 을 찍는 대신 여기가 먼저 깨진다.
 */
describe("콜백 등록 여부 판별", () => {
  const MISMATCH =
    "https://accounts.google.com/signin/oauth/error?authError=ChVyZWRpcmVjdF91cmlfbWlzbWF0Y2gSsAEKWW91" +
    "IGNhbid0IHNpZ24gaW4gdG8gdGhpcyBhcHA&flowName=GeneralOAuthFlow&client_id=21047070877-x.apps.google" +
    "usercontent.com";
  const OK =
    "https://accounts.google.com/v3/signin/identifier?opparams=%253F&dsh=S-417356254%3A1788836916541163" +
    "&client_id=21047070877-x.apps.googleusercontent.com";

  it("등록 안 된 콜백은 mismatch 로 읽는다", () => {
    expect(classifyProbeLocation("google", MISMATCH)).toBe("mismatch");
  });

  it("등록된 콜백은 로그인 화면으로 가고 ok 로 읽는다", () => {
    expect(classifyProbeLocation("google", OK)).toBe("ok");
  });

  it("redirect_uri 가 아닌 이유로 거부되면 mismatch 라고 하지 않는다", () => {
    // invalid_client 를 base64 로 감싼 형태. 문구가 달라도 mismatch 로 오인하면 안 된다.
    const other = `https://accounts.google.com/signin/oauth/error?authError=${Buffer.from(
      "invalid_client The OAuth client was not found.",
    ).toString("base64")}`;
    expect(classifyProbeLocation("google", other)).toBe("other");
  });

  it("Location 이 없으면 판단하지 않는다", () => {
    expect(classifyProbeLocation("google", "")).toBe("unknown");
  });

  it("판별기를 확인하지 않은 프로바이더는 묻지 않는다", () => {
    // 검증하지 않은 판별기는 틀린 확신을 준다. 없으면 없다고 답해야 한다.
    expect(classifyProbeLocation("kakao", MISMATCH)).toBe("unknown");
    expect(classifyProbeLocation("naver", OK)).toBe("unknown");
  });
});
