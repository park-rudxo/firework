import "server-only";

import { db } from "@/lib/db";

/**
 * 일별 롤업에 담는 지표는 되돌릴 수 없는 것뿐이다.
 * 좋아요·관심등록·써봤어요는 껐다 켜기를 반복해 부풀릴 수 있으므로
 * 여기가 아니라 각 피벗 테이블의 createdAt 으로 센다.
 *
 * 설문 응답은 취소할 수 없어 부풀릴 수 없고, 무엇보다 응답 행에 시간 정보를
 * 두지 않기로 했으므로(익명성) 기간별 집계를 낼 곳이 여기뿐이다.
 */
export type CountableStat = "views" | "outboundClicks" | "surveyResponses";

/** 오늘 날짜(UTC 자정)로 정규화. Postgres 의 DATE 컬럼과 맞춘다. */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function bumpStat(projectId: string, stat: CountableStat, by = 1): Promise<void> {
  const day = today();
  try {
    await db.projectStatDaily.upsert({
      where: { projectId_day: { projectId, day } },
      create: { projectId, day, [stat]: by },
      update: { [stat]: { increment: by } },
    });
  } catch {
    // 지표 집계는 부가 기능이다. 실패해도 사용자 요청을 깨뜨리지 않는다.
  }
}
