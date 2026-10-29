"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "@/components/Icon";
import { useRuns } from "@/lib/data";
import { isSameLocalDay } from "@/lib/storage/history";
import type { RoutineRun } from "@/types/skincare";

import styles from "./WeekStrip.module.css";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * "아직 안 온 날"(`upcoming`)과 "지났지만 안 한 날"(`missed`)은 모양을 나눈다(m32) —
 * 예전엔 같은 흐린 스타일이라 사용자가 날짜로만 구분해야 했고 대비도 2.5 였다.
 */
type Day = {
  date: number;
  state: "done" | "today" | "missed" | "upcoming";
  /** 요일 라벨 강조용. **완료 여부와 무관하다** — 오늘 루틴을 마쳐도 오늘은 오늘이다. */
  isToday: boolean;
};

/**
 * 이번 주 월요일부터 7일.
 *
 * ⚠️ **완료는 실제 수행 기록에서만 나온다.**
 * 예전에는 "오늘 이전은 완료로 본다"는 임시 규칙이었는데(백엔드가 없던 시절),
 * 그 결과 **아무것도 안 한 사용자에게도 지난 요일이 전부 체크로 보였다**(2026-08-18 실측).
 * 근거 없는 진행률을 지어내지 않는다는 원칙(Q10)을 정면으로 위배하는 자리였다.
 *
 * 주 프레임은 **기기 로컬 시간대** 기준이다 — 완료 판정(isSameLocalDay)과
 * RoutineList 의 "오늘 완료"가 로컬로 비교하므로, 여기만 Asia/Seoul 로
 * 고정하면 해외 기기에서 체크가 다른 요일에 찍혔다(리뷰 m14).
 */
function buildWeek(runs: readonly RoutineRun[], today: Date): Day[] {
  // getDay()는 일요일이 0이라 월요일 시작으로 보정한다
  const offsetToMonday = (today.getDay() + 6) % 7;

  return DAY_LABELS.map((_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offsetToMonday + index,
    );

    const done = runs.some((run) => isSameLocalDay(run.finishedAt, date));
    const isToday = index === offsetToMonday;

    return {
      date: date.getDate(),
      state: done
        ? "done"
        : isToday
          ? "today"
          : index < offsetToMonday
            ? "missed"
            : "upcoming",
      isToday,
    };
  });
}

/*
 * '오늘'은 기기에서만 계산한다(m15). "use client" 여도 서버 렌더가 돌고, 서버(컨테이너
 * TZ=UTC)에서 계산하면 한국 00~09시엔 하루 전 날짜가 그려져 하이드레이션이 어긋났다.
 * 서버 스냅샷은 null(중립 상태), 기기 스냅샷은 오늘 0시의 epoch ms — 같은 날이면
 * 같은 숫자라 다시 그리지 않는다.
 */
const subscribeNone = () => () => {};
const getToday = () => new Date().setHours(0, 0, 0, 0);
const getServerToday = () => null;

export function WeekStrip() {
  /*
   * 기록을 못 불러와도 스트립은 그린다 — 날짜는 기록과 무관하게 맞고, 부가 정보 하나 때문에
   * 화면에 에러 카드를 하나 더 띄울 이유가 없다. 완료 표시만 비어 있게 된다.
   * (연결 실패는 같은 화면의 루틴 목록이 이미 알린다.)
   */
  const { value: runs } = useRuns();
  const today = useSyncExternalStore(subscribeNone, getToday, getServerToday);
  const week = today === null ? null : buildWeek(runs, new Date(today));

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>이번 주 진행 상황</h2>

      <ol className={styles.days}>
        {DAY_LABELS.map((label, index) => {
          const day = week?.[index];
          return (
            <li key={label} className={styles.day}>
              <span
                className={`${styles.label} ${day?.isToday ? styles.labelToday : ""}`}
              >
                {label}
              </span>
              {/* 날짜를 모르는 첫 렌더는 빈 칸으로 자리만 잡는다 */}
              <span
                className={`${styles.marker} ${day ? styles[day.state] : ""}`}
              >
                {day?.state === "done" ? (
                  <Icon name="check" size="sm" />
                ) : (
                  day?.date
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
