import { describe, expect, it } from "vitest";

import {
  createSeed,
  drawWinners,
  hashSeed,
  ticketDigest,
  verifyDraw,
  verifySeed,
} from "@/features/raffle/draw";

const tickets = Array.from({ length: 50 }, (_, i) => `ticket-${String(i).padStart(3, "0")}`);

describe("commit–reveal", () => {
  it("공개한 해시가 시드와 맞는다", () => {
    const { seed, seedHash } = createSeed();
    expect(verifySeed(seed, seedHash)).toBe(true);
    expect(seedHash).toBe(hashSeed(seed));
  });

  it("시드를 바꾸면 해시가 어긋난다 — 결과를 사후에 손볼 수 없다", () => {
    const { seedHash } = createSeed();
    const { seed: otherSeed } = createSeed();
    expect(verifySeed(otherSeed, seedHash)).toBe(false);
  });

  it("시드마다 다른 시드가 나온다", () => {
    const seeds = new Set(Array.from({ length: 100 }, () => createSeed().seed));
    expect(seeds.size).toBe(100);
  });
});

describe("당첨자 선정", () => {
  it("같은 시드와 같은 응모자면 항상 같은 결과다", () => {
    const { seed } = createSeed();
    const first = drawWinners(seed, tickets, 5);
    for (let i = 0; i < 20; i += 1) {
      expect(drawWinners(seed, tickets, 5)).toEqual(first);
    }
  });

  it("응모자 목록의 순서가 결과를 바꾸지 않는다", () => {
    // DB 가 행을 어떤 순서로 돌려주든 결과가 흔들리면 안 된다.
    const { seed } = createSeed();
    const expected = drawWinners(seed, tickets, 5);

    const shuffled = [...tickets].sort(() => Math.random() - 0.5);
    expect(drawWinners(seed, shuffled, 5)).toEqual(expected);

    const reversed = [...tickets].reverse();
    expect(drawWinners(seed, reversed, 5)).toEqual(expected);
  });

  it("시드가 다르면 결과가 달라진다", () => {
    const a = drawWinners(createSeed().seed, tickets, 5).map((w) => w.ticketCode);
    const b = drawWinners(createSeed().seed, tickets, 5).map((w) => w.ticketCode);
    expect(a).not.toEqual(b);
  });

  it("당첨자가 중복되지 않는다", () => {
    const { seed } = createSeed();
    const winners = drawWinners(seed, tickets, 10);
    expect(new Set(winners.map((w) => w.ticketCode)).size).toBe(10);
  });

  it("등수가 1부터 순서대로 매겨진다", () => {
    const { seed } = createSeed();
    expect(drawWinners(seed, tickets, 3).map((w) => w.rank)).toEqual([1, 2, 3]);
  });

  it("응모자보다 많이 뽑으려 하면 있는 만큼만 뽑는다", () => {
    const { seed } = createSeed();
    expect(drawWinners(seed, tickets.slice(0, 3), 10)).toHaveLength(3);
  });

  it("응모자가 없으면 당첨자도 없다", () => {
    expect(drawWinners(createSeed().seed, [], 5)).toEqual([]);
  });

  it("추첨값이 작은 순서대로 뽑힌다", () => {
    const { seed } = createSeed();
    const winners = drawWinners(seed, tickets, 5);
    const digests = winners.map((w) => w.digest);
    expect([...digests].sort()).toEqual(digests);

    // 뽑히지 않은 티켓은 전부 마지막 당첨자보다 추첨값이 크다.
    const last = digests.at(-1)!;
    const losers = tickets
      .filter((t) => !winners.some((w) => w.ticketCode === t))
      .map((t) => ticketDigest(seed, t));
    expect(losers.every((d) => d > last)).toBe(true);
  });

  it("추첨이 한쪽으로 쏠리지 않는다", () => {
    // 시드를 바꿔가며 반복하면 모든 티켓이 고르게 당첨돼야 한다.
    const wins = new Map(tickets.map((t) => [t, 0]));
    const rounds = 2000;
    for (let i = 0; i < rounds; i += 1) {
      for (const w of drawWinners(createSeed().seed, tickets, 1)) {
        wins.set(w.ticketCode, wins.get(w.ticketCode)! + 1);
      }
    }
    const expected = rounds / tickets.length; // 40
    for (const count of wins.values()) {
      expect(count).toBeGreaterThan(expected * 0.4);
      expect(count).toBeLessThan(expected * 1.6);
    }
  });
});

describe("공개 검증", () => {
  it("정상 추첨은 검증을 통과한다", () => {
    const { seed, seedHash } = createSeed();
    const winners = drawWinners(seed, tickets, 5).map((w) => w.ticketCode);

    expect(
      verifyDraw({ seed, seedHash, ticketCodes: tickets, winnerCount: 5, announcedWinners: winners }),
    ).toEqual({ seedValid: true, winnersMatch: true });
  });

  it("당첨자를 바꿔치기하면 검증이 실패한다", () => {
    const { seed, seedHash } = createSeed();
    const winners = drawWinners(seed, tickets, 5).map((w) => w.ticketCode);
    const tampered = [...winners.slice(0, 4), "ticket-049"];

    const result = verifyDraw({
      seed,
      seedHash,
      ticketCodes: tickets,
      winnerCount: 5,
      announcedWinners: tampered,
    });
    expect(result.seedValid).toBe(true);
    expect(result.winnersMatch).toBe(false);
  });

  it("시드를 바꿔 결과를 맞추려 해도 해시에서 걸린다", () => {
    const { seedHash } = createSeed();
    const { seed: forged } = createSeed();
    const winners = drawWinners(forged, tickets, 5).map((w) => w.ticketCode);

    const result = verifyDraw({
      seed: forged,
      seedHash,
      ticketCodes: tickets,
      winnerCount: 5,
      announcedWinners: winners,
    });
    // 당첨자는 자기가 만든 시드와 맞지만, 사전에 공개된 해시와 어긋난다.
    expect(result.winnersMatch).toBe(true);
    expect(result.seedValid).toBe(false);
  });
});
