#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { config } from "dotenv";

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

// ── 2. 마이그레이션 파일 ────────────────────────────────────
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

// ── 3. 데이터베이스 ────────────────────────────────────────
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

// ── 4. 데이터 ──────────────────────────────────────────────
console.log("\n데이터");
const projects = await client.query(`SELECT count(*)::int AS n FROM "Project"`);
const n = projects.rows[0].n;
if (n === 0) {
  bad("공개된 프로젝트가 없습니다 — 홈이 비어 보입니다");
  info("→ npm run db:seed");
} else {
  ok(`프로젝트 ${n}개`);
}

// ── 5. 소셜 로그인 ─────────────────────────────────────────
console.log("\n소셜 로그인");
const providers = ["GOOGLE", "KAKAO", "NAVER", "GITHUB"].filter(
  (p) => process.env[`${p}_CLIENT_ID`] && process.env[`${p}_CLIENT_SECRET`],
);
if (providers.length === 0) {
  info("설정된 프로바이더 없음 — 공개 화면은 열리지만 로그인은 안 됩니다.");
  info("https://github.com/settings/developers → New OAuth App");
  info("Callback: http://localhost:3000/api/auth/callback/github");
} else {
  ok(providers.join(", "));
}

await client.end();
console.log("\n문제 없습니다. npm run dev 로 띄우세요.\n");
