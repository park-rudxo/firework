import { createHmac, randomUUID } from "node:crypto";
import { Client } from "pg";
import type { BrowserContext } from "@playwright/test";

/**
 * 로그인이 필요한 흐름을 위한 준비물.
 *
 * 소셜 OAuth 는 브라우저 테스트에서 재현할 수 없다. 대신 Better Auth 가 실제로 읽는
 * 것과 같은 세션 행을 만들고, 같은 방식으로 서명한 쿠키를 심는다.
 * (better-call: `encodeURIComponent(token + "." + base64(HMAC-SHA256(secret, token)))`)
 *
 * **테스트마다 완전히 새 데이터를 만들고 끝나면 지운다.** 고정된 시드 계정을 쓰면
 * 두 번째 실행에서 "이미 팀원입니다" 같은 이유로 실패한다. 앞선 검증이 그 함정에
 * 걸렸으므로 여기서는 이름부터 전부 무작위로 만든다.
 */

const CAMPUS = ["서울", "대전", "광주", "구미", "부울경"];
/** 닉네임의 이름 칸은 한글 2~10자만 받는다(features/profile/nickname.ts). */
const KOREAN_NAMES = ["김싸피", "이관통", "박특화", "최자율", "정프로", "한개발", "오테스트", "윤배포"];
const SESSION_COOKIE = "better-auth.session_token";

export type Fixture = {
  userId: string;
  displayName: string;
  mattermostUsername: string;
};

function connectionString(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://firework@127.0.0.1:5432/firework?schema=public"
  );
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const suffix = () => randomUUID().replace(/-/g, "").slice(0, 8);

/** 닉네임 게이트를 통과하는 계정. Mattermost 인증까지 붙여둔다. */
export async function createUser(options: { verified?: boolean } = {}): Promise<Fixture> {
  const id = randomUUID();
  const tag = suffix();
  // 닉네임 게이트를 통과해야 한다. 여기서 형식이 틀리면 모든 화면이 /nickname 으로 튄다.
  const displayName = `16_${CAMPUS[Math.floor(Math.random() * CAMPUS.length)]}_1반_${
    KOREAN_NAMES[Math.floor(Math.random() * KOREAN_NAMES.length)]
  }`;
  const mattermostUsername = `e2e.${tag}`;

  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())`,
      [id, displayName, `${tag}@e2e.test`],
    );
    await db.query(
      `INSERT INTO profile ("userId", "displayName", role, "createdAt", "updatedAt")
       VALUES ($1, $2, 'MEMBER', now(), now())`,
      [id, displayName],
    );
    if (options.verified !== false) {
      await db.query(
        `INSERT INTO "MattermostIdentity" ("userId", "mattermostUserId", username, "verifiedAt")
         VALUES ($1, $2, $3, now())`,
        [id, `mm-${tag}`, mattermostUsername],
      );
    }
  });

  return { userId: id, displayName, mattermostUsername };
}

/** 공개된 프로젝트 하나. 만든 사람이 등록자가 된다. */
export async function createProject(ownerId: string): Promise<{ id: string; slug: string; name: string }> {
  const id = randomUUID();
  const tag = suffix();
  const slug = `e2e-${tag}`;
  const name = `E2E 프로젝트 ${tag}`;

  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "Project" (id, slug, name, tagline, description, category, "demoUrl",
                              "ownerId", status, "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, '한 줄 소개', '설명', 'WEB', 'https://example.test',
               $4, 'PUBLISHED', now(), now(), now())`,
      [id, slug, name, ownerId],
    );
    await db.query(
      `INSERT INTO project_member (id, "projectId", "userId", role, "createdAt")
       VALUES ($1, $2, $3, 'OWNER', now())`,
      [randomUUID(), id, ownerId],
    );
  });

  return { id, slug, name };
}

