import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Schema } from "hast-util-sanitize";

/**
 * 이 서비스가 화면에 얹는 HTML 은 대부분 우리가 쓰지 않았다.
 * 남의 GitHub 저장소 README 와, 사용자가 직접 넣은 마크다운이다.
 * 둘 다 신뢰 불가 입력으로 취급하고 같은 파이프라인을 통과시킨다.
 */
const schema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // GitHub README 는 뱃지·앵커에 이 속성들을 쓴다. 링크는 아래에서 한 번 더 손본다.
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    img: [...(defaultSchema.attributes?.img ?? []), "loading", "width", "height", "align"],
    // 코드 하이라이팅 클래스 정도는 남긴다.
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^hljs-./]],
  },
  tagNames: (defaultSchema.tagNames ?? []).filter(
    // iframe/object/embed 는 CSP 로도 막지만 여기서 먼저 걷어낸다.
    (t) => !["iframe", "object", "embed", "script", "style"].includes(t),
  ),
  protocols: {
    ...defaultSchema.protocols,
    // javascript:, data: 로 시작하는 링크를 막는다.
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
};

/** 외부로 나가는 링크는 새 탭 + referrer/opener 차단 + nofollow 를 강제한다. */
function hardenLinks(html: string): string {
  return html.replace(/<a\s([^>]*?)>/gi, (match, attrs: string) => {
    if (!/href\s*=\s*["']https?:/i.test(attrs)) return match;
    const withoutRel = attrs.replace(/\s*(rel|target)\s*=\s*("[^"]*"|'[^']*')/gi, "");
    return `<a ${withoutRel.trim()} target="_blank" rel="noopener noreferrer nofollow">`;
  });
}

/** GitHub 이 이미 HTML 로 렌더해준 README 를 정화한다. */
export async function sanitizeHtml(dirty: string): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(dirty);
  return hardenLinks(String(file));
}

/** 사용자가 입력한 마크다운을 HTML 로 바꾸고 정화한다. */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(markdown);
  return hardenLinks(String(file));
}
