"use client";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { weeklyAchievement } from "@/lib/achievement";
import { useRoutines, useRuns } from "@/lib/data";

import { EmptyState } from "@/components/EmptyState/EmptyState";

import card from "../../(home)/components/card.module.css";
import styles from "./RecordsSection.module.css";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 수행 기록 — `RoutineRun[]` + `weeklyAchievement()`(Q10).
 *
 * 루틴·기록 두 저장소를 함께 읽는다: 달성률 계산에 `routines`(예정 단계 수)가
 * 필요하고, 각 기록에 루틴 이름을 붙이려면 `routineId` 로 찾아야 한다.
 */
export function RecordsSection() {
  const {
    ready: routinesReady,
    value: routines,
    error: routinesError,
    errorMessage: routinesErrorMessage,
    retry: retryRoutines,
  } = useRoutines();
  const {
    ready: runsReady,
    value: runs,
    error: runsError,
    errorMessage: runsErrorMessage,
    retry: retryRuns,
  } = useRuns();

  const ready = routinesReady && runsReady;
  const error = routinesError || runsError;
  // 둘 다 실패할 수도 있다 — 먼저 있는 쪽(routines)의 메시지를 우선한다.
  const errorMessage = routinesErrorMessage ?? runsErrorMessage;
  const retry = () => {
    retryRoutines();
    retryRuns();
  };

  if (!ready) return <DataState loading label="기록" />;
  if (error)
    return (
      <DataState error onRetry={retry} label="기록" message={errorMessage} />
    );

  /*
   * ⚠️ 루틴이 0이어도 기록이 있으면 기록을 보여준다(재검토 N3) —
   * 세트 삭제로 루틴만 지워도 수행 기록은 서버에 남는데, 여기서 숨기면
   * 같은 화면의 WeekStrip 체크와 모순된다("기록 없음" vs "완료 체크").
   */
  if (routines.length === 0 && runs.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="아직 기록이 없어요"
        text="루틴을 만들고 수행하면 여기에서 기록과 달성률을 볼 수 있어요."
        ctaHref="/routine/new"
        ctaLabel="루틴 만들기"
      />
    );
  }

  // 기록 0개를 0%로 보여주면 실패처럼 보인다 — "아직 안 함"과 "0%"는 다르다.
  if (runs.length === 0) {
    return (
      /*
       * 주소가 이미 #routines 면 라우터가 같은 URL 로 보고 움직이지 않는다(r4 m34) —
       * CTA 클릭을 여기서 받아 직접 스크롤한다. EmptyState 는 공용이라 손대지 않는다.
       */
      <div
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a"))
            document.getElementById("routines")?.scrollIntoView();
        }}
      >
        <EmptyState
          icon="play_circle"
          title="첫 루틴을 시작해 보세요"
          text="루틴을 수행하고 나면 여기에서 기록과 달성률을 볼 수 있어요."
          /* 기록이 루틴 탭으로 오면서 "/routine" 이 자기 페이지가 됐다(Step 6).
             목록은 이 위에 있으므로 앵커로 올려 보낸다. */
          ctaHref="/routine#routines"
          ctaLabel="루틴 보러 가기"
        />
      </div>
    );
  }

  const achievement = weeklyAchievement(runs, routines);
  // listRuns() 는 오래된 것부터 저장돼 있다 — 최근 수행이 먼저 보이게 뒤집는다.
  const recent = [...runs].sort(
    (a, b) =>
      new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
  );

  return (
    <div className={styles.wrap}>
      <div className={`${card.card} ${styles.achievement}`}>
        <div>
          <p className={`${card.label} ${styles.achievementLabel}`}>
            이번 주 달성률
          </p>
          <p className={styles.achievementValue}>
            {achievement.percent === null
              ? "계산할 수 없음"
              : `${achievement.percent}%`}
          </p>
        </div>

        <p className={`${card.label} ${styles.delta}`}>
          {/* delta === null 은 "지난주 기록 없음"이지 "변화 없음(0)"이 아니다 */}
          {achievement.delta === null ? (
            "지난주 기록 없음"
          ) : (
            <>
              <Icon
                name={achievement.delta >= 0 ? "trending_up" : "trending_down"}
                size="sm"
              />
              지난주 대비 {achievement.delta > 0 ? "+" : ""}
              {achievement.delta}%p
            </>
          )}
        </p>
      </div>

      <ul className={styles.list}>
        {recent.map((run) => {
          const routine = routines.find((item) => item.id === run.routineId);
          const finished = new Date(run.finishedAt);
          const validDate = !Number.isNaN(finished.getTime());

          return (
            <li key={run.id} className={`${card.card} ${styles.entry}`}>
              <span className={styles.entryIcon}>
                <Icon name="task_alt" filled />
              </span>
              <div className={styles.entryBody}>
                {/*
                  루틴을 다시 만들면 id 가 바뀌어 못 찾을 수 있다. 기록을 숨기면
                  달성률과 어긋나 보이므로 "삭제된 루틴"으로 남긴다.
                */}
                <p className={styles.entryName}>
                  {routine?.name ?? "삭제된 루틴"}
                </p>
                <p className={`${card.label} ${styles.entryMeta}`}>
                  {validDate ? dateFormatter.format(finished) : "날짜 미상"} ·{" "}
                  {run.completedStepIds.length}단계 완료
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