/** 브라우저에 로그인 상태를 심는다. */
export async function signIn(context: BrowserContext, userId: string, baseURL: string) {
  const token = randomUUID();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET 이 필요합니다. .env 를 읽고 실행해주세요.");

  await withDb((db) =>
    db.query(
      `INSERT INTO session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now() + interval '1 day', now(), now())`,
      [randomUUID(), token, userId],
    ),
  );

  const signature = createHmac("sha256", secret).update(token).digest("base64");
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: encodeURIComponent(`${token}.${signature}`),
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** 만든 것을 전부 지운다. 다음 실행이 남은 데이터에 걸리지 않게 한다. */
export async function cleanup(userIds: string[], projectIds: string[] = []) {
  await withDb(async (db) => {
    for (const id of projectIds) await db.query(`DELETE FROM "Project" WHERE id = $1`, [id]);
    for (const id of userIds) await db.query(`DELETE FROM "user" WHERE id = $1`, [id]);
  });
}

/** 자유서술 한 문항짜리 설문. 동시 제출 검증에 쓴다. */
export async function createSurvey(
  projectId: string,
  options: { existingResponses?: number; existingRevealed?: number } = {},
): Promise<{ id: string }> {
  const id = randomUUID();
  const existing = options.existingResponses ?? 0;
  // 예전 구현에서 이미 공개돼 있던 상태를 흉내낼 수 있어야 한다.
  const revealed = options.existingRevealed ?? Math.floor(existing / 3) * 3;

  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "Survey" (id,"projectId",title,questions,"isOpen","opensAt","createdAt","updatedAt")
       VALUES ($1,$2,'동시 제출 검증',$3::jsonb,true,now(),now(),now())`,
      [
        id,
        projectId,
        JSON.stringify([
          { id: "free", type: "text", label: "한마디", required: true, maxLength: 1000 },
        ]),
      ],
    );
    for (let i = 0; i < existing; i += 1) {
      await db.query(
        `INSERT INTO survey_response (id,"surveyId",answers,revealed)
         VALUES ($1,$2,$3::jsonb,$4)`,
        [randomUUID(), id, JSON.stringify({ free: `기존${i}` }), i < revealed],
      );
    }
  });

  return { id };
}

export type SurveyState = {
  total: number;
  revealed: number;
  hidden: number;
  revealedIds: string[];
};

export async function readSurveyState(surveyId: string): Promise<SurveyState> {
  return withDb(async (db) => {
    const rows = await db.query<{ id: string; revealed: boolean }>(
      `SELECT id, revealed FROM survey_response WHERE "surveyId" = $1 ORDER BY id`,
      [surveyId],
    );
    const revealedIds = rows.rows.filter((r) => r.revealed).map((r) => r.id);
    return {
      total: rows.rows.length,
      revealed: revealedIds.length,
      hidden: rows.rows.length - revealedIds.length,
      revealedIds,
    };
  });
}

/** 한 사람이 몇 번 응답·참여·응모했는지. 중복 제출이 새는지 본다. */
export async function countPerUser(surveyId: string, userId: string) {
  return withDb(async (db) => {
    const participations = await db.query(
      `SELECT 1 FROM survey_participation WHERE "surveyId"=$1 AND "userId"=$2`,
      [surveyId, userId],
    );
    const entries = await db.query(
      `SELECT 1 FROM raffle_entry e JOIN "Raffle" r ON r.id = e."raffleId"
       WHERE r."surveyId"=$1 AND e."userId"=$2`,
      [surveyId, userId],
    );
    return { participations: participations.rowCount ?? 0, entries: entries.rowCount ?? 0 };
  });
}

/** 연결된 Mattermost 계정을 다른 것으로 갈아끼운다. 초대 대상 고정 검증에 쓴다. */
export async function reconnectMattermost(userId: string, newMattermostUserId: string) {
  await withDb((db) =>
    db.query(`UPDATE "MattermostIdentity" SET "mattermostUserId" = $2 WHERE "userId" = $1`, [
      userId,
      newMattermostUserId,
    ]),
  );
}

export async function disconnectMattermost(userId: string) {
  await withDb((db) => db.query(`DELETE FROM "MattermostIdentity" WHERE "userId" = $1`, [userId]));
}

/** 초대와 멤버십의 최종 상태. 실패했을 때 아무것도 남지 않았는지 본다. */
export async function readInviteState(projectId: string, userId: string) {
  return withDb(async (db) => {
    const invites = await db.query<{ status: string }>(
      `SELECT status FROM project_invitation WHERE "projectId"=$1 AND "inviteeId"=$2`,
      [projectId, userId],
    );
    const member = await db.query<{ role: string }>(
      `SELECT role FROM project_member WHERE "projectId"=$1 AND "userId"=$2`,
      [projectId, userId],
    );
    return {
      statuses: invites.rows.map((r) => r.status),
      memberRole: member.rows[0]?.role ?? null,
    };
  });
}

/**
 * 특정 행을 잠근 채 들고 있는다. **동시성 검사의 출발점이다.**
 *
 * 여러 요청을 `Promise.all` 로 함께 터뜨리는 것만으로는 실제로 겹쳤다는 보장이 없다.
 * 앞의 것이 끝난 뒤 뒤의 것이 시작해도 검사는 통과하고, 그러면 잠금을 빼도 통과한다.
 * 검출이 그날의 타이밍 운에 달리는 셈이다.
 *
 * 그래서 검사 쪽이 먼저 같은 행을 잠근다. 서버의 트랜잭션들은 직렬화 지점에서
 * 하나도 빠짐없이 멈추고, 몇 개가 멈췄는지는 pg_locks 로 **관찰**할 수 있다.
 * 전부 멈춘 것을 확인한 뒤 풀면 그 순간부터는 반드시 겹친다.
 */
export type LockHold = {
  /** 이 잠금을 기다리다 막혀 있는 세션 수. */
  waiting(): Promise<number>;
  /** n 개가 막힐 때까지 기다린다. 시간 안에 못 채우면 던진다. */
  waitFor(n: number, timeoutMs?: number): Promise<void>;
  /**
   * 나를 기다리며 막혀 있는 세션들이 **이미 쥐고 있는** 테이블.
   *
   * "멈췄다" 는 사실만으로는 어디서 멈췄는지 알 수 없다. 특히 survey_response 와
   * survey_participation 에는 Survey 로 가는 FK 가 있어서, 앱이 명시적 잠금을 잡지
   * 않아도 INSERT 의 FK 검사(부모 행 KEY SHARE)가 이 holder 에 막힌다. 그래서 멈춘
   * 위치를 가리려면 그 세션이 무엇을 이미 잡았는지를 봐야 한다 — INSERT 를 시작했다면
   * 대상 테이블의 RowExclusiveLock 을 이미 쥐고 있다.
   */
  relationsHeldByWaiters(): Promise<string[]>;
  /** 잠금을 풀어 멈춰 있던 것들을 한꺼번에 내보낸다. */
  release(): Promise<void>;
};

export async function holdRowLock(
  table: string,
  id: string,
  key = "id",
): Promise<LockHold> {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  await client.query("BEGIN");
  const locked = await client.query(
    `SELECT "${key}" FROM "${table}" WHERE "${key}" = $1 FOR UPDATE`,
    [id],
  );
  if (!locked.rowCount) {
    await client.query("ROLLBACK");
    await client.end();
    throw new Error(`${table} 에 ${key}=${id} 행이 없습니다.`);
  }

  // 내가 막고 있는 세션만 센다.
  //
  // 같은 행을 여러 세션이 기다리면 전부 내 transactionid 를 기다리는 것이 아니다.
  // 첫 번째만 그렇고, 나머지는 그 앞사람이 쥔 tuple 잠금 뒤에 줄을 선다. 그래서
  // 한 단계만 보면 언제나 1 로 세어진다. pg_blocking_pids 로 줄 전체를 따라간다.
  const BLOCKED = `
    WITH RECURSIVE blocked AS (
      SELECT a.pid
        FROM pg_stat_activity a
       WHERE a.datname = current_database()
         AND pg_backend_pid() = ANY (pg_blocking_pids(a.pid))
      UNION
      SELECT a.pid
        FROM pg_stat_activity a, blocked b
       WHERE a.datname = current_database()
         AND b.pid = ANY (pg_blocking_pids(a.pid))
    )
  `;
  const WAITERS = `${BLOCKED} SELECT count(*)::int AS n FROM blocked`;
  const HELD = `
    ${BLOCKED}
    SELECT DISTINCT c.relname::text AS rel
      FROM pg_locks l
      JOIN blocked b ON b.pid = l.pid
      JOIN pg_class c ON c.oid = l.relation
     WHERE l.granted AND l.relation IS NOT NULL
  `;

  let released = false;
  const waiting = async () => {
    const r = await client.query<{ n: number }>(WAITERS);
    return r.rows[0]?.n ?? 0;
  };

  return {
    waiting,
    async waitFor(n, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const n_ = await waiting();
        if (n_ >= n) return;
        if (Date.now() > deadline) {
          throw new Error(`잠금 앞에서 ${n} 개가 멈추기를 기다렸지만 ${n_} 개만 멈췄습니다.`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async relationsHeldByWaiters() {
      const r = await client.query<{ rel: string }>(HELD);
      return r.rows.map((row) => row.rel);
    },
    async release() {
      if (released) return;
      released = true;
      await client.query("COMMIT");
      await client.end();
    },
  };
}

/** 대기 중인 초대 한 장. 보내는 흐름 자체는 team-invite.spec.ts 가 덮는다. */
export async function createInvitation(
  projectId: string,
  inviterId: string,
  invitee: { userId: string; mattermostUserId: string },
  role: "MAINTAINER" | "CONTRIBUTOR" = "MAINTAINER",
): Promise<{ id: string }> {
  const id = randomUUID();
  await withDb((db) =>
    db.query(
      `INSERT INTO project_invitation
         (id,"projectId","inviterId","inviteeId","inviteeMattermostUserId",role,status,"pendingInviteeId","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$4,now())`,
      [id, projectId, inviterId, invitee.userId, invitee.mattermostUserId, role],
    ),
  );
  return { id };
}

/** 이미 팀원인 상태를 만든다. 승인이 역할을 덮어쓰지 않는지 볼 때 쓴다. */
export async function addMember(
  projectId: string,
  userId: string,
  role: "MAINTAINER" | "CONTRIBUTOR",
) {
  await withDb((db) =>
    db.query(
      `INSERT INTO project_member (id,"projectId","userId",role,"createdAt") VALUES ($1,$2,$3,$4,now())`,
      [randomUUID(), projectId, userId, role],
    ),
  );
}

/** 지금 연결된 Mattermost 사용자 id. 없으면 null. */
export async function readMattermostUserId(userId: string): Promise<string | null> {
  return withDb(async (db) => {
    const r = await db.query<{ mattermostUserId: string }>(
      `SELECT "mattermostUserId" FROM "MattermostIdentity" WHERE "userId" = $1`,
      [userId],
    );
    return r.rows[0]?.mattermostUserId ?? null;
  });
}
