import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * 추첨 알고리즘 — commit–reveal.
 *
 * 제작자가 직접 추첨을 돌리므로 "지인한테 몰아준 거 아니냐"는 의심이 필연이다.
 * 그래서 결과를 사후에 누구나 재계산할 수 있게 만든다.
 *
 *   1. 개설 시  서버가 seed 를 만들고 sha256(seed) 만 공개한다 (커밋)
 *   2. 추첨 시  HMAC-SHA256(seed, ticketCode) 값을 정렬해 상위 N명을 뽑는다
 *   3. 추첨 후  seed 를 공개한다 (리빌)
 *
 * seed 를 미리 정해두고 해시로 묶어놨기 때문에, 응모자를 다 본 뒤에 결과가
 * 마음에 들도록 seed 를 바꾸는 것이 불가능하다. 바꾸면 공개된 해시와 어긋난다.
 *
 * 이 모듈은 부수효과가 없는 순수 함수만 담는다. 그래야 같은 입력에 같은 결과가
 * 나오는지 테스트로 못박을 수 있다.
 */

export function createSeed(): { seed: string; seedHash: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, seedHash: hashSeed(seed) };
}

export function hashSeed(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export function verifySeed(seed: string, seedHash: string): boolean {
  return hashSeed(seed) === seedHash;
}

/** 티켓 하나의 추첨값. 이 값이 작을수록 당첨에 가깝다. */
export function ticketDigest(seed: string, ticketCode: string): string {
  return createHmac("sha256", seed).update(ticketCode, "utf8").digest("hex");
}

export type DrawResult = { ticketCode: string; digest: string; rank: number };

/**
 * 당첨자 선정. 같은 seed 와 같은 응모자 목록이면 언제 몇 번을 돌려도 결과가 같다.
 *
 * 입력 순서에 결과가 좌우되지 않도록 ticketCode 로 먼저 정렬한다.
 * DB 가 행을 어떤 순서로 돌려주든 결과가 흔들리면 안 되기 때문이다.
 */
export function drawWinners(
  seed: string,
  ticketCodes: string[],
  winnerCount: number,
): DrawResult[] {
  const scored = [...ticketCodes]
    .sort()
    .map((ticketCode) => ({ ticketCode, digest: ticketDigest(seed, ticketCode) }));

  // digest 가 같을 확률은 사실상 0이지만, 그때도 결과가 흔들리지 않도록
  // ticketCode 를 2차 기준으로 둔다.
  scored.sort((a, b) => (a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : a.ticketCode < b.ticketCode ? -1 : 1));

  return scored
    .slice(0, Math.max(0, Math.min(winnerCount, scored.length)))
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

/**
 * 공개 검증. 추첨 페이지에 그대로 노출되는 절차이고,
 * 제3자가 이 함수 없이 손으로 따라해도 같은 답이 나와야 한다.
 */
export function verifyDraw({
  seed,
  seedHash,
  ticketCodes,
  winnerCount,
  announcedWinners,
}: {
  seed: string;
  seedHash: string;
  ticketCodes: string[];
  winnerCount: number;
  announcedWinners: string[];
}): { seedValid: boolean; winnersMatch: boolean } {
  const seedValid = verifySeed(seed, seedHash);
  const recomputed = drawWinners(seed, ticketCodes, winnerCount).map((w) => w.ticketCode);
  const winnersMatch =
    recomputed.length === announcedWinners.length &&
    recomputed.every((code, i) => code === announcedWinners[i]);

  return { seedValid, winnersMatch };
}
