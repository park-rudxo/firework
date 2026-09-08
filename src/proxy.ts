import { NextResponse, type NextRequest } from "next/server";

/**
 * 지금 어느 경로를 그리는 중인지 레이아웃에 알려준다.
 *
 * 레이아웃은 경로를 알 방법이 없다(page 와 달리 params·searchParams 를 받지 않는다).
 * 그런데 닉네임 게이트는 "닉네임 정하는 화면 자신"만 빼고 전부 막아야 해서
 * 경로를 알아야 한다. 그래서 요청 헤더에 한 줄 얹어준다.
 *
 * 여기서 리다이렉트까지 하지는 않는다. Next 문서가 프록시를 인증·인가의 자리로
 * 쓰지 말라고 못박고 있고(세션을 읽으려면 DB 를 쳐야 한다), 무엇보다 Server Action 은
 * 프록시를 우회할 수 있다. 실제 방어는 lib/session.ts 의 requireNamedViewer 다.
 *
 * Next 16 부터 middleware.ts 가 proxy.ts 로 바뀌었다 — 이름만 바뀌고 동작은 같다.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // 클라이언트가 직접 넣어 보낼 수도 있으므로 항상 덮어쓴다.
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // 정적 파일과 라우트 핸들러는 레이아웃을 거치지 않으므로 뺀다.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
