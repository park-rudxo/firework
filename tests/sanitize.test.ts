import { describe, expect, it } from "vitest";

import { renderMarkdown, sanitizeHtml } from "@/lib/sanitize";

/**
 * 이 서비스가 화면에 얹는 HTML 은 상당수가 남의 GitHub 저장소 README 다.
 * 신뢰 불가 입력이므로, 위험한 것이 실제로 걷히는지 못박아 둔다.
 */
describe("HTML 새니타이즈", () => {
  it("script 를 제거한다", async () => {
    const out = await sanitizeHtml('<p>안녕</p><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/안녕/);
  });

  it("인라인 이벤트 핸들러를 제거한다", async () => {
    const out = await sanitizeHtml('<img src="https://x.test/a.png" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
  });

  it("javascript: 링크를 제거한다", async () => {
    const out = await sanitizeHtml('<a href="javascript:alert(1)">클릭</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("data: 링크를 제거한다", async () => {
    const out = await sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">클릭</a>');
    expect(out).not.toMatch(/data:text\/html/i);
  });

  it("iframe·object·embed 를 제거한다", async () => {
    const out = await sanitizeHtml(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="y">',
    );
    expect(out).not.toMatch(/<iframe|<object|<embed/i);
  });

  it("style 태그를 제거한다 — 페이지 레이아웃을 덮어쓰지 못하게", async () => {
    const out = await sanitizeHtml("<style>body{display:none}</style><p>본문</p>");
    expect(out).not.toMatch(/<style/i);
    expect(out).toMatch(/본문/);
  });

  it("form 을 제거한다 — 자격증명 입력을 유도하지 못하게", async () => {
    const out = await sanitizeHtml(
      '<form action="https://evil.test"><input name="password" type="password"></form>',
    );
    // form 이 사라지므로 어디로도 전송할 수 없다.
    expect(out).not.toMatch(/<form/i);
    // input 자체는 GitHub 식 체크리스트를 위해 남지만, 스키마가 disabled 인
    // 체크박스로 강제한다. 비밀번호 입력창으로는 쓸 수 없다.
    expect(out).not.toMatch(/type="password"/i);
    if (/<input/i.test(out)) {
      expect(out).toMatch(/type="checkbox"/i);
      expect(out).toMatch(/disabled/i);
    }
  });

  it("정상 마크업은 남긴다", async () => {
    const out = await sanitizeHtml(
      '<h2>제목</h2><p><strong>굵게</strong> <code>코드</code></p><ul><li>항목</li></ul>',
    );
    expect(out).toMatch(/<h2>제목<\/h2>/);
    expect(out).toMatch(/<strong>굵게<\/strong>/);
    expect(out).toMatch(/<code>코드<\/code>/);
    expect(out).toMatch(/<li>항목<\/li>/);
  });

  it("외부 링크에 noopener·noreferrer·nofollow 를 강제한다", async () => {
    const out = await sanitizeHtml('<a href="https://example.test">링크</a>');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it("링크가 심어둔 rel·target 을 덮어쓴다", async () => {
    // rel 을 비워 opener 를 살리려는 시도를 막는다.
    const out = await sanitizeHtml('<a href="https://example.test" rel="" target="_self">링크</a>');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).not.toMatch(/target="_self"/);
  });
});

describe("마크다운 렌더", () => {
  it("마크다운 안의 원시 HTML 도 정화한다", async () => {
    const out = await renderMarkdown("정상 문단\n\n<script>alert(1)</script>");
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/정상 문단/);
  });

  it("마크다운 링크에도 rel 을 강제한다", async () => {
    const out = await renderMarkdown("[링크](https://example.test)");
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
  });

  it("javascript: 마크다운 링크를 막는다", async () => {
    const out = await renderMarkdown("[클릭](javascript:alert(1))");
    expect(out).not.toMatch(/javascript:/i);
  });

  it("GFM 표와 체크박스를 렌더한다", async () => {
    const out = await renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(out).toMatch(/<table>/);
  });
});
