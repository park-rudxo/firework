"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProjectNotificationTopic } from "@prisma/client";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { applyNotificationTopics, applySubscription } from "@/features/subscription/mutations";
import { ALL_TOPICS, type SubscriptionState } from "@/features/subscription/queries";

const topicSchema = z.enum(["UPDATE", "RECRUITING"]);

async function projectIdBySlug(slug: string): Promise<string> {
  const project = await db.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  return project.id;
}

/** 구독 켜고 끄기. 규칙은 features/subscription/mutations.ts 에 있다. */
export async function setSubscription(
  slug: string,
  subscribed: boolean,
): Promise<SubscriptionState> {
  const viewer = await requireViewer();
  const projectId = await projectIdBySlug(slug);
  const state = await applySubscription(projectId, viewer.id, subscribed);

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/subscriptions");
  return state;
}

/** 알림으로 받을 주제를 정한다. 빈 목록이면 전부 끈다. */
export async function setNotificationTopics(
  slug: string,
  topics: ProjectNotificationTopic[],
): Promise<SubscriptionState> {
  const viewer = await requireViewer();

  const parsed = z.array(topicSchema).max(ALL_TOPICS.length).safeParse(topics);
  if (!parsed.success) throw new Error("알림 종류를 확인해주세요.");

  const projectId = await projectIdBySlug(slug);
  const state = await applyNotificationTopics(projectId, viewer.id, parsed.data);

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/subscriptions");
  return state;
}
