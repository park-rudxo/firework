#!/usr/bin/env node
import { existsSync } from "node:fs";
import { config } from "dotenv";

/**
 * 배포 직전에 "지금 이 값들로 올리면 무엇이 깨지는지" 를 먼저 알려준다.
 *
 * doctor 는 로컬이 왜 안 뜨는지를 본다. 여기서 보는 건 다른 종류의 실패다 —
 * 로컬에서는 멀쩡히 도는데 운영에 올리는 순간에만 드러나는 것들이다.
 * 콜백 URL 이 localhost 로 박혀 로그인이 통째로 깨지거나, 관리자가 아무도 없어
 * 신고 큐를 열 사람이 없거나, 인증 코드가 사용자 화면 대신 서버 로그로 가는 식이다.
 * 전부 배포한 다음에야, 그것도 사용자가 먼저 밟아야 알게 되는 것들이라 미리 본다.
 *
 *   node scripts/deploy-check.mjs                  # 현재 환경변수(+ .env)
 *   node scripts/deploy-check.mjs .env.production  # 특정 파일
 */

const envFile = process.argv[2] ?? (existsSync(".env") ? ".env" : null);
if (envFile) {
  if (!existsSync(envFile)) {
    console.error(`\n${envFile} 이 없습니다.\n`);
    process.exit(1);
  }
  config({ path: envFile, override: true, quiet: true });
}

const errors = [];
const warnings = [];

const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s, hint) => {
  console.log(`  ✗ ${s}`);
  if (hint) console.log(`    → ${hint}`);
  errors.push(s);
};
const warn = (s, hint) => {
  console.log(`  ! ${s}`);
  if (hint) console.log(`    → ${hint}`);
  warnings.push(s);
};
const info = (s) => console.log(`    ${s}`);

const val = (k) => (process.env[k] ?? "").trim();

console.log(`\nfirework 배포 점검${envFile ? ` (${envFile})` : ""}\n`);

// ── 1. 접속 주소 ───────────────────────────────────────────
// 이 값 하나가 로그인 전체를 좌우한다. Better Auth 는 콜백 URL 을 여기서 만들고,
// 프로바이더에 등록된 주소와 한 글자라도 다르면 redirect_uri_mismatch 로 끝난다.
console.log("접속 주소");
const authUrl = val("BETTER_AUTH_URL");
let origin = null;
if (!authUrl) {
  bad("BETTER_AUTH_URL 이 비어 있습니다", "운영 도메인을 넣으세요 (예: https://firework.example.com)");
} else {
  try {
    const u = new URL(authUrl);
    origin = u.origin;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      bad(`BETTER_AUTH_URL 이 아직 로컬입니다: ${authUrl}`, "운영 도메인으로 바꾸세요. 이대로면 로그인 후 localhost 로 돌아갑니다.");
    } else if (u.protocol !== "https:") {
      bad(`BETTER_AUTH_URL 이 https 가 아닙니다: ${authUrl}`, "세션 쿠키가 secure 로 내려가므로 https 여야 합니다.");
    } else if (authUrl !== u.origin) {
      warn(`BETTER_AUTH_URL 에 경로가 붙어 있습니다: ${authUrl}`, `오리진만 넣으세요: ${u.origin}`);
    } else {
      ok(authUrl);
    }
  } catch {
    bad(`BETTER_AUTH_URL 을 URL 로 읽을 수 없습니다: ${authUrl}`);
  }
}

// ── 2. 비밀키 ──────────────────────────────────────────────
console.log("\n세션 비밀키");
const secret = val("BETTER_AUTH_SECRET");
if (!secret) {
  bad("BETTER_AUTH_SECRET 이 비어 있습니다", "openssl rand -base64 32");
} else if (secret.length < 32) {
  bad(`BETTER_AUTH_SECRET 이 짧습니다 (${secret.length}자)`, "openssl rand -base64 32");
} else if (/^(ci-|test|changeme|secret$)/i.test(secret)) {
  bad("BETTER_AUTH_SECRET 이 예시·CI 용 값으로 보입니다", "openssl rand -base64 32 로 새로 만드세요");
} else {
  ok(`${secret.length}자`);
  info("로컬 .env 와 다른 값을 쓰세요. 유출되면 세션을 위조할 수 있습니다.");
}

// ── 3. 데이터베이스 ────────────────────────────────────────
console.log("\n데이터베이스");
const dbUrl = val("DATABASE_URL");
const directUrl = val("DIRECT_DATABASE_URL");
if (!dbUrl) {
  bad("DATABASE_URL 이 비어 있습니다");
} else {
  let parsed = null;
  try {
    parsed = new URL(dbUrl);
  } catch {
    bad("DATABASE_URL 을 URL 로 읽을 수 없습니다");
  }
  if (parsed) {
    const host = parsed.hostname;
    info(`연결 대상: ${parsed.protocol}//${parsed.username ? parsed.username + "@" : ""}${parsed.host}${parsed.pathname}`);
    if (host === "localhost" || host === "127.0.0.1" || host === "db") {
      bad("DATABASE_URL 이 아직 로컬 Postgres 를 가리킵니다", "운영 Postgres(Neon 등) 연결 문자열로 바꾸세요.");
    } else {
      ok("로컬이 아닙니다");
      const ssl = parsed.searchParams.get("sslmode");
      if (!ssl) {
        warn("sslmode 가 없습니다", "관리형 Postgres 는 보통 ?sslmode=require 가 필요합니다.");
      } else {
        ok(`sslmode=${ssl}`);
      }
      // 풀러(PgBouncer)를 거치는 연결로는 마이그레이션이 안전하지 않다.
      if (host.includes("-pooler") && !directUrl) {
        warn("풀러 주소인데 DIRECT_DATABASE_URL 이 없습니다", "마이그레이션용으로 풀러를 거치지 않는 직결 주소를 넣으세요.");
      } else if (directUrl) {
        ok("DIRECT_DATABASE_URL 있음 (마이그레이션용)");
      }
    }
  }
}

