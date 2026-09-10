"use server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { serverEnv } from "@/lib/env";
import { MATTERMOST_ORIGIN, mattermostOAuthConfigured } from "./config";
import { STATE_COOKIE, stateHash } from "./oauth";

export async function connectMattermost() {
  const viewer = await requireViewer();
  if (!mattermostOAuthConfigured()) redirect("/settings/mattermost?result=unavailable");
  const state = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.$transaction(async tx => {
    await tx.verification.deleteMany({ where: { identifier: "mattermost:" + viewer.id } });
    await tx.verification.create({ data: {
      id: stateHash(state), identifier: "mattermost:" + viewer.id, value: viewer.id, expiresAt,
    } });
  });
  const origin = new URL(serverEnv().BETTER_AUTH_URL).origin;
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/mattermost/callback", maxAge: 600 });
  const url = new URL("/oauth/authorize", MATTERMOST_ORIGIN);
  url.searchParams.set("client_id", process.env.MATTERMOST_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", origin + "/api/mattermost/callback");
  url.searchParams.set("state", state);
  redirect(url.toString());
}
export async function disconnectMattermost() {
  const viewer = await requireViewer();
  await db.$transaction(async tx => {
    await tx.mattermostIdentity.deleteMany({ where: { userId: viewer.id } });
    await tx.verification.deleteMany({ where: { identifier: "mattermost:" + viewer.id } });
    await tx.projectFollow.updateMany({ where: { userId: viewer.id }, data: {
      notifyUpdates: false, notifyRecruitment: false, notificationChangedAt: new Date(),
    } });
    await tx.projectMember.updateMany({ where: { userId: viewer.id }, data: { notifyManagement: false, notificationChangedAt: new Date() } });
    await tx.bugReport.updateMany({ where: { reporterId: viewer.id }, data: { notifyStatus: false, notificationChangedAt: new Date() } });
    await tx.mattermostDelivery.updateMany({ where: { userId: viewer.id, status: { in: ["PENDING", "SENDING"] } }, data: { status: "CANCELLED" } });
  });
  revalidatePath("/", "layout");
  redirect("/settings/mattermost?result=disconnected");
}

