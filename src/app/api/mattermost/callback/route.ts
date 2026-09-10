import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { serverEnv } from "@/lib/env";
import { MATTERMOST_ORIGIN, mattermostOAuthConfigured } from "@/features/mattermost/config";
import { sameSecret, stateHash, STATE_COOKIE } from "@/features/mattermost/oauth";

export async function GET(request: Request) {
  const origin = new URL(serverEnv().BETTER_AUTH_URL).origin;
  const finish = (result: string) => {
    const response = NextResponse.redirect(origin + "/settings/mattermost?result=" + result);
    response.cookies.set(STATE_COOKIE, "", { path: "/api/mattermost/callback", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "";
  const cookie = (await cookies()).get(STATE_COOKIE)?.value ?? "";
  const viewer = await getViewer();
  if (!viewer || !mattermostOAuthConfigured() || !state || !cookie || !sameSecret(state, cookie))
    return finish("invalid");
  // Atomically consume state before code exchange. Bound to both browser and local account.
  const used = await db.verification.deleteMany({ where: {
    id: stateHash(state), identifier: "mattermost:" + viewer.id, value: viewer.id,
    expiresAt: { gt: new Date() },
  } });
  if (used.count !== 1) return finish("invalid");
  const code = params.get("code");
  if (!code || params.has("error")) return finish("cancelled");
  try {
    const response = await fetch(MATTERMOST_ORIGIN + "/oauth/access_token", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: process.env.MATTERMOST_CLIENT_ID!,
        client_secret: process.env.MATTERMOST_CLIENT_SECRET!, code,
        redirect_uri: origin + "/api/mattermost/callback",
      }),
    });
    if (!response.ok) return finish("failed");
    const token = z.object({ access_token: z.string().min(1) }).parse(await response.json());
    const meResponse = await fetch(MATTERMOST_ORIGIN + "/api/v4/users/me", {
      headers: { Authorization: "Bearer " + token.access_token },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!meResponse.ok) return finish("failed");
    const me = z.object({ id: z.string().regex(/^[a-z0-9]{26}$/), username: z.string().min(1), delete_at: z.number() }).parse(await meResponse.json());
    if (me.delete_at !== 0) return finish("failed");
    const identity = await db.mattermostIdentity.findUnique({ where: { userId: viewer.id } });
    if (identity && identity.mattermostUserId !== me.id) return finish("disconnect-first");
    // Unique Mattermost ID prevents one verified account from linking to multiple local accounts.
    await db.mattermostIdentity.upsert({
      where: { userId: viewer.id },
      create: { userId: viewer.id, mattermostUserId: me.id, username: me.username },
      update: { username: me.username },
    });
    return finish("connected");
  } catch {
    // Never expose OAuth codes, tokens, or upstream response bodies in UI/logs.
    return finish("failed");
  }
}

