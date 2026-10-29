import type { MetadataRoute } from "next";

/**
 * PWA manifest(`/manifest.webmanifest`) — 하루 두 번 세면대 앞에서 여는 앱인데 진입점이
 * 브라우저 주소창뿐이었다(3라운드 I2). 홈 화면에 추가하면 주소창 없이 앱처럼 뜬다.
 * `<link rel="manifest">` 는 Next 가 이 파일을 보고 자동으로 넣는다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "유틴",
    short_name: "유틴",
    description: "나만의 스킨케어 루틴, 유틴(youtine)",
    start_url: "/",
    display: "standalone",
    // 라이트 `--surface` — layout.tsx 의 SURFACE.light 와 같은 값(스플래시·상태바).
    background_color: "#f8f9fa",
    theme_color: "#f8f9fa",
    // 파일 컨벤션 아이콘(src/app/icon.svg)이 `/icon.svg` 로 서빙된다. SVG 라 크기 무관.
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
