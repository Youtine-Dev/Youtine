import type { Metadata } from "next";

import { TopAppBar } from "@/components/TopAppBar/TopAppBar";

import { RecordsSection } from "./components/RecordsSection";
import { RoutineList } from "./components/RoutineList";
import { WeekStrip } from "./components/WeekStrip";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "루틴",
};

// 주간 스트립이 "오늘"을 표시한다. 정적 프리렌더하면 빌드 시점 날짜가 박히므로
// 요청마다 렌더한다.
export const dynamic = "force-dynamic";

/**
 * 루틴 목록과 수행 기록.
 *
 * 기록은 예전에 프로필 탭에 있었다(Step 6 에서 옮겨 왔다). 루틴을 하고 나서
 * 얼마나 했는지 보는 곳이 다른 탭이면 흐름이 끊긴다 — 주간 스트립과도 같은 출처다.
 *
 * 저장소를 읽는 조각만 클라이언트다 — `"use client"` 를 페이지가 아니라
 * 한 단계 아래 leaf 에 둔다.
 */
export default function RoutinePage() {
  return (
    <>
      <TopAppBar title="루틴" />

      <main id="main" className={styles.main}>
        <WeekStrip />
        <RoutineList />

        {/* id 는 수행 완료 화면(`RoutineDone`)의 "기록 보기"가 가리키는 앵커다. */}
        <section id="records">
          <h2 className={styles.sectionTitle}>기록</h2>
          <div className={styles.sectionBody}>
            <RecordsSection />
          </div>
        </section>
      </main>
    </>
  );
}
