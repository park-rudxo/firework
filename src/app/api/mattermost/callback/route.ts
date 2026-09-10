import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { mattermostConfigured, serverEnv } from "@/lib/env";
import { getViewer } from "@/lib/session";
import { fetchIdentity, MattermostError } from "@/features/mattermost/client";
import { exchangeCode, OAUTH_STATE_COOKIE } from "@/features/mattermost/oauth";

/**
 * 연결 마무리.
 *
 * 여기서 하는 일은 인증뿐이다. **메시지 수신 동의는 만들지 않는다.**
 * 계정을 연결했다는 사실이 "알림을 받겠다" 는 뜻이 되면, 인증하려던 사람에게
 * 원치 않는 메시지가 가기 시작한다. 그래서 deliveryEnabled 는 기본값(false) 그대로
 * 두고, 웹훅도 사용자가 따로 등록해야 한다.
 */
export async function GET(request: NextRequest) {
  const env = serverEnv();
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/settings/notifications?${new URLSearchParams(params)}`, env.BETTER_AUTH_URL),
    );

  if (!mattermostConfigured(env)) return back({ error: "unconfigured" });

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(new URL("/sign-in?next=/settings/notifications", env.BETTER_AUTH_URL));
  }

  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!expected || !state || state !== expected) return back({ error: "state" });
  if (!code) return back({ error: "denied" });

  let identity;
  try {
    identity = await fetchIdentity(await exchangeCode(env, code));
  } catch (err) {
    if (err instanceof MattermostError) return back({ error: "verify" });
    throw err;
  }

  // 한 Mattermost 계정이 여러 firework 계정에 붙으면 "인증된 구성원 한 명" 이라는
  // 뜻이 사라진다. 다중 계정을 막는 것이 이 연결을 인증으로 쓰는 이유이므로,
  // 이미 다른 계정에 붙어 있으면 옮겨붙이지 않고 거절한다.
  const taken = await db.mattermostAccount.findUnique({
    where: { mattermostUserId: identity.id },
    select: { userId: true },
  });
  if (taken && taken.userId !== viewer.id) return back({ error: "taken" });

  await db.mattermostAccount.upsert({
    where: { userId: viewer.id },
    create: {
      userId: viewer.id,
      mattermostUserId: identity.id,
      username: identity.username,
      serverUrl: env.MATTERMOST_URL!,
      verifiedAt: new Date(),
    },
    update: {
      mattermostUserId: identity.id,
      username: identity.username,
      serverUrl: env.MATTERMOST_URL!,
      verifiedAt: new Date(),
    },
  });

  return back({ connected: "1" });
}
