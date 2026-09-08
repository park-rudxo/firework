#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * .env 를 만들고 BETTER_AUTH_SECRET 을 채운다.
 *
 * 예전에는 README 가 `openssl rand -base64 32` 를 실행하라고 적고 "출력값을 .env 에
 * 넣으세요" 라고 주석을 달았는데, 명령을 실행하면 알아서 되는 것처럼 보여서
 * 값을 옮기지 않은 채 넘어가기 쉬웠다. 그러면 서버가 뜨자마자 환경변수 오류로 죽는다.
 * 그 한 단계를 사람 손에서 뺀다.
 *
 * node 내장 모듈만 쓰므로 npm ci 전에도 돌아간다.
 */

const ENV = ".env";
const EXAMPLE = ".env.example";

if (!existsSync(EXAMPLE)) {
  console.error(`${EXAMPLE} 이 없습니다. 저장소 루트에서 실행해주세요.`);
  process.exit(1);
}

if (!existsSync(ENV)) {
  copyFileSync(EXAMPLE, ENV);
  console.log(`${EXAMPLE} → ${ENV} 복사했습니다.`);
}

let env = readFileSync(ENV, "utf8");

// 이미 쓸 만한 값이 있으면 덮어쓰지 않는다. 재실행이 기존 세션을 날리면 안 된다.
const current = env.match(/^BETTER_AUTH_SECRET\s*=\s*"?([^"\n]*)"?$/m)?.[1] ?? "";
if (current.length >= 16) {
  console.log("BETTER_AUTH_SECRET 은 이미 설정되어 있습니다. 그대로 둡니다.");
} else {
  const secret = randomBytes(32).toString("base64");
  env = /^BETTER_AUTH_SECRET\s*=/m.test(env)
    ? env.replace(/^BETTER_AUTH_SECRET\s*=.*$/m, `BETTER_AUTH_SECRET="${secret}"`)
    : `${env}\nBETTER_AUTH_SECRET="${secret}"\n`;
  writeFileSync(ENV, env);
  console.log("BETTER_AUTH_SECRET 을 생성해 넣었습니다.");
}

// 남은 것 중 무엇이 없으면 무엇이 안 되는지 알려준다.
const value = (key) => env.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?$`, "m"))?.[1] ?? "";

const providers = ["GOOGLE", "KAKAO", "NAVER", "GITHUB"].filter(
  (p) => value(`${p}_CLIENT_ID`) && value(`${p}_CLIENT_SECRET`),
);

console.log("");
if (!value("DATABASE_URL")) {
  console.log("⚠ DATABASE_URL 이 비어 있습니다. docker compose up -d 를 쓰면 기본값 그대로 됩니다.");
}
if (providers.length === 0) {
  console.log("· 소셜 로그인이 아직 없습니다 — 홈·둘러보기·상세·일정은 그대로 열립니다.");
  console.log("  설문·추첨·프로젝트 등록까지 보려면 GitHub OAuth 앱을 하나 만드세요:");
  console.log("  https://github.com/settings/developers → New OAuth App");
  console.log("  Callback URL: http://localhost:3000/api/auth/callback/github");
} else {
  console.log(`· 소셜 로그인: ${providers.join(", ")}`);
}
if (!value("GITHUB_TOKEN")) {
  console.log("· GITHUB_TOKEN 이 없어 저장소 메타 수집이 시간당 60회로 제한됩니다.");
}

console.log("\n다음: docker compose up -d && npm ci && npm run db:deploy && npm run db:seed && npm run dev");
