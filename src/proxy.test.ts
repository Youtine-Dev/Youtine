import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { ANON_COOKIE, ANON_HEADER } from "@/lib/auth/anonUser";
import { proxy } from "@/proxy";

const VALID = "3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function run(cookie?: string) {
  const request = new NextRequest("http://localhost/api/products", {
    headers: cookie === undefined ? {} : { cookie: `${ANON_COOKIE}=${cookie}` },
  });
  const response = proxy(request);
  return {
    // NextResponse.next({ request: { headers } }) 가 Route Handler 로 넘기는 헤더
    forwarded: response.headers.get(`x-middleware-request-${ANON_HEADER}`),
    setCookie: response.cookies.get(ANON_COOKIE)?.value,
  };
}

describe("proxy — 익명 ID 쿠키", () => {
  it("유효한 쿠키는 그대로 쓰고 다시 굽지 않는다", () => {
    const { forwarded, setCookie } = run(VALID);
    expect(forwarded).toBe(VALID);
    expect(setCookie).toBeUndefined();
  });

  it("쿠키가 없으면 새로 발급해 헤더와 쿠키에 같은 값을 싣는다", () => {
    const { forwarded, setCookie } = run();
    expect(forwarded).toMatch(UUID);
    expect(setCookie).toBe(forwarded);
  });

  // 3라운드 m2 재현 입력 — 빈 값(영구 503), 37자(CHAR(36) 초과), 비-UUID, 대문자
  it.each(["", `${VALID}0`, "a", VALID.toUpperCase()])(
    "형식이 틀린 쿠키 %j 는 새 ID 로 교체한다",
    (bad) => {
      const { forwarded, setCookie } = run(bad);
      expect(forwarded).toMatch(UUID);
      expect(forwarded).not.toBe(bad);
      expect(setCookie).toBe(forwarded);
    },
  );
});
