import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { Client } from "pg";

/**
 * 기존 응답 백필 마이그레이션. **실제 PostgreSQL 에서 마이그레이션 파일 그대로 돌린다.**
 *
 * 백필은 한 번 어긋나면 되돌릴 수 없다. 잘못 연 응답을 다시 감추는 것 자체가
 * "그 한 건이 새 응답" 이라는 신호이기 때문이다. 그래서 파일을 읽어 그대로 실행한다.
 *
 * 공용 테스트 데이터를 건드리지 않도록 검사마다 임시 스키마를 만들고, 그 안에
 * survey_response 와 _prisma_migrations 를 세운 뒤 search_path 를 거기로 고정한다.
 */

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");
const STICKY = "20260910072918_survey_response_sticky_reveal";
const PRESERVE = "20260910090000_preserve_existing_revealed";

const sql = (name: string) => readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");

/** 앞 마이그레이션이 고쳐지지 않았는지 — 이미 적용됐을 수 있으므로 건드리면 안 된다. */
const STICKY_SQL = sql(STICKY);
const PRESERVE_SQL = sql(PRESERVE);

/** 이 마이그레이션 이전 판. 재현이 실제로 잡히는지 보이기 위해서만 쓴다. */
const PRESERVE_SQL_BEFORE_FIX = `
  UPDATE "survey_response" SET "revealed" = true
  WHERE "surveyId" IN (
    SELECT "surveyId" FROM "survey_response" GROUP BY "surveyId" HAVING count(*) >= 3
  );
`;

