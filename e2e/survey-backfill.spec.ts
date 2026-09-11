import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { Client } from "pg";

/**
 * 기존 응답 백필. **실제 PostgreSQL 에서 마이그레이션 파일 그대로 돌린다.**
 *
 * 백필은 한 번 어긋나면 되돌릴 수 없다. 잘못 연 응답을 다시 감추는 것 자체가
 * "그 한 건이 새 응답" 이라는 신호이기 때문이다. 그래서 파일을 읽어 그대로 실행한다.
 *
 * 공용 테스트 데이터를 건드리지 않도록 검사마다 임시 스키마를 만들고, 그 안에
 * survey_response 를 세운 뒤 search_path 를 거기로 고정한다.
 */

const ROOT = process.cwd();
const STICKY = "20260910072918_survey_response_sticky_reveal";
const PRESERVE = "20260910090000_preserve_existing_revealed";

const migration = (name: string) =>
  readFileSync(join(ROOT, "prisma", "migrations", name, "migration.sql"), "utf8");

const STICKY_SQL = migration(STICKY);
const PRESERVE_SQL = migration(PRESERVE);
/** 사람이 근거를 확인한 뒤에만 직접 실행하는 스크립트. */
const CONFIRMED_SQL = readFileSync(
  join(ROOT, "docs", "recovery", "03-preserve-existing-revealed.sql"),
  "utf8",
);

/** 이 마이그레이션 이전 판. 재현이 실제로 잡히는지 보이기 위해서만 쓴다. */
const PRESERVE_SQL_BEFORE_FIX = `
  UPDATE "survey_response" SET "revealed" = true
  WHERE "surveyId" IN (
    SELECT "surveyId" FROM "survey_response" GROUP BY "surveyId" HAVING count(*) >= 3
  );
`;

class Sandbox {
  constructor(
    readonly client: Client,
    readonly schema: string,
  ) {}

