import "server-only";

import type { ServerEnv } from "@/lib/env";
import { MattermostError } from "@/features/mattermost/client";

export const OAUTH_STATE_COOKIE = "mm_oauth_state";

/** Mattermost 앱에 등록해야 하는 콜백 주소. 화면에도 그대로 보여준다. */
export function redirectUri(env: ServerEnv): string {
  return new URL("/api/mattermost/callback", env.BETTER_AUTH_URL).toString();
}

/** 인가 코드를 액세스 토큰으로 바꾼다. */
export async function exchangeCode(env: ServerEnv, code: string): Promise<string> {
  const res = await fetch(new URL("/oauth/access_token", env.MATTERMOST_URL!), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.MATTERMOST_CLIENT_ID!,
      client_secret: env.MATTERMOST_CLIENT_SECRET!,
      redirect_uri: redirectUri(env),
      code,
    }),
  });

  if (!res.ok) throw new MattermostError("Mattermost 인증에 실패했습니다.");

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new MattermostError("Mattermost 가 토큰을 주지 않았습니다.");
  return data.access_token;
}
