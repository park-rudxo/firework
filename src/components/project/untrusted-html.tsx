/**
 * 신뢰 불가 HTML 을 그리는 유일한 통로.
 *
 * 여기로 들어오는 html 은 반드시 lib/sanitize.ts 의 sanitizeHtml 또는
 * renderMarkdown 을 통과한 것이어야 한다. 원본을 그대로 넘기면 안 된다.
 */
export function UntrustedHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose-untrusted text-sm leading-relaxed ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
