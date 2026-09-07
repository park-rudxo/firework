import { serverEnv } from "@/lib/env";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** 스냅샷을 다시 받아오기까지의 간격. 페이지 요청마다 GitHub 을 때리지 않기 위해 존재한다. */
export const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

export type RepoRef = { owner: string; repo: string };

/**
 * 저장소 URL 파싱.
 *
 * 사용자가 넣는 값이므로 형태를 좁게 잡는다. github.com 이 아닌 호스트나
 * 경로가 더 붙은 URL(`/tree/main/...`)은 정규화해서 받아들이되,
 * 호스트가 다르면 거부한다.
 */
export function parseRepoUrl(input: string): RepoRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const owner = segments[0];
  const rawRepo = segments[1];
  if (!owner || !rawRepo) return null;

  const repo = rawRepo.replace(/\.git$/i, "");

  // GitHub 의 소유자/저장소 이름 규칙
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  if (repo === "." || repo === "..") return null;

  return { owner, repo };
}

export function canonicalRepoUrl({ owner, repo }: RepoRef): string {
  return `https://github.com/${owner}/${repo}`;
}

function headers(accept = "application/vnd.github+json"): HeadersInit {
  const token = serverEnv().GITHUB_TOKEN;
  return {
    Accept: accept,
    "X-GitHub-Api-Version": API_VERSION,
    // 토큰이 없으면 시간당 60회, 있으면 5,000회로 올라간다.
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type RepoMeta = {
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  primaryLanguage: string | null;
  license: string | null;
  topics: string[];
  archived: boolean;
  pushedAt: Date | null;
};

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function fetchRepoMeta(ref: RepoRef): Promise<RepoMeta> {
  const res = await fetch(`${API}/repos/${ref.owner}/${ref.repo}`, {
    headers: headers(),
    cache: "no-store",
  });

  if (res.status === 404) {
    throw new GithubError("저장소를 찾을 수 없습니다. 공개 저장소인지 확인해주세요.", 404);
  }
  if (res.status === 403 || res.status === 429) {
    throw new GithubError(
      "GitHub API 호출 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new GithubError(`GitHub 응답이 올바르지 않습니다 (${res.status}).`, res.status);
  }

  const data = (await res.json()) as {
    name: string;
    owner: { login: string };
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    language: string | null;
    license: { spdx_id?: string | null; name?: string | null } | null;
    topics?: string[];
    archived: boolean;
    pushed_at: string | null;
  };

  return {
    // 대소문자가 다를 수 있으므로 GitHub 이 알려준 정규 표기를 쓴다.
    owner: data.owner.login,
    repo: data.name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    primaryLanguage: data.language,
    license: data.license?.spdx_id && data.license.spdx_id !== "NOASSERTION"
      ? data.license.spdx_id
      : (data.license?.name ?? null),
    topics: data.topics ?? [],
    archived: data.archived,
    pushedAt: data.pushed_at ? new Date(data.pushed_at) : null,
  };
}

export async function fetchLanguages(ref: RepoRef): Promise<Record<string, number>> {
  const res = await fetch(`${API}/repos/${ref.owner}/${ref.repo}/languages`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return {};
  return (await res.json()) as Record<string, number>;
}

/**
 * README 를 GitHub 이 렌더한 HTML 로 받는다.
 *
 * 이 HTML 은 남이 쓴 것이므로 신뢰 불가 콘텐츠다. 저장은 원본 그대로 하고
 * 화면에 낼 때 반드시 sanitizeHtml 을 통과시킨다.
 */
export async function fetchReadmeHtml(ref: RepoRef): Promise<string | null> {
  const res = await fetch(`${API}/repos/${ref.owner}/${ref.repo}/readme`, {
    headers: headers("application/vnd.github.html+json"),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return await res.text();
}

/**
 * 업로더가 이 저장소의 주인인지 확인한다.
 *
 * owner 로그인이 일치하면 그것으로 끝이고, 조직 저장소처럼 다른 경우에는
 * 협업자 목록에 있는지 본다. 협업자 조회에는 권한이 필요해서 실패할 수 있는데,
 * 그때는 "확인 못 함"으로 두고 등록 자체를 막지는 않는다.
 */
export async function verifyOwnership(ref: RepoRef, githubLogin: string): Promise<boolean> {
  if (ref.owner.toLowerCase() === githubLogin.toLowerCase()) return true;

  const res = await fetch(
    `${API}/repos/${ref.owner}/${ref.repo}/collaborators/${encodeURIComponent(githubLogin)}`,
    { headers: headers(), cache: "no-store" },
  );
  // 204 = 협업자임, 404 = 아님, 403 = 우리 토큰으로는 조회 불가
  return res.status === 204;
}

export type RepoSnapshotInput = RepoMeta & {
  languages: Record<string, number>;
  readmeHtml: string | null;
};

/** 프로젝트 등록·갱신 시 한 번에 긁어온다. */
export async function fetchRepoSnapshot(ref: RepoRef): Promise<RepoSnapshotInput> {
  const meta = await fetchRepoMeta(ref);
  // 메타가 성공한 뒤에만 부가 정보를 받는다. 둘 다 실패해도 등록은 되게 한다.
  const [languages, readmeHtml] = await Promise.all([
    fetchLanguages(ref).catch(() => ({})),
    fetchReadmeHtml(ref).catch(() => null),
  ]);
  return { ...meta, languages, readmeHtml };
}
