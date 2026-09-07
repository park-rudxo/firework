"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { createSeed, drawWinners } from "@/features/raffle/draw";
import { notify, notifyMany } from "@/features/notification/create";

export type RaffleState = { error: string | null };

const createSchema = z.object({
  surveyId: z.string().min(1),
  prizeName: z.string().trim().min(2, "경품 이름을 적어주세요.").max(100),
  prizeDescription: z.string().trim().max(500).optional(),
  winnerCount: z.coerce.number().int().min(1).max(100),
  closesAt: z.string().min(1, "마감일을 정해주세요."),
});

export async function createRaffle(
  slug: string,
  _prev: RaffleState,
  form: FormData,
): Promise<RaffleState> {
  const viewer = await requireViewer();

  const project = await db.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  if (project.ownerId !== viewer.id) return { error: "본인의 프로젝트만 추첨을 열 수 있습니다." };

  const parsed = createSchema.safeParse({
    surveyId: form.get("surveyId"),
    prizeName: form.get("prizeName"),
    prizeDescription: String(form.get("prizeDescription") ?? "") || undefined,
    winnerCount: form.get("winnerCount"),
    closesAt: form.get("closesAt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요." };
  }

  const closesAt = new Date(parsed.data.closesAt);
  if (Number.isNaN(closesAt.getTime())) return { error: "마감일이 올바르지 않습니다." };
  if (closesAt <= new Date()) return { error: "마감일은 미래여야 합니다." };

  const survey = await db.survey.findFirst({
    where: { id: parsed.data.surveyId, projectId: project.id },
    select: { id: true },
  });
  if (!survey) return { error: "설문을 찾을 수 없습니다." };

  const existing = await db.raffle.findFirst({
    where: { surveyId: survey.id, status: { in: ["OPEN", "CLOSED"] } },
    select: { id: true },
  });
  if (existing) return { error: "이 설문에는 이미 진행 중인 추첨이 있습니다." };

  // seed 는 지금 만들어 감춰두고 해시만 공개한다. 응모자를 다 본 뒤에
  // 결과가 마음에 들도록 seed 를 바꾸는 것을 이 커밋이 막는다.
  const { seed, seedHash } = createSeed();

  const raffle = await db.raffle.create({
    data: {
      projectId: project.id,
      surveyId: survey.id,
      prizeName: parsed.data.prizeName,
      prizeDescription: parsed.data.prizeDescription ?? null,
      winnerCount: parsed.data.winnerCount,
      closesAt,
      seedHash,
      seed, // 추첨 전까지 어떤 화면에도 내보내지 않는다
      status: "OPEN",
    },
  });

  // 이미 응답한 사람도 소급해서 응모시킨다. 설문을 먼저 쓴 사람이 손해를 보면 안 된다.
  const earlyResponders = await db.surveyParticipation.findMany({
    where: { surveyId: survey.id },
    select: { userId: true },
  });
  if (earlyResponders.length > 0) {
    await db.raffleEntry.createMany({
      data: earlyResponders.map((p) => ({
        raffleId: raffle.id,
        userId: p.userId,
        ticketCode: randomBytes(8).toString("hex"),
      })),
      skipDuplicates: true,
    });
  }

  await db.projectEvent.create({
    data: {
      projectId: project.id,
      type: "RAFFLE",
      title: `추첨 마감: ${parsed.data.prizeName}`,
      description: `${parsed.data.winnerCount}명 추첨. 설문에 응답하면 자동 응모됩니다.`,
      startsAt: closesAt,
      allDay: true,
      url: `/raffles/${raffle.id}`,
      createdById: viewer.id,
      autoSourceType: "raffle",
      autoSourceId: raffle.id,
    },
  });

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/calendar");
  return { error: null };
}

/**
 * 추첨 실행 + seed 공개.
 *
 * 여기서 seed 가 공개되고, 그 순간부터 누구나 당첨자를 처음부터 재계산할 수 있다.
 */
export async function drawRaffle(raffleId: string): Promise<RaffleState> {
  const viewer = await requireViewer();

  const raffle = await db.raffle.findUnique({
    where: { id: raffleId },
    select: {
      id: true,
      status: true,
      seed: true,
      winnerCount: true,
      closesAt: true,
      prizeName: true,
      project: { select: { ownerId: true, slug: true, name: true } },
      entries: { select: { id: true, ticketCode: true, userId: true } },
    },
  });
  if (!raffle) return { error: "추첨을 찾을 수 없습니다." };
  if (raffle.project.ownerId !== viewer.id) return { error: "권한이 없습니다." };
  if (raffle.status === "DRAWN") return { error: "이미 추첨이 끝났습니다." };
  if (raffle.status === "CANCELLED") return { error: "취소된 추첨입니다." };
  if (raffle.closesAt > new Date()) return { error: "마감 전에는 추첨할 수 없습니다." };
  if (!raffle.seed) return { error: "추첨 시드가 없습니다. 관리자에게 문의해주세요." };
  if (raffle.entries.length === 0) return { error: "응모자가 없습니다." };

  const byTicket = new Map(raffle.entries.map((e) => [e.ticketCode, e.id]));
  const winners = drawWinners(
    raffle.seed,
    raffle.entries.map((e) => e.ticketCode),
    raffle.winnerCount,
  );

  await db.$transaction([
    db.raffleWinner.createMany({
      data: winners.map((w) => ({
        raffleId: raffle.id,
        entryId: byTicket.get(w.ticketCode)!,
        rank: w.rank,
      })),
    }),
    db.raffle.update({
      where: { id: raffle.id },
      data: { status: "DRAWN", drawnAt: new Date() },
    }),
  ]);

  // 알리지 않으면 당첨자가 이 페이지를 우연히 다시 열어야만 당첨을 안다.
  // 경품이 설문 응답의 유일한 인센티브라 이 고리가 끊기면 기능이 반쪽이 된다.
  const winnerUserIds = winners
    .map((w) => raffle.entries.find((e) => e.ticketCode === w.ticketCode)?.userId)
    .filter((id): id is string => Boolean(id));

  await notifyMany(winnerUserIds, {
    type: "RAFFLE_WON",
    title: `축하합니다! ${raffle.prizeName} 에 당첨되셨습니다`,
    body: `${raffle.project.name} 추첨 결과입니다. 경품을 받을 연락처를 남겨주세요.`,
    url: `/raffles/${raffle.id}`,
  });

  revalidatePath(`/raffles/${raffleId}`);
  revalidatePath(`/projects/${raffle.project.slug}`);
  return { error: null };
}

const contactSchema = z.string().trim().min(2, "연락처를 입력해주세요.").max(200);

/** 당첨자가 경품 받을 연락처를 낸다. 제작자만 볼 수 있다. */
export async function submitWinnerContact(
  winnerId: string,
  _prev: RaffleState,
  form: FormData,
): Promise<RaffleState> {
  const viewer = await requireViewer();

  const winner = await db.raffleWinner.findUnique({
    where: { id: winnerId },
    select: {
      id: true,
      entry: { select: { userId: true } },
      raffle: { select: { id: true, prizeName: true, project: { select: { ownerId: true } } } },
    },
  });
  if (!winner) return { error: "당첨 정보를 찾을 수 없습니다." };
  if (winner.entry.userId !== viewer.id) return { error: "본인의 당첨 건만 제출할 수 있습니다." };

  const parsed = contactSchema.safeParse(form.get("contactInfo"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요." };

  await db.raffleWinner.update({
    where: { id: winnerId },
    data: { contactInfo: parsed.data, claimStatus: "SUBMITTED" },
  });

  await notify({
    userId: winner.raffle.project.ownerId,
    type: "RAFFLE_CONTACT_SUBMITTED",
    title: "당첨자가 연락처를 남겼습니다",
    body: `${winner.raffle.prizeName} — 경품을 보내주세요.`,
    url: `/raffles/${winner.raffle.id}`,
  });

  revalidatePath(`/raffles/${winner.raffle.id}`);
  return { error: null };
}

export async function markPrizeDelivered(winnerId: string): Promise<RaffleState> {
  const viewer = await requireViewer();

  const winner = await db.raffleWinner.findUnique({
    where: { id: winnerId },
    select: { id: true, raffle: { select: { id: true, project: { select: { ownerId: true } } } } },
  });
  if (!winner) return { error: "당첨 정보를 찾을 수 없습니다." };
  if (winner.raffle.project.ownerId !== viewer.id) return { error: "권한이 없습니다." };

  await db.raffleWinner.update({ where: { id: winnerId }, data: { claimStatus: "DELIVERED" } });
  revalidatePath(`/raffles/${winner.raffle.id}`);
  return { error: null };
}
