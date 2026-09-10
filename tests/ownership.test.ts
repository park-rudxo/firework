import { describe, expect, it, vi } from "vitest";

import { resolveOwnershipVerified } from "@/features/project/ownership";

const REF = { owner: "park-rudxo", repo: "ssafy-check" };

/**
 * "저장소 소유 확인" 배지는 등록자가 그 저장소의 주인이라는 뜻이다.
 * 저장소를 바꾸면 배지의 근거가 통째로 사라지는데, 예전에는 수정 경로에서
 * 이 값을 건드리지 않아 배지가 그대로 남았다.
 */
describe("소유 확인 배지 재계산", () => {
  it("저장소가 그대로면 건드리지 않는다", async () => {
    const verify = vi.fn();
    const patch = await resolveOwnershipVerified({
      repoChanged: false,
      nextRef: REF,
      githubLogin: "park-rudxo",
      verify,
    });

    expect(patch).toEqual({});
    expect(verify).not.toHaveBeenCalled();
  });

  it("저장소를 바꾸면 새 저장소 기준으로 다시 확인한다", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const patch = await resolveOwnershipVerified({
      repoChanged: true,
      nextRef: REF,
      githubLogin: "park-rudxo",
      verify,
    });

    expect(verify).toHaveBeenCalledWith(REF, "park-rudxo");
    expect(patch).toEqual({ ownershipVerified: true });
  });

  it("남의 저장소로 바꾸면 배지가 떨어진다", async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const patch = await resolveOwnershipVerified({
      repoChanged: true,
      nextRef: REF,
      githubLogin: "someone-else",
      verify,
    });

    expect(patch).toEqual({ ownershipVerified: false });
  });

  it("저장소를 지우면 확인할 대상이 없으므로 미확인이다", async () => {
    const patch = await resolveOwnershipVerified({
      repoChanged: true,
      nextRef: null,
      githubLogin: "park-rudxo",
      verify: vi.fn(),
    });

    expect(patch).toEqual({ ownershipVerified: false });
  });

  it("GitHub 계정을 연결하지 않았으면 미확인이다", async () => {
    const patch = await resolveOwnershipVerified({
      repoChanged: true,
      nextRef: REF,
      githubLogin: null,
      verify: vi.fn(),
    });

    expect(patch).toEqual({ ownershipVerified: false });
  });

  it("확인에 실패하면 이전 값을 살려두지 않고 미확인으로 내린다", async () => {
    // GitHub 이 잠깐 불안정한 순간을 노려 배지를 유지한 채 저장소를 바꿀 수 있으면
    // 배지가 아무 뜻도 없어진다.
    const verify = vi.fn().mockRejectedValue(new Error("rate limit"));
    const patch = await resolveOwnershipVerified({
      repoChanged: true,
      nextRef: REF,
      githubLogin: "park-rudxo",
      verify,
    });

    expect(patch).toEqual({ ownershipVerified: false });
  });
});
