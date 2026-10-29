import type { NextConfig } from "next";

/**
 * 백엔드 프록시 대상 (예: http://localhost:8080 또는 https://api.example.com)
 * .env.local 에 BACKEND_ORIGIN 을 지정하면 /api/* 요청이 그쪽으로 전달됩니다.
 * 지정하지 않으면 프록시를 사용하지 않습니다.
 */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN;

/**
 * 모든 응답에 붙는 기본 보안 헤더.
 * CSP(Content-Security-Policy)는 잘못 설정하면 화면이 깨지기 쉬워 기본값에서 제외했습니다.
 * 배포 전에 https://nextjs.org/docs/app/guides/content-security-policy 를 참고해 추가하세요.
 */
const securityHeaders = [
  // MIME 타입 스니핑 차단
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 외부 사이트로 나갈 때 경로/쿼리는 빼고 origin 만 전달
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 클릭재킹 방지 (다른 사이트가 우리 페이지를 iframe 으로 못 감쌈)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // 쓰지 않는 브라우저 기능은 기본 차단.
  // camera 는 같은 오리진(self)에만 허용 — OCR 화면이 getUserMedia 를 쓴다.
  // `camera=()` 로 두면 사용자가 권한을 허용해도 NotAllowedError 가 난다.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Docker 배포용 — 빌드가 .next/standalone 에 자립 서버(server.js + 필요한
  // node_modules 만)를 추적 복사한다. Dockerfile runner 가 이것만 담아
  // 런타임 npm ci 없이 `node server.js` 로 뜬다.
  output: "standalone",

  // 응답에서 `X-Powered-By: Next.js` 제거 (불필요한 버전 노출 차단)
  poweredByHeader: false,

  // <Link href="..."> 의 경로를 타입으로 검사 (오타 난 링크를 빌드 타임에 잡아줌)
  typedRoutes: true,

  images: {
    /*
     * ⛔ 이미지 최적화 API(`/_next/image`)를 **끈다**(3라운드 M1).
     * 앱의 `<Image>` 는 전부 `unoptimized`(data URL·외부 썸네일을 그대로 띄움)라 최적화를
     * 쓰지 않는데, 엔드포인트는 열려 있어 RCE·SSRF 권고(GHSA-2xp9-vwfh-vxw4,
     * GHSA-cjq9-62q9-8jv4)의 공격면만 남아 있었다. 이 값이면 `/_next/image` 가 404 다.
     */
    unoptimized: true,
    remotePatterns: [
      /*
       * 화해 CDN — 후보 검색이 주는 제품 썸네일(`/api/ai/search`).
       * **후보를 고르는 동안만** 이 주소를 직접 띄운다. 선반에 담을 때는 서버가 한 번 받아
       * data URL 로 바꿔 저장하므로(`src/lib/images.ts`), 담긴 뒤에는 외부 요청이 없다.
       */
      { protocol: "https", hostname: "img.hwahae.co.kr" },
    ],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      /*
       * ⛔ `/api/*` 는 **전부 사용자별 데이터**다(쿠키 익명 ID 로 가른다).
       *
       * Next 16 의 Route Handler 는 dynamic 이라 Next 자체 캐시는 안 타지만,
       * **응답에 `Cache-Control` 을 아무것도 붙이지 않는다.** 앞단에 리버스 프록시나 CDN 이
       * 붙는 순간(서브도메인 작업이 예정돼 있다) 기본 TTL·heuristic freshness 로
       * `/api/products` 응답 하나가 URL 만으로 캐시되고, 쿠키가 다른 사람에게 그대로 나간다.
       *
       * `private` 로 공유 캐시 저장을 막고 `no-store` 로 저장 자체를 금지한다.
       * `Vary: Cookie` 는 캐시가 굳이 저장할 때 사용자별로 갈리게 하는 마지막 보루다.
       */
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Vary", value: "Cookie" },
        ],
      },
    ];
  },

  /*
   * 프로필 → 내 고민 재배치(2026-08-19). 옛 주소를 북마크했거나 열어 둔 사용자가
   * 404 를 보지 않게 넘겨 준다. **permanent 로 하지 않는다** — 구조가 또 바뀔 수 있는데
   * 301 은 브라우저가 캐시해 되돌리기 어렵다.
   */
  async redirects() {
    return [{ source: "/profile", destination: "/concern", permanent: false }];
  },

  async rewrites() {
    if (!BACKEND_ORIGIN) return [];

    // 주의: 이 rewrite 는 파일 기반 라우트(src/app/api/**)보다 **나중에** 평가됩니다.
    // 즉 src/app/api/xxx/route.ts 가 있으면 그쪽이 우선이고, 없을 때만 백엔드로 넘어갑니다.
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
