/**
 * 익명 사용자 ID 발급 — Next 16 의 `proxy` 파일 규칙.
 *
 * ⚠️ 예전 이름은 `middleware.ts` 였다. **Next 16 에서 deprecated 되고 `proxy.ts` 로 바뀌었다**
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`).
 * 기능은 같고 파일명·export 이름만 달라졌다.
 *
 * 하는 일은 하나뿐이다: 쿠키가 없거나 형식이 틀리면 익명 ID 를 발급하고, 그 값을 요청 헤더로 실어 보낸다.
 * DB 는 건드리지 않는다 — 여기서 쿼리하면 **모든 요청에 왕복이 하나 붙는다.**
 * `users` 행은 실제로 쓰기가 일어나는 Route Handler 가 지연 생성한다(`anonUser.ts` 참조).
 */

import { NextResponse, type NextRequest } from "next/server";

import { ANON_COOKIE, ANON_HEADER } from "@/lib/auth/anonUser";

/** 1년. 쿠키를 지우면 다른 사용자가 되므로(복구 수단은 로그인이 있어야 성립) 넉넉히 잡는다. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * `crypto.randomUUID()` 가 내는 모양(소문자 8-4-4-4-12)만 받는다(3라운드 m2).
 * 예전엔 쿠키 값을 그대로 믿어서 빈 값은 재발급 없이 모든 API 가 영구 503,
 * 37자↑는 `users.id CHAR(36)` 초과로 쓰기 503, `a` 같은 값은 그대로 `users` 에 들어갔다.
 */
const ANON_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(ANON_COOKIE)?.value;
  const id =
    existing && ANON_ID.test(existing) ? existing : crypto.randomUUID();

  /*
   * 쿠키만 세팅하면 **이번 요청**의 Route Handler 는 값을 못 본다
   * (브라우저는 다음 요청부터 실어 보낸다). 첫 방문에도 바로 동작해야 하므로 헤더로 넘긴다.
   *
   * ⭐ `set` 이라 클라이언트가 같은 헤더를 직접 보내도 **덮어쓴다** — 사칭 방지의 핵심이다.
   *   `append` 로 바꾸면 위조가 뚫린다.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ANON_HEADER, id);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  /*
   * ⚠️ `secure` 를 NODE_ENV 로 정하면 안 된다.
   *
   * 프로덕션 빌드를 **TLS 없이** 올리는 순간(해커톤 서버에 흔하다) 브라우저가 Secure 쿠키를
   * 버린다. 그러면 요청마다 새 ID 가 발급돼 **"저장은 되는데 새로고침하면 사라진다"** 가 되고,
   * `users` 테이블에는 1회성 행이 무한히 쌓인다. 원인을 찾기 어려운 증상이다.
   *
   * 그래서 **실제 요청 프로토콜**로 정한다. HTTPS 로 서비스하면 자동으로 켜진다.
   * (리버스 프록시 뒤에서는 `x-forwarded-proto` 를 봐야 한다 — 프록시가 붙을 예정이다.)
   */
  const isHttps =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  /*
   * **유효한 쿠키도 매 요청 다시 굽는다**(4라운드 m39) — 만료를 오늘부터 1년으로 민다.
   * 안 구우면 첫 방문 1년 뒤 매일 쓰던 사용자도 새 ID 를 받아 선반·루틴·기록이 통째로 사라진다.
   * 없거나 형식이 틀렸으면 새 ID 로 덮는다(안 덮으면 다음 요청이 또 틀린 값을 보낸다).
   */
  response.cookies.set({
    name: ANON_COOKIE,
    value: id,
    // JS 로 못 읽는다 — XSS 가 나도 ID 를 훔쳐 갈 수 없다.
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    // ponytail: HTTPS 서브도메인이 확정되면 쿠키 이름에 `__Host-` 접두사를 붙인다.
    //           형제 서브도메인이 Domain 속성으로 세션을 고정하는 경로가 막힌다.
    //           지금 붙이면 Secure 가 강제라 http 로컬·http 배포에서 동작하지 않는다.
  });

  return response;
}

/**
 * ⚠️ **matcher 가 없으면 정적 파일까지 전부 탄다**(`_next/static`, 이미지, `public/`).
 * 반대로 너무 좁히면 그 경로에서 `ANON_HEADER` 위조가 가능해지므로,
 * **사용자 데이터를 읽는 경로는 반드시 포함**되어야 한다.
 * 아래는 정적 자산만 빼고 나머지를 전부 덮는 형태다.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)",
  ],
};
