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
