import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Mattermost 서버와 이야기하는 얇은 층.
 *
 * 싸피 출석 체크 확장 프로그램은 브라우저에 이미 로그인된 세션으로 /users/me 를
 * 부르고 개인 Incoming Webhook 을 만들어 쓴다. 그 방식은 확장 프로그램이라 성립한다 —
 * 사용자의 브라우저 안에서, 사용자의 쿠키로, 사용자의 컴퓨터에만 저장한다.
 *
 * 웹사이트인 firework 는 그 셋 중 어느 것도 갖고 있지 않다. 그래서 같은 결과를
 * 다른 방법으로 얻는다.
 *
 *  - 신원 확인: OAuth 로 받은 액세스 토큰으로 서버가 직접 /users/me 를 부른다.
 *    사용자가 적어낸 사용자명을 믿지 않는다는 점이 핵심이다.
 *  - 발송: 사용자가 자기 계정에서 만든 개인 Incoming Webhook 주소를 등록받는다.
 *
 * 두 번째가 확장 프로그램과 갈리는 지점이다. 웹훅 주소를 우리 서버에 저장하는 순간
 * 보관 책임이 생기므로 봉해서 저장하고(secret-box), 연결 해제 시 지우고,
 * 연속 실패 시 스스로 멈춘다.
 */

export class MattermostError extends Error {}

export type MattermostIdentity = {
  id: string;
  username: string;
  email: string | null;
};

const TIMEOUT_MS = 8_000;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 액세스 토큰이 가리키는 사람이 누구인지 서버에 물어본다.
 * 이 응답의 id 가 "이 계정이 확인됐다" 의 근거이고, 그 밖의 것은 표시용이다.
 */
export async function fetchIdentity(accessToken: string): Promise<MattermostIdentity> {
  const base = serverEnv().MATTERMOST_URL;
  if (!base) throw new MattermostError("Mattermost 연동이 설정되지 않았습니다.");

  const res = await withTimeout((signal) =>
    fetch(new URL("/api/v4/users/me", base), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    }),
  );

  if (!res.ok) throw new MattermostError("Mattermost 계정 정보를 가져오지 못했습니다.");

  const data = (await res.json()) as { id?: string; username?: string; email?: string };
  if (!data.id || !data.username) throw new MattermostError("Mattermost 응답을 이해하지 못했습니다.");

  return { id: data.id, username: data.username, email: data.email ?? null };
}

/**
 * 등록받은 웹훅 주소가 우리가 아는 Mattermost 서버의 웹훅 경로인지 확인한다.
 *
 * 이 검사가 없으면 임의의 주소를 등록해 우리 서버가 그쪽으로 POST 를 날리게 만들 수
 * 있다. 내부망 주소를 넣으면 그대로 SSRF 다. 그래서 호스트를 MATTERMOST_URL 로
 * 못박고 경로도 /hooks/ 로 제한한다.
 */
export function parseWebhookUrl(raw: string): URL {
  const base = serverEnv().MATTERMOST_URL;
  if (!base) throw new MattermostError("Mattermost 연동이 설정되지 않았습니다.");

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new MattermostError("웹훅 주소 형식이 아닙니다.");
  }

  const expected = new URL(base);
  if (url.protocol !== "https:" && expected.protocol === "https:") {
    throw new MattermostError("https 주소만 등록할 수 있습니다.");
  }
  if (url.host !== expected.host) {
    throw new MattermostError(`${expected.host} 의 웹훅 주소만 등록할 수 있습니다.`);
  }
  if (!url.pathname.startsWith("/hooks/") || url.pathname.length <= "/hooks/".length) {
    throw new MattermostError("Incoming Webhook 주소가 아닙니다. /hooks/ 로 시작해야 합니다.");
  }

  return url;
}

/**
 * 웹훅으로 한 통 보낸다.
 *
 * channel 을 `@사용자명` 으로 주면 그 사람에게 개인 메시지로 간다. 출석 체크 앱이
 * 쓰는 방식과 같다. 수신 대상이 비어 있으면 보내지 않는다 — 대상 없이 보내면
 * 웹훅 소유자의 기본 채널로 흘러가 엉뚱한 사람에게 쌓인다.
 */
export async function sendWebhookMessage({
  webhookUrl,
  username,
  text,
}: {
  webhookUrl: string;
  username: string;
  text: string;
}): Promise<void> {
  if (!username.trim()) throw new MattermostError("수신 대상이 없습니다.");

  const url = parseWebhookUrl(webhookUrl);
  const res = await withTimeout((signal) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: `@${username}`, text }),
      signal,
    }),
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new MattermostError(`발송 실패 (${res.status}) ${detail.slice(0, 200)}`.trim());
  }
}

/**
 * 메시지 본문.
 *
 * **본문에 민감한 내용을 넣지 않는다.** 버그 제보에는 재현 경로와 계정 상태가 섞이기
 * 쉽고, 설문 응답은 애초에 익명이다. 무슨 일이 있었는지와 확인할 링크만 보내고,
 * 내용은 사이트에서 권한을 확인한 뒤 보여준다.
 */
export function formatMessage({
  title,
  body,
  url,
}: {
  title: string;
  body?: string | null;
  url?: string | null;
}): string {
  const lines = [`**${title}**`];
  if (body) lines.push(body);
  if (url) lines.push(url);
  lines.push("_알림을 끄려면 firework 의 해당 프로젝트에서 알림 버튼을 눌러주세요._");
  return lines.join("\n\n");
}

/** 사이트 링크를 절대 주소로 만든다. 채팅에서는 상대 경로가 눌리지 않는다. */
export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  try {
    return new URL(path, serverEnv().BETTER_AUTH_URL).toString();
  } catch {
    return null;
  }
}
