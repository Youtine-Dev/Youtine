import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/AppShell/AppShell";

import "./globals.css";
import { MigrateLocalData } from "./MigrateLocalData";

// 서비스명 "유틴"(youtine) — 사용자 결정 2026-08-20. 아이콘은 src/app/icon.svg (파일 컨벤션).
const SITE_NAME = "유틴";
const SITE_DESCRIPTION =
  "제품 등록부터 AI 루틴 생성·수행 기록까지 — 나만의 스킨케어 루틴, 유틴(youtine)";

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    // 하위 페이지에서 title: "루틴" 이라고만 쓰면 "루틴 | 유틴" 이 됩니다.
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "ko_KR",
    type: "website",
  },
};

/** 각 스킴의 `--surface` — globals.css 의 라이트/다크 값과 반드시 같게 유지한다(manifest.ts 도). */
const SURFACE = { light: "#f8f9fa", dark: "#101415" } as const;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * 이게 없으면 브라우저가 safe area 를 노출하지 않아
   * `env(safe-area-inset-*)` 가 **전부 0** 이 된다.
   * BottomNav·StepActions 가 그 값을 쓰고 있었는데 여태 무효였다(iOS 홈 인디케이터에 겹침).
   */
  viewportFit: "cover",
  /*
   * ⛔ `themeColor` 는 **여기 두지 않는다**(3라운드 m13 검증).
   * Next 가 media 별 theme-color 메타를 관리하면, 수동 테마용으로 끼워 넣은 메타를 클라이언트
   * 내비게이션 때 React 가 자기 메타로 재사용해 덮어써 상태바가 OS 색으로 돌아갔다(실측).
   * theme-color 는 아래 부트스트랩이 만드는 **메타 하나**만 쓰고, 설정 모달이 그걸 갱신한다.
   */
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
          테마 부트스트랩 — 페인트 전에 data-theme 를 확정해 깜빡임(FOUC)을 막는다.
          우선순위: 저장된 선택(al:v1:theme — TopAppBar 설정 모달이 쓴다) > OS 설정.
          globals.css 의 다크 팔레트가 이 속성(:root[data-theme="dark"])에 반응한다.
          상태바 색(theme-color)도 같은 결정을 따른다 — 메타를 **하나만** 만들고(React 가 관리하지
          않는 요소라 내비게이션에도 남는다), 설정 모달(TopAppBar applyTheme)이 그 값을 갱신한다.
          값은 각 스킴의 `--surface` — globals.css·manifest.ts 와 반드시 같게 유지할 것.
          스크롤바·폼 컨트롤의 color-scheme 은 globals.css 가 data-theme 로 따라간다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=null;try{t=JSON.parse(localStorage.getItem("al:v1:theme"))}catch(e){}if(t!=="dark"&&t!=="light"){try{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}document.documentElement.dataset.theme=t;var m=document.createElement("meta");m.name="theme-color";m.content=t==="dark"?"${SURFACE.dark}":"${SURFACE.light}";document.head.appendChild(m)})()`,
          }}
        />

        {/*
          Pretendard (한글 웹폰트) — CDN 방식.
          폰트 파일을 public/fonts 에 넣고 next/font/local 로 바꾸면
          외부 요청이 사라지고 CLS(레이아웃 이동)도 줄어듭니다. README 참고.
          dynamic-subset: 유니코드 범위별 92조각 중 화면에 나온 글자의 조각만 받는다.
          통짜 파일은 2,057,688B 였다(3라운드 M16).
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />

        {/*
          Material Symbols — 아이콘. @/components/Icon 이 이 폰트를 쓴다.
          아이콘 폰트라 next/font/google 목록에 없어서 CDN으로 불러온다.
          display=block: swap 이면 폰트 로딩 동안 "notifications_active" 같은
          리거처 원문이 그대로 노출된다. 아이콘은 잠깐 비는 편이 낫다.
          축은 코드가 쓰는 값만 받는다(3라운드 M16 — 전 범위면 woff2 4,006,044B → 464,664B):
          FILL 0..1(Icon 의 filled) · wght 400(구글 클래스가 font-weight: normal 고정) ·
          GRAD 0 · opsz 24(기본 크기 24px. 16px 아이콘도 24 설계를 축소해 쓴다).
          새 축 값을 쓰려면 여기부터 넓힐 것 — 없는 축은 font-variation-settings 가 무시된다.
          ponytail: &icon_names= 서브셋(실측 약 10KB)은 안 걸었다 — 이름이 하나라도 빠지면
          아이콘 자리에 글자가 나온다. 쓰는 이름을 검사하는 장치가 생기면 그때 건다.
        */}
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font -- 위 주석 참고. no-page-custom-font 는 App Router 루트 레이아웃에는 해당하지 않는다 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
        />
      </head>
      <body>
        {/*
          저장소를 서버로 옮기기 전에 쓰던 사용자의 localStorage 데이터를 1회 이관한다.
          화면을 그리지 않으며, 옮길 데이터가 없으면 아무 일도 하지 않는다.
          어느 화면으로 들어와도 한 번은 실행되도록 루트에 둔다.
        */}
        <MigrateLocalData />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