  /** 마이그레이션 전 상태의 테이블만 세운다. revealed 컬럼은 STICKY 가 만든다. */
  static async open(): Promise<Sandbox> {
    const schema = `backfill_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://firework@127.0.0.1:5432/firework?schema=public",
    });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "survey_response" (
        id         text PRIMARY KEY,
        "surveyId" text NOT NULL,
        answers    jsonb NOT NULL
      )
    `);
    return new Sandbox(client, schema);
  }

  async close() {
    await this.client.query(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`);
    await this.client.end();
  }

  async seed(surveys: { id: string; total: number }[]) {
    for (const s of surveys) {
      for (let i = 0; i < s.total; i += 1) await this.add(s.id, `응답${i}`);
    }
  }

  async add(surveyId: string, answer: string) {
    await this.client.query(
      `INSERT INTO "survey_response" (id, "surveyId", answers) VALUES ($1, $2, $3::jsonb)`,
      [randomUUID(), surveyId, JSON.stringify({ free: answer })],
    );
  }

  applySticky() {
    return this.client.query(STICKY_SQL);
  }

  /** 각 응답의 공개 여부. 실행 전후를 그대로 비교할 수 있게 id 로 돌려준다. */
  async state(surveyId: string) {
    const rows = await this.client.query<{ id: string; revealed: boolean }>(
      `SELECT id, revealed FROM "survey_response" WHERE "surveyId" = $1 ORDER BY id`,
      [surveyId],
    );
    const revealedIds = rows.rows.filter((r) => r.revealed).map((r) => r.id);
    return { total: rows.rows.length, revealed: revealedIds.length, revealedIds };
  }

  /** 돌려보고, 막혔으면 그 이유를 돌려준다. */
  async run(statement: string): Promise<{ blocked: false } | { blocked: true; message: string }> {
    try {
      await this.client.query(statement);
      return { blocked: false };
    } catch (error) {
      // 스크립트 안의 BEGIN 이 열려 있을 수 있다. 다음 질의를 위해 닫아둔다.
      await this.client.query("ROLLBACK").catch(() => undefined);
      return { blocked: true, message: error instanceof Error ? error.message : String(error) };
    }
  }
}

async function withSandbox(fn: (box: Sandbox) => Promise<void>) {
  const box = await Sandbox.open();
  try {
    await fn(box);
  } finally {
    await box.close();
  }
}

test("응답이 없으면 아무 일도 하지 않는다", async () => {
  // 운영 DB 가 이 상태다(2026-09-11 확인 시 설문 응답 0건). CI·새 DB 도 마찬가지다.
  await withSandbox(async (box) => {
    await box.applySticky();
    expect(await box.run(PRESERVE_SQL)).toMatchObject({ blocked: false });
  });
});

test("바꿀 행이 없으면 막지 않는다", async () => {
  await withSandbox(async (box) => {
    // 3건짜리는 앞 마이그레이션이 이미 전부 열었고, 2건짜리는 애초에 열 대상이 아니다.
    await box.seed([{ id: "survey-a", total: 3 }, { id: "survey-b", total: 2 }]);
    await box.applySticky();
    expect(await box.run(PRESERVE_SQL)).toMatchObject({ blocked: false });
    expect((await box.state("survey-b")).revealed).toBe(0);
  });
});

test("열 대상이 남아 있으면 추정하지 않고 배포를 세운다", async () => {
  await withSandbox(async (box) => {
    await box.seed([{ id: "survey-5", total: 5 }]);
    await box.applySticky();
    // 앞 마이그레이션만으로는 3의 배수만큼만 열린다 — 2건이 "안 본 것" 으로 남는다.
    const before = await box.state("survey-5");
    expect(before.revealed).toBe(3);

    const result = await box.run(PRESERVE_SQL);
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.message).toContain("열리지 않은 응답이 남아 있습니다");

    const after = await box.state("survey-5");
    expect(after.revealedIds, "막혔으면 아무것도 바뀌지 않아야 한다").toEqual(before.revealedIds);
  });
});

test("기존 3건 공개 + 신규 1건 미공개에서도 신규를 열지 않는다", async () => {
  // 시간 차이로 "방금 적용됐으니 안전하다" 고 갈음하면 바로 이 경우가 새어 나간다.
  // 앞 마이그레이션이 끝난 직후라도 같은 DB 를 보는 앱이 응답을 받을 수 있다.
  await withSandbox(async (box) => {
    await box.seed([{ id: "survey-a", total: 3 }]);
    await box.applySticky();
    expect((await box.state("survey-a")).revealed, "예전 3건은 이미 공개 상태").toBe(3);

    // 그 뒤 묶음 규칙을 아는 앱이 받은 새 응답 한 건. 아직 열리지 않는다.
    await box.add("survey-a", "신규");
    const before = await box.state("survey-a");
    expect(before).toMatchObject({ total: 4, revealed: 3 });

    const result = await box.run(PRESERVE_SQL);
    expect(result.blocked, "구분할 근거가 없으면 추정하지 말고 세워야 한다").toBe(true);

    const after = await box.state("survey-a");
    expect(after.revealed, "제작자 화면이 3건에서 4건으로 늘면 그 한 건이 신규 응답이다").toBe(3);
    expect(after.revealedIds).toEqual(before.revealedIds);
  });
});

test("(재현) 고치기 전 SQL 은 같은 상황에서 신규 응답을 열어버린다", async () => {
  await withSandbox(async (box) => {
    await box.seed([{ id: "survey-a", total: 3 }]);
    await box.applySticky();
    await box.add("survey-a", "신규");

    expect(await box.run(PRESERVE_SQL_BEFORE_FIX)).toMatchObject({ blocked: false });
    // 이것이 막으려던 노출이다. 검사가 실제로 이 차이를 잡는다는 근거.
    expect((await box.state("survey-a")).revealed).toBe(4);
  });
});

test("근거를 확인한 뒤 실행하는 스크립트는 예전 공개분만 되돌린다", async () => {
  await withSandbox(async (box) => {
    await box.seed([0, 1, 2, 3, 4, 5, 6].map((total) => ({ id: `survey-${total}`, total })));
    await box.applySticky();

    await box.client.query(CONFIRMED_SQL.split("BEGIN;")[0]!);
    await box.client.query(`INSERT INTO verified_reveal_manifest
      SELECT id, "surveyId", 'pre-sticky fixture snapshot' FROM survey_response
      WHERE "surveyId" IN ('survey-3','survey-4','survey-5','survey-6')`);
    expect(await box.run(CONFIRMED_SQL.replace(/ROLLBACK;\s*$/, "COMMIT;"))).toMatchObject({ blocked: false });

    for (const total of [3, 4, 5, 6]) {
      const state = await box.state(`survey-${total}`);
      expect(state.revealed, `${total}건짜리는 예전에 전부 보였으므로 전부 공개`).toBe(total);
    }
    // 1·2건짜리는 그때도 잠겨 있었다. 열면 없던 노출을 새로 만든다.
    for (const total of [1, 2]) {
      expect((await box.state(`survey-${total}`)).revealed).toBe(0);
    }

    // 되돌린 뒤에는 마이그레이션이 더 막을 것이 없다.
    expect(await box.run(PRESERVE_SQL)).toMatchObject({ blocked: false });
  });
});

test("수동 복구는 빈 목록을 거절하고 검증된 ID만 공개하며 기본은 롤백한다", async () => {
  await withSandbox(async (box) => {
    await box.seed([{ id: "s", total: 5 }]);
    await box.applySticky();
    expect(await box.run(CONFIRMED_SQL)).toMatchObject({ blocked: true });
    await box.client.query(CONFIRMED_SQL.split("BEGIN;")[0]!);
    await box.client.query(`INSERT INTO verified_reveal_manifest SELECT id,"surveyId",'verified backup' FROM survey_response`);
    await box.add("s", "new unverified response");
    const before = await box.state("s");
    expect(await box.run(CONFIRMED_SQL)).toMatchObject({ blocked: false });
    expect(await box.state("s")).toEqual(before);
    expect(await box.run(CONFIRMED_SQL.replace(/ROLLBACK;\s*$/, "COMMIT;"))).toMatchObject({ blocked: false });
    expect((await box.state("s")).revealed).toBe(5);
    expect((await box.state("s")).total).toBe(6);
  });
});

test("수동 복구는 다른 설문의 ID를 거절한다", async () => {
  await withSandbox(async (box) => {
    await box.seed([{ id: "s", total: 4 }]);
    await box.applySticky();
    await box.client.query(CONFIRMED_SQL.split("BEGIN;")[0]!);
    await box.client.query(`INSERT INTO verified_reveal_manifest SELECT id,'wrong-survey','backup' FROM survey_response`);
    const before = await box.state("s");
    expect(await box.run(CONFIRMED_SQL)).toMatchObject({ blocked: true });
    expect(await box.state("s")).toEqual(before);
  });
});

test("수동 복구 트랜잭션 중 신규 INSERT는 잠금으로 차단된다", async () => {
  await withSandbox(async (box) => {
    await box.seed([{ id: "s", total: 4 }]);
    await box.applySticky();
    await box.client.query(CONFIRMED_SQL.split("BEGIN;")[0]!);
    await box.client.query(`INSERT INTO verified_reveal_manifest SELECT id,"surveyId",'backup' FROM survey_response`);
    const writer = new Client({ connectionString: process.env.DATABASE_URL });
    await writer.connect();
    try {
      await writer.query(`SET search_path TO "${box.schema}"; SET lock_timeout='250ms'`);
      await box.client.query(CONFIRMED_SQL.replace(/ROLLBACK;\s*$/, ""));
      await expect(writer.query(`INSERT INTO survey_response (id,"surveyId",answers) VALUES ('new','s','{}')`)).rejects.toMatchObject({ code: "55P03" });
      await box.client.query("COMMIT");
      await writer.query(`INSERT INTO survey_response (id,"surveyId",answers) VALUES ('new','s','{}')`);
      expect((await box.state("s")).revealed).toBe(4);
      expect((await box.state("s")).total).toBe(5);
    } finally {
      await box.client.query("ROLLBACK");
      await writer.end();
    }
  });
});

test("앞 마이그레이션 파일은 고치지 않는다 — 이미 적용된 DB 가 있을 수 있다", async () => {
  // 3의 배수만큼만 여는 원래 동작 그대로여야 한다.
  expect(STICKY_SQL).toContain("(ranked.total / 3) * 3");
});
