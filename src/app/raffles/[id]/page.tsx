import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift, Lock, ShieldCheck, Trophy } from "lucide-react";

import { DrawButton } from "@/components/raffle/draw-button";
import { WinnerContactForm } from "@/components/raffle/winner-contact-form";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { ticketDigest, verifyDraw } from "@/features/raffle/draw";

export const metadata: Metadata = { title: "추첨" };

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

export default async function RafflePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();

  const raffle = await db.raffle.findUnique({
    where: { id },
    select: {
      id: true,
      prizeName: true,
      prizeDescription: true,
      winnerCount: true,
      closesAt: true,
      seedHash: true,
      seed: true,
      status: true,
      drawnAt: true,
      project: { select: { slug: true, name: true, ownerId: true } },
      entries: { select: { id: true, ticketCode: true, userId: true } },
      winners: {
        orderBy: { rank: "asc" },
        select: {
          id: true,
          rank: true,
          claimStatus: true,
          contactInfo: true,
          entry: { select: { ticketCode: true, userId: true } },
        },
      },
    },
  });
  if (!raffle) notFound();

  const isOwner = viewer?.id === raffle.project.ownerId;
  const drawn = raffle.status === "DRAWN";
  const closed = raffle.closesAt <= new Date();

  const myEntry = viewer ? raffle.entries.find((e) => e.userId === viewer.id) : undefined;
  const myWin = viewer ? raffle.winners.find((w) => w.entry.userId === viewer.id) : undefined;

  // 추첨 전에는 seed 를 절대 내보내지 않는다. 이 페이지가 seed 를 렌더하는 유일한 곳이다.
  const revealedSeed = drawn ? raffle.seed : null;

  const verification = revealedSeed
    ? verifyDraw({
        seed: revealedSeed,
        seedHash: raffle.seedHash,
        ticketCodes: raffle.entries.map((e) => e.ticketCode),
        winnerCount: raffle.winnerCount,
        announcedWinners: raffle.winners.map((w) => w.entry.ticketCode),
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/projects/${raffle.project.slug}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {raffle.project.name}
      </Link>

      <header className="mt-5 flex items-start gap-4">
        <Gift className="mt-1 size-8 shrink-0 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold">{raffle.prizeName}</h1>
          {raffle.prizeDescription ? (
            <p className="mt-1.5 text-muted-foreground">{raffle.prizeDescription}</p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {raffle.winnerCount}명 추첨 · 응모 {raffle.entries.length}명 ·{" "}
            {drawn
              ? `${fmt.format(raffle.drawnAt!)} 추첨 완료`
              : `${fmt.format(raffle.closesAt)} 마감`}
          </p>
        </div>
      </header>

      {myWin ? (
        <section className="mt-6 rounded-card border border-accent/50 bg-accent/5 p-5">
          <Trophy className="size-6 text-accent" aria-hidden />
          <p className="mt-3 font-medium">축하합니다. {myWin.rank}등에 당첨되셨습니다.</p>
          {myWin.claimStatus === "PENDING" ? (
            <>
              <p className="mt-1.5 text-sm text-muted-foreground">
                경품을 받을 연락처를 남겨주세요. 제작자에게만 보입니다.
              </p>
              <div className="mt-4">
                <WinnerContactForm winnerId={myWin.id} />
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {myWin.claimStatus === "DELIVERED"
                ? "경품 지급이 완료되었습니다."
                : "연락처가 전달되었습니다. 제작자의 연락을 기다려주세요."}
            </p>
          )}
        </section>
      ) : myEntry && drawn ? (
        <p className="mt-6 rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
          아쉽게도 이번에는 당첨되지 않았습니다. 응모 티켓{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5">{myEntry.ticketCode}</code> 로
          아래에서 결과를 직접 검증해보실 수 있습니다.
        </p>
      ) : myEntry ? (
        <p className="mt-6 rounded-card border border-success/40 bg-success/5 p-4 text-sm">
          응모되었습니다. 내 티켓{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5">{myEntry.ticketCode}</code>
        </p>
      ) : !drawn ? (
        <p className="mt-6 rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
          <Link href={`/projects/${raffle.project.slug}/survey`} className="text-primary underline">
            설문에 응답
          </Link>
          하면 자동으로 응모됩니다.
        </p>
      ) : null}

      {isOwner && closed && !drawn ? (
        <section className="mt-6 rounded-card border border-border bg-surface p-5">
          <h2 className="font-medium">추첨 실행</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            실행하면 시드가 공개되고, 그때부터 누구나 당첨자를 처음부터 재계산할 수 있습니다.
            되돌릴 수 없습니다.
          </p>
          <div className="mt-4">
            <DrawButton raffleId={raffle.id} />
          </div>
        </section>
      ) : null}

      {/* ── 공정성 검증 ────────────────────────────────────── */}
      <section className="mt-10 rounded-card border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-5 text-success" aria-hidden />
          이 추첨은 조작할 수 없습니다
        </h2>

        <p className="mt-3 text-sm text-muted-foreground">
          추첨을 열 때 서버가 무작위 시드를 만들고 <strong>그 해시만 먼저 공개</strong>했습니다.
          응모자를 다 본 뒤에 결과가 마음에 들도록 시드를 바꾸면 공개된 해시와 어긋나므로,
          제작자도 운영자도 결과를 손볼 수 없습니다.
        </p>

        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">시드 해시 (추첨 전 공개됨)</dt>
            <dd className="mt-1 break-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs">
              {raffle.seedHash}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {revealedSeed ? null : <Lock className="size-3.5" aria-hidden />}
              시드 {revealedSeed ? "(공개됨)" : "(추첨 후 공개)"}
            </dt>
            <dd className="mt-1 break-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs">
              {revealedSeed ?? "추첨이 끝나면 여기에 공개됩니다."}
            </dd>
          </div>
        </dl>

        {verification ? (
          <p
            className={`mt-4 rounded-lg p-3 text-sm ${
              verification.seedValid && verification.winnersMatch
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            }`}
          >
            {verification.seedValid && verification.winnersMatch
              ? "검증 통과 — 공개된 시드의 해시가 사전에 공개된 값과 일치하고, 당첨자도 재계산 결과와 같습니다."
              : "검증 실패 — 운영자에게 문의해주세요."}
          </p>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            직접 검증하는 방법
          </summary>
          <div className="prose-untrusted mt-3 text-sm">
            <ol className="list-decimal pl-5">
              <li>
                <code>sha256(시드)</code> 가 위의 시드 해시와 같은지 확인합니다.
              </li>
              <li>
                응모 티켓마다 <code>HMAC-SHA256(시드, 티켓코드)</code> 를 계산합니다.
              </li>
              <li>그 값을 오름차순으로 정렬해 앞에서 {raffle.winnerCount}개를 고릅니다.</li>
              <li>그 티켓들이 아래 당첨 목록과 같은지 봅니다.</li>
            </ol>
            <pre>
              <code>{`# 티켓 하나의 추첨값 구하기 (bash)
echo -n "<티켓코드>" | openssl dgst -sha256 -hmac "<시드>"`}</code>
            </pre>
          </div>
        </details>
      </section>

      {drawn ? (
        <section className="mt-8">
          <h2 className="font-medium">당첨 티켓</h2>
          <ol className="mt-3 flex flex-col gap-2">
            {raffle.winners.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <span className="font-medium">{w.rank}등</span>
                <code className="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs">
                  {w.entry.ticketCode}
                </code>
                {isOwner ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {w.contactInfo ? `연락처: ${w.contactInfo}` : "연락처 미제출"}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-medium">응모 티켓 전체 ({raffle.entries.length})</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          누가 응모했는지는 공개하지 않습니다. 검증에 필요한 티켓 코드만 공개합니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...raffle.entries]
            .sort((a, b) => (a.ticketCode < b.ticketCode ? -1 : 1))
            .map((e) => (
              <code
                key={e.id}
                title={revealedSeed ? `추첨값 ${ticketDigest(revealedSeed, e.ticketCode)}` : undefined}
                className={`rounded px-2 py-1 font-mono text-xs ${
                  myEntry?.id === e.id
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-muted text-muted-foreground"
                }`}
              >
                {e.ticketCode}
              </code>
            ))}
        </div>
      </section>
    </div>
  );
}
