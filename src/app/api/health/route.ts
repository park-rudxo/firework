import { db } from "@/lib/db";

/**
 * 배포가 살아 있는지 확인하는 한 줄짜리 창구.
 *
 * 화면이 흰 채로 뜰 때 원인은 대개 둘 중 하나다 — 앱이 안 떴거나, 앱은 떴는데
 * 데이터베이스에 못 붙거나. 이 둘은 브라우저에서 구별되지 않으므로 여기서 갈라준다.
 *
 * 실패해도 원인 문자열은 돌려주지 않는다. 연결 실패 메시지에는 호스트와 사용자명이
 * 그대로 들어 있어서, 인증 없이 열리는 이 경로로 내보내면 안 된다.
 * 자세한 내용은 서버 로그를 본다.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[health] 데이터베이스에 연결할 수 없습니다", error);
    return Response.json(
      { status: "error", check: "database" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
