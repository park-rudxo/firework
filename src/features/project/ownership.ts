import type { RepoRef } from "@/lib/github";

/**
 * 소유 확인 배지를 어떻게 다시 계산할지 정한다.
 *
 * 배지의 뜻은 "등록자의 GitHub 계정이 이 저장소의 소유자나 협업자다" 이다.
 * 그러니 저장소가 바뀌면 배지의 근거가 통째로 사라진다. 예전에는 수정 경로에서
 * 이 값을 건드리지 않아서, 자기 저장소로 배지를 받은 뒤 남의 저장소 주소로
 * 바꿔치기해도 배지가 그대로 남았다.
 *
 * 규칙은 셋뿐이다.
 *   - 저장소가 그대로면 건드리지 않는다.
 *   - 저장소가 바뀌면 새 저장소 기준으로 다시 확인한다.
 *   - 확인할 수 없으면(계정 미연결, GitHub 호출 실패) 미확인이다.
 *
 * 마지막 줄이 핵심이다. 확인에 실패했을 때 이전 값을 살려두면, GitHub 이 잠깐
 * 불안정한 순간을 노려 배지를 유지한 채 저장소를 바꿀 수 있다.
 */
export async function resolveOwnershipVerified({
  repoChanged,
  nextRef,
  githubLogin,
  verify,
}: {
  repoChanged: boolean;
  nextRef: RepoRef | null;
  githubLogin: string | null;
  verify: (ref: RepoRef, login: string) => Promise<boolean>;
}): Promise<{ ownershipVerified: boolean } | Record<string, never>> {
  if (!repoChanged) return {};
  if (!nextRef || !githubLogin) return { ownershipVerified: false };

  const verified = await verify(nextRef, githubLogin).catch(() => false);
  return { ownershipVerified: verified };
}
