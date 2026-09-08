#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import { PROVIDERS, callbackUrl, isConfigured, origin, setupLines } from "./providers.mjs";

/**
 * 왜 안 뜨는지 한 번에 알려준다.
 *
 * 세팅이 막히는 지점은 늘 몇 군데로 정해져 있는데(.env 없음, DB 안 뜸,
 * 마이그레이션 미적용), 앱이 내는 오류만 봐서는 어느 쪽인지 알기 어렵다.
 * 특히 Next 개발 오버레이는 원인 한 줄을 난독화된 청크 이름 밑에 묻어버린다.
 *
 * 여기서는 연결 문자열이 실제로 어디를 가리키는지, 그 데이터베이스에 테이블이
 * 있는지를 직접 확인해서 다음에 칠 명령을 알려준다.
 */

const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);
const info = (s) => console.log(`    ${s}`);

console.log("\nfirework 진단\n");

// ── 1. .env ────────────────────────────────────────────────
console.log(".env");
if (!existsSync(".env")) {
  bad(".env 가 없습니다");
  info("→ npm run setup");
  process.exit(1);
}
config();
ok(".env 있음");

const url = process.env.DATABASE_URL;
if (!url) {
  bad("DATABASE_URL 이 비어 있습니다");
  info("→ npm run setup");
  process.exit(1);
}
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 16) {
  bad("BETTER_AUTH_SECRET 이 비어 있거나 너무 짧습니다");
  info("→ npm run setup");
  process.exit(1);
}
ok("DATABASE_URL, BETTER_AUTH_SECRET 채워짐");

// 연결 문자열이 실제로 어디를 가리키는지 보여준다. 비밀번호는 가린다.
let target = url;
try {
  const u = new URL(url);
  target = `${u.protocol}//${u.username ? u.username + "@" : ""}${u.host}${u.pathname}`;
} catch {
  /* 파싱 안 되면 원문 그대로 */
}
info(`연결 대상: ${target}`);

// ── 2. 소셜 로그인 ─────────────────────────────────────────
// 안 뜨는 버튼은 코드 문제가 아니라 자격증명이 없는 것이다. 넷 다 상태를 보여주고,
// 없는 것은 콘솔에서 무엇을 해야 하는지까지 적어준다. 여기까지 와야 "왜 카카오가
// 안 보이지" 가 끝난다.
console.log("\n소셜 로그인");
const configured = PROVIDERS.filter((p) => isConfigured(p, process.env));
const notConfigured = PROVIDERS.filter((p) => !isConfigured(p, process.env));

for (const p of PROVIDERS) {
  if (isConfigured(p, process.env)) {
    ok(`${p.label} — 자격증명 있음`);
    // 자격증명이 맞아도 콜백 주소가 한 글자 다르면 프로바이더가 로그인 화면조차
    // 띄우지 않고 redirect_uri_mismatch 로 막는다. 무엇을 등록해야 하는지는
    // 켜진 뒤에 오히려 더 필요한 정보다.
    info(`  콜백: ${callbackUrl(p, process.env)}`);
    // 콜백 주소가 맞는데도 막히는 흔한 경우는 "다른 클라이언트에 등록" 이다.
    // 콘솔 목록에서 어느 항목을 열어야 하는지 대조할 수 있게 ID 를 같이 찍는다.
    // Client ID 는 인가 요청 URL 에 그대로 실려 나가는 공개 값이다 — 시크릿은 찍지 않는다.
    info(`  ${p.envPrefix}_CLIENT_ID: ${process.env[`${p.envPrefix}_CLIENT_ID`]}`);
  } else {
    bad(`${p.label} — ${p.envPrefix}_CLIENT_ID / ${p.envPrefix}_CLIENT_SECRET 비어 있음`);
  }
}