type Survey = { id: string; total: number; revealedAfterSticky?: number };

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
    // public 을 빼둔다. 넣어두면 to_regclass 가 진짜 _prisma_migrations 를 집는다.
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "survey_response" (
        id         text PRIMARY KEY,
        "surveyId" text NOT NULL,
        answers    jsonb NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE "_prisma_migrations" (
        id              text PRIMARY KEY,
        migration_name  text NOT NULL,
        started_at      timestamptz NOT NULL DEFAULT now(),
        finished_at     timestamptz,
        rolled_back_at  timestamptz
      )
    `);
    return new Sandbox(client, schema);
  }

  async close() {
    await this.client.query(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`);
    await this.client.end();
  }

  async seed(surveys: Survey[]) {
    for (const s of surveys) {
      for (let i = 0; i < s.total; i += 1) {
        await this.client.query(
          `INSERT INTO "survey_response" (id, "surveyId", answers) VALUES ($1, $2, $3::jsonb)`,
          [randomUUID(), s.id, JSON.stringify({ free: `응답${i}` })],
        );
      }
    }
  }

  /** 앞 마이그레이션을 적용하고, 적용 시각을 원하는 값으로 기록한다. */
  async applySticky(finishedAt: "지금" | "하루 전") {
    await this.client.query(STICKY_SQL);
    await this.client.query(
      `INSERT INTO "_prisma_migrations" (id, migration_name, started_at, finished_at)
       VALUES ($1, $2, now(), ${finishedAt === "지금" ? "now()" : "now() - interval '1 day'"})`,
      [randomUUID(), STICKY],
    );
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

  /** 마이그레이션을 돌리고, 막혔으면 그 이유를 돌려준다. */
  async run(statement: string): Promise<{ blocked: false } | { blocked: true; message: string }> {
    try {
      await this.client.query(statement);
      return { blocked: false };
    } catch (error) {
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

test.describe("같은 migrate 실행에서 이어 적용될 때", () => {
  test("3건 이상이던 설문은 전부 공개로 되돌아간다 (기존 0~6건)", async () => {
    await withSandbox(async (box) => {
      const surveys: Survey[] = [0, 1, 2, 3, 4, 5, 6].map((total) => ({
        id: `survey-${total}`,
        total,
      }));
      await box.seed(surveys);
      await box.applySticky("지금");

      // 앞 마이그레이션만으로는 3의 배수만큼만 열린다 — 5건짜리에서 2건이 "안 본 것" 이 된다.
      expect((await box.state("survey-5")).revealed).toBe(3);

      const result = await box.run(PRESERVE_SQL);
      expect(result.blocked, "바꿀 근거가 있으므로 막히지 않아야 한다").toBe(false);

      for (const total of [3, 4, 5, 6]) {
        const state = await box.state(`survey-${total}`);
        expect(state.revealed, `${total}건짜리는 예전에 전부 보였으므로 전부 공개`).toBe(total);
      }
      // 1·2건짜리는 그때도 잠겨 있었다. 열면 없던 노출을 새로 만든다.
      for (const total of [1, 2]) {
        expect((await box.state(`survey-${total}`)).revealed).toBe(0);
      }
    });
  });

  test("응답이 하나도 없으면 아무 일도 하지 않는다", async () => {
    // 운영 DB 가 이 상태다(2026-09-11 확인 시 설문 응답 0건).
    await withSandbox(async (box) => {
      await box.applySticky("지금");
      const result = await box.run(PRESERVE_SQL);
      expect(result.blocked).toBe(false);
    });
  });
});

test.describe("앞 마이그레이션이 오래전에 적용된 DB", () => {
  test("기존 3건 공개 + 신규 1건 미공개를 전부 열지 않고 막는다", async () => {
    await withSandbox(async (box) => {
      await box.seed([{ id: "survey-a", total: 3 }]);
      await box.applySticky("하루 전");
      expect((await box.state("survey-a")).revealed, "예전 3건은 이미 공개 상태").toBe(3);

      // 그 뒤 묶음 규칙을 아는 앱이 받은 새 응답 한 건. 아직 열리지 않는다.
      await box.client.query(
        `INSERT INTO "survey_response" (id, "surveyId", answers) VALUES ($1, 'survey-a', '{"free":"신규"}'::jsonb)`,
        [randomUUID()],
      );
      const before = await box.state("survey-a");
      expect(before).toMatchObject({ total: 4, revealed: 3 });

      const result = await box.run(PRESERVE_SQL);

      expect(result.blocked, "구분할 근거가 없으면 추정하지 말고 세워야 한다").toBe(true);
      if (result.blocked) {
        expect(result.message).toContain("구분할 수 없습니다");
      }

      const after = await box.state("survey-a");
      expect(after.revealed, "제작자 화면이 3건에서 4건으로 늘면 그 한 건이 신규 응답이다").toBe(3);
      expect(after.revealedIds).toEqual(before.revealedIds);
    });
  });

  test("(재현) 고치기 전 SQL 은 같은 상황에서 신규 응답을 열어버린다", async () => {
    await withSandbox(async (box) => {
      await box.seed([{ id: "survey-a", total: 3 }]);
      await box.applySticky("하루 전");
      await box.client.query(
        `INSERT INTO "survey_response" (id, "surveyId", answers) VALUES ($1, 'survey-a', '{"free":"신규"}'::jsonb)`,
        [randomUUID()],
      );

      const result = await box.run(PRESERVE_SQL_BEFORE_FIX);
      expect(result.blocked).toBe(false);
      // 이것이 막으려던 노출이다. 검사가 실제로 이 차이를 잡는다는 근거.
      expect((await box.state("survey-a")).revealed).toBe(4);
    });
  });

  test("바꿀 행이 없으면 이력이 오래됐어도 막지 않는다", async () => {
    await withSandbox(async (box) => {
      await box.seed([{ id: "survey-a", total: 3 }, { id: "survey-b", total: 2 }]);
      await box.applySticky("하루 전");
      // 3건짜리는 이미 전부 열려 있고, 2건짜리는 애초에 열 대상이 아니다.
      const result = await box.run(PRESERVE_SQL);
      expect(result.blocked).toBe(false);
      expect((await box.state("survey-b")).revealed).toBe(0);
    });
  });
});

test("앞 마이그레이션 파일은 고치지 않는다 — 이미 적용된 DB 가 있을 수 있다", async () => {
  // 3의 배수만큼만 여는 원래 동작 그대로여야 한다. 고치면 체크섬이 어긋난다.
  expect(STICKY_SQL).toContain("(ranked.total / 3) * 3");
});
