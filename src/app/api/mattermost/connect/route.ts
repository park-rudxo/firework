import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { mattermostConfigured, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";
import { OAUTH_STATE_COOKIE, redirectUri } from "@/features/mattermost/oauth";

/**
 * Mattermost 계정 연결 시작.
 *
 * 사용자가 사용자명을 적어내는 방식은 쓰지 않는다. 적어낸 이름은 아무것도 증명하지
 * 못하고, 남의 이름을 적으면 그 사람에게 메시지를 보내는 경로가 된다.
 * 서버가 토큰으로 직접 확인한 id 만 신원의 근거로 삼는다.
 */
export async function GET() {
  const env = serverEnv();
  if (!mattermostConfigured(env)) {
    return NextResponse.json({ error: "Mattermost 연동이 설정되지 않았습니다." }, { status: 503 });
  }

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(new URL("/sign-in?next=/settings/notifications", env.BETTER_AUTH_URL));
  }

  // CSRF 방어. 콜백에서 쿠키의 값과 대조한다.
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(env.BETTER_AUTH_URL).protocol === "https:",
    path: "/api/mattermost",
    maxAge: 600,
  });

  const authorize = new URL("/oauth/authorize", env.MATTERMOST_URL!);
  authorize.searchParams.set("client_id", env.MATTERMOST_CLIENT_ID!);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri(env));
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize);
}