if (configured.length > 0) {
  info("");
  info("위 콜백 주소가 프로바이더 콘솔에 '글자 그대로' 등록돼 있어야 합니다.");
  info("한 글자라도 다르면 redirect_uri_mismatch (또는 그에 해당하는 오류) 로 막힙니다.");
  info("자주 어긋나는 곳: 끝의 슬래시, http/https, localhost 와 127.0.0.1,");
  info("그리고 Google 은 '승인된 JavaScript 원본' 이 아니라 '승인된 리디렉션 URI' 칸입니다.");
  info("");
  info("주소가 맞는데도 막힌다면 등록한 클라이언트가 다른 것입니다. 콘솔 목록에서");
  info("위에 찍힌 CLIENT_ID 와 같은 항목을 열어 거기에 등록했는지 확인해주세요.");
  info("Google 은 클라이언트 유형이 '웹 애플리케이션' 이어야 그 칸이 아예 나타납니다.");
  info("");
  info(`이 주소는 BETTER_AUTH_URL(${origin(process.env)}) 로 만듭니다.`);
  info("접속하는 주소를 바꾸면 이 값과 콘솔 등록도 같이 바꿔야 합니다.");
}

if (configured.length === 0) {
  info("");
  info("하나도 없으면 로그인 버튼이 아예 뜨지 않습니다. 공개 화면은 그대로 열립니다.");
}

if (notConfigured.length > 0) {
  console.log("\n안 켜진 로그인을 켜려면");
  for (const p of notConfigured) {
    console.log("");
    for (const line of setupLines(p, process.env)) info(line);
  }
  info("");
  info(".env 를 고친 뒤에는 개발 서버를 다시 시작해야 반영됩니다.");
}

// ── 3. 마이그레이션 파일 ────────────────────────────────────
console.log("\n마이그레이션 파일");
const dir = "prisma/migrations";
const migrations = existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
if (migrations.length === 0) {
  bad(`${dir} 에 마이그레이션이 없습니다`);
  process.exit(1);
}
ok(`${migrations.length}개 (${migrations.join(", ")})`);

// 스키마가 기대하는 테이블 이름을 뽑아둔다.
const schema = readFileSync("prisma/schema.prisma", "utf8");
const expected = new Set();
for (const m of schema.matchAll(/@@map\("([^"]+)"\)/g)) expected.add(m[1]);
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm)) {
  if (!m[2].includes("@@map(")) expected.add(m[1]);
}

// ── 4. 데이터베이스 ────────────────────────────────────────
console.log("\n데이터베이스");
let pg;
try {
  ({ default: pg } = await import("pg"));
} catch {
  bad("pg 모듈이 없습니다 — 의존성이 설치되지 않았습니다");
  info("→ npm ci");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (e) {
  bad(`연결할 수 없습니다: ${e.message}`);
  info("PostgreSQL 이 떠 있는지, DATABASE_URL 이 맞는지 확인해주세요.");
  info("→ docker compose up -d");
  process.exit(1);
}
ok("연결됨");

const { rows } = await client.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()",
);
const present = new Set(rows.map((r) => r.tablename));
const missing = [...expected].filter((t) => !present.has(t));

if (present.size === 0) {
  bad("테이블이 하나도 없습니다 — 마이그레이션이 적용되지 않았습니다");
  info("→ npm run db:deploy");
  info("→ npm run db:seed");
  await client.end();
  process.exit(1);
}

if (missing.length > 0) {
  bad(`테이블 ${missing.length}개가 없습니다: ${missing.join(", ")}`);
  info("스키마가 코드보다 오래되었습니다.");
  info("→ npm run db:deploy");
  await client.end();
  process.exit(1);
}
ok(`테이블 ${present.size}개 모두 있음`);

// 마이그레이션 기록과 실제 테이블이 어긋나면 여기서 드러난다.
if (present.has("_prisma_migrations")) {
  const applied = await client.query(
    "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at",
  );
  const failed = applied.rows.filter((r) => !r.finished_at || r.rolled_back_at);
  if (failed.length > 0) {
    bad(`중간에 실패한 마이그레이션이 있습니다: ${failed.map((r) => r.migration_name).join(", ")}`);
    info("데이터베이스를 비우고 다시 적용하는 것이 안전합니다.");
    info("→ npx prisma migrate reset --force");
  } else {
    ok(`마이그레이션 기록 ${applied.rows.length}건, 실패 없음`);
  }
}

// ── 5. 데이터 ──────────────────────────────────────────────
console.log("\n데이터");
const projects = await client.query(`SELECT count(*)::int AS n FROM "Project"`);
const n = projects.rows[0].n;
if (n === 0) {
  bad("공개된 프로젝트가 없습니다 — 홈이 비어 보입니다");
  info("→ npm run db:seed");
} else {
  ok(`프로젝트 ${n}개`);
}

await client.end();
console.log("\n문제 없습니다. npm run dev 로 띄우세요.\n");
