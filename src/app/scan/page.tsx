import type { Metadata } from "next";

import { TopAppBar } from "@/components/TopAppBar/TopAppBar";

import { ReportSection } from "./components/ReportSection";
import { ScanTabs, toScanTab } from "./components/ScanTabs";
import { ScanWorkspace } from "./components/ScanWorkspace";
import { ShelfSection } from "./components/ShelfSection";
import styles from "./page.module.css";

export const metadata: Metadata = {
  // 탭 하나의 이름("내 선반")이 페이지 전체 제목이면 어긋난다. 탭별 제목은 두지 않는다 —
  // `generateMetadata` 가 searchParams 를 읽어야 하는데, 제목이 탭 바 바로 위라 중복이다.
  title: "스캔",
};

/**
 * 제품 등록과 그 결과를 한 탭에 두고, 상단 하위 탭으로 나눈다.
 *
 * 탭 상태는 **URL 에만 산다**(`/scan?tab=`). 클라이언트 state 로 이중 보관하면 둘이
 * 어긋나는 경로가 영구히 남는다 — URL 만 바뀌고 화면은 그대로인 무반응 버그가 되는데,
 * 에러도 타입 실패도 나지 않는다.
 *
 * ⛔ **패널을 조건부 렌더하지 마라.** `{active === "shelf" && <ShelfSection />}` 로
 *    "정리"하면 등록 폼의 입력·진행 중 AI 검색(18~37초)·prefill 이 통째로 날아간다.
 *    `hidden` 으로 감추면 트리 모양이 유지돼 전부 살아남는다. App Router 는 검색
 *    파라미터만 바뀌는 이동에서 컴포넌트를 리마운트하지 않기 때문에 성립한다.
 *
 * ⛔ **패널 래퍼에 CSS 클래스를 붙이지 마라.** 클래스가 `display` 를 선언하는 순간
 *    작성자 스타일이 브라우저 기본 `[hidden] { display: none }` 를 이겨 **숨김이 통째로
 *    무효가 된다**(네 패널이 세로로 쌓인다). 타입·린트·빌드는 전부 통과한다.
 *    같은 이유로 `transform`·`filter`·`contain` 도 금지다 — 새 containing block 이 생겨
 *    `position: fixed` 인 등록 모달·카메라가 패널 안에 갇힌다.
 */
export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const { tab, name, brand } = await searchParams;
  const active = toScanTab(tab);

  return (
    <>
      {/* 다른 탭(홈·고민·루틴)과 같은 상단바 — 인사말·설정 진입점을 스캔에서도 제공한다. */}
      <TopAppBar title="스캔" />

      {/*
        Next 는 내비게이션 후 스크롤 대상 요소에 focus() 를 부른다. tabIndex 가 없으면
        그 호출이 no-op 이라, 패널 안 버튼으로 탭을 바꿨을 때 그 버튼이 hidden 이 되며
        포커스가 body 로 튄다(키보드·스크린리더 사용자가 페이지 맨 위로 되돌아간다).
      */}
      <main id="main" className={styles.main} tabIndex={-1}>
        <ScanTabs active={active} />

        {/* name·brand 는 `labelCaptureHref`(성분표 촬영하기, m21)가 만든다. 배열·누락은 빈 값. */}
        <ScanWorkspace
          active={active}
          labelName={typeof name === "string" ? name.trim() : ""}
          labelBrand={typeof brand === "string" ? brand.trim() : ""}
        />

        <section hidden={active !== "shelf"}>
          <h2 className={styles.sectionTitle}>내 선반</h2>
          <div className={styles.sectionBody}>
            <ShelfSection active={active === "shelf"} />
          </div>
        </section>

        {/* 리포트는 데이터에 따라 배지·부제가 바뀌어 제목까지 컴포넌트가 갖는다. */}
        <section hidden={active !== "report"}>
          <ReportSection active={active === "report"} />
        </section>
      </main>
    </>
  );
}