// ── 4. 소셜 로그인 ─────────────────────────────────────────
// 한쪽만 채워진 프로바이더는 가장 알아채기 어려운 상태다. 버튼은 뜨는데 눌러야 깨진다.
console.log("\n소셜 로그인");
const providers = [
  ["google", "GOOGLE", "https://console.cloud.google.com/apis/credentials"],
  ["github", "GITHUB", "https://github.com/settings/developers"],
  ["kakao", "KAKAO", "https://developers.kakao.com/console/app"],
  ["naver", "NAVER", "https://developers.naver.com/apps"],
];
const enabled = [];
for (const [id, prefix] of providers) {
  const cid = val(`${prefix}_CLIENT_ID`);
  const sec = val(`${prefix}_CLIENT_SECRET`);
  if (cid && sec) enabled.push(id);
  else if (cid || sec) {
    bad(`${id}: ID 와 SECRET 중 한쪽만 채워져 있습니다`, `둘 다 채우거나 둘 다 비우세요. 지금은 버튼만 뜨고 로그인은 실패합니다.`);
  }
}
if (enabled.length === 0) {
  bad("설정된 프로바이더가 없습니다", "최소 하나는 필요합니다. GitHub 이 가장 빠릅니다(업로더 인증에도 어차피 필요).");
} else {
  ok(enabled.join(", "));
  if (!enabled.includes("github")) {
    warn("GitHub 이 없습니다", "프로젝트 등록에 GitHub 계정 연결이 필수라 아무도 프로젝트를 올릴 수 없습니다.");
  }
}
if (origin && enabled.length > 0) {
  info("각 프로바이더 콘솔에 아래 콜백 URL 이 등록돼 있어야 합니다:");
  for (const id of enabled) info(`  ${origin}/api/auth/callback/${id}`);
}

// ── 5. 최초 관리자 ─────────────────────────────────────────
console.log("\n최초 관리자");
const admins = val("ADMIN_EMAILS").split(",").map((e) => e.trim()).filter(Boolean);
if (admins.length === 0) {
  bad("ADMIN_EMAILS 가 비어 있습니다", "배포 직후 관리자가 아무도 없어 신고 큐를 열 사람이 없습니다.");
} else {
  const bogus = admins.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bogus.length > 0) bad(`이메일 형식이 아닙니다: ${bogus.join(", ")}`);
  else {
    ok(admins.join(", "));
    // 승격은 emailVerified 인 계정에만 걸린다 — Google·GitHub 으로 로그인해야 한다.
    info("이 주소로 Google 또는 GitHub 로그인을 해야 승격됩니다.");
  }
}

// ── 6. 이메일 발송 ─────────────────────────────────────────
console.log("\n이메일 인증");
const resend = val("RESEND_API_KEY");
if (!resend) {
  warn("RESEND_API_KEY 가 없습니다", "인증 코드가 사용자 화면 대신 서버 로그로 갑니다. 네이버 로그인은 사실상 막힙니다.");
  info("https://resend.com/api-keys (무료 3,000통/월)");
} else {
  ok("RESEND_API_KEY 있음");
  const from = val("EMAIL_FROM");
  if (!from) warn("EMAIL_FROM 이 없습니다", "Resend 테스트 발신 주소를 씁니다. 도메인을 붙였으면 채우세요.");
  else ok(`발신: ${from}`);
}

// ── 7. GitHub API ──────────────────────────────────────────
console.log("\nGitHub API");
if (!val("GITHUB_TOKEN")) {
  warn("GITHUB_TOKEN 이 없습니다", "저장소 메타 수집이 시간당 60회로 제한됩니다. public repo 읽기 전용 PAT 면 충분합니다.");
} else {
  ok("GITHUB_TOKEN 있음 (시간당 5,000회)");
}

// ── 결과 ───────────────────────────────────────────────────
console.log("");
if (errors.length > 0) {
  console.log(`✗ 막는 문제 ${errors.length}건${warnings.length ? `, 경고 ${warnings.length}건` : ""} — 고치고 다시 돌리세요.\n`);
  process.exit(1);
}
if (warnings.length > 0) {
  console.log(`✓ 막는 문제는 없습니다. 경고 ${warnings.length}건은 배포 후에 채워도 됩니다.\n`);
} else {
  console.log("✓ 배포해도 됩니다.\n");
}
