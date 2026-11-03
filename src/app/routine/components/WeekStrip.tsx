"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Icon } from "@/components/Icon";
import { useRuns } from "@/lib/data";
import { isSameLocalDay } from "@/lib/storage/history";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useModalFocus } from "@/lib/useModalFocus";
import type { RoutineRun } from "@/types/skincare";

import styles from "./WeekStrip.module.css";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * "아직 안 온 날"(`upcoming`)과 "지났지만 안 한 날"(`missed`)은 모양을 나눈다(m32) —
 * 예전엔 같은 흐린 스타일이라 사용자가 날짜로만 구분해야 했고 대비도 2.5 였다.
 */
type DayState = "done" | "today" | "missed" | "upcoming";

type Day = {
  date: number;
  state: DayState;
  /** 요일 라벨 강조용. **완료 여부와 무관하다** — 오늘 루틴을 마쳐도 오늘은 오늘이다. */
  isToday: boolean;
};

const STATE_LABEL: Record<DayState, string> = {
  done: "수행함",
  today: "오늘",
  missed: "수행 안 함",
  upcoming: "남은 날",
};

/**
 * 날짜 하나의 상태 — 주간 스트립과 월간 캘린더가 **같은 판정**을 쓴다
 * (두 화면이 같은 기록을 다르게 보여 주지 않게).
 *
 * ⚠️ **완료는 실제 수행 기록에서만 나온다.**
 * 예전에는 "오늘 이전은 완료로 본다"는 임시 규칙이었는데(백엔드가 없던 시절),
 * 그 결과 **아무것도 안 한 사용자에게도 지난 요일이 전부 체크로 보였다**(2026-08-18 실측).
 * 근거 없는 진행률을 지어내지 않는다는 원칙(Q10)을 정면으로 위배하는 자리였다.
 *
 * 날짜는 **기기 로컬 시간대** 기준이다 — 완료 판정(isSameLocalDay)과
 * RoutineList 의 "오늘 완료"가 로컬로 비교하므로, 여기만 Asia/Seoul 로
 * 고정하면 해외 기기에서 체크가 다른 요일에 찍혔다(리뷰 m14).
 * `date`·`today` 는 둘 다 로컬 0시라 대소 비교로 과거/미래를 가른다.
 */
function dayState(
  date: Date,
  today: Date,
  runs: readonly RoutineRun[],
): DayState {
  if (runs.some((run) => isSameLocalDay(run.finishedAt, date))) return "done";
  if (date.getTime() === today.getTime()) return "today";
  return date < today ? "missed" : "upcoming";
}

/** 이번 주 월요일부터 7일. */
function buildWeek(runs: readonly RoutineRun[], today: Date): Day[] {
  // getDay()는 일요일이 0이라 월요일 시작으로 보정한다
  const offsetToMonday = (today.getDay() + 6) % 7;

  return DAY_LABELS.map((_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offsetToMonday + index,
    );
    return {
      date: date.getDate(),
      state: dayState(date, today, runs),
      isToday: index === offsetToMonday,
    };
  });
}

/** 이번 달 1일~말일 + 1일 앞의 빈 칸 수(월요일 시작 — 주간 스트립과 같은 기준). */
function buildMonth(runs: readonly RoutineRun[], today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;

  const days: Day[] = Array.from({ length: lastDate }, (_, index) => {
    const date = new Date(year, month, index + 1);
    return {
      date: index + 1,
      state: dayState(date, today, runs),
      isToday: index + 1 === today.getDate(),
    };
  });
  return { leading, days };
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
  const { value: runs, ready: runsReady, error: runsError } = useRuns();
  const today = useSyncExternalStore(subscribeNone, getToday, getServerToday);
  const week = today === null ? null : buildWeek(runs, new Date(today));
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.heading}>이번 주 진행 상황</h2>
        <button
          type="button"
          className={styles.more}
          onClick={() => setCalendarOpen(true)}
          // 날짜를 모르는 첫 렌더(서버 스냅샷)에는 열 캘린더가 없다.
          // 기록이 없을 때(로딩 전·실패)도 막는다 — 빈 폴백으로 열면 "0일 수행"·"수행 안 함"을
          // 사실처럼 단정한다. 스트립은 체크가 비는 것으로 끝나지만 캘린더는 숫자로 말한다.
          disabled={today === null || !runsReady || runsError}
          aria-haspopup="dialog"
        >
          자세히 보기
          <Icon name="chevron_right" size="sm" />
        </button>
      </div>

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
              {/* 날짜를 모르는 첫 렌더는 빈 칸으로 자리만 잡는다.
                  체크 아이콘만으론 읽을 이름이 없어 상태를 라벨로 준다(r4 m31, 월간 캘린더와 같음). */}
              <span
                className={`${styles.marker} ${day ? styles[day.state] : ""}`}
                role={day ? "img" : undefined}
                aria-label={
                  day ? `${day.date}일 ${STATE_LABEL[day.state]}` : undefined
                }
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

      {calendarOpen && today !== null && (
        <MonthCalendarModal
          runs={runs}
          today={new Date(today)}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </section>
  );
}

/** 이번 달 진행 상황 — 날짜별 수행 여부를 주간 스트립과 같은 표시로 보여 준다. */
function MonthCalendarModal({
  runs,
  today,
  onClose,
}: {
  runs: readonly RoutineRun[];
  today: Date;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(dialogRef, closeRef);
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const month = today.getMonth() + 1;
  const { leading, days } = buildMonth(runs, today);
  const doneDays = days.filter((day) => day.state === "done").length;

  return (
    <div
      ref={dialogRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // 바깥(스크림)을 누르면 닫는다 — 되돌릴 수 없는 동작이 없는 보기 전용 모달이다.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet}>
        <div className={styles.sheetHead}>
          <h3 id={titleId} className={styles.sheetTitle}>
            {today.getFullYear()}년 {month}월
          </h3>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className={styles.summary}>
          이번 달 <strong>{doneDays}일</strong> 수행 · 오늘까지{" "}
          {today.getDate()}일
        </p>

        <div className={styles.weekdays} aria-hidden="true">
          {DAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <ol className={styles.month}>
          {Array.from({ length: leading }, (_, index) => (
            <li key={`blank-${index}`} aria-hidden="true" />
          ))}
          {days.map((day) => (
            <li key={day.date}>
              <span
                className={`${styles.marker} ${styles[day.state]}`}
                role="img"
                aria-label={`${month}월 ${day.date}일 ${STATE_LABEL[day.state]}`}
              >
                {day.state === "done" ? (
                  <Icon name="check" size="sm" />
                ) : (
                  day.date
                )}
              </span>
            </li>
          ))}
        </ol>

        <ul className={styles.legend} aria-hidden="true">
          {(["done", "today", "missed", "upcoming"] as const).map((state) => (
            <li key={state}>
              <span
                className={`${styles.marker} ${styles.legendMarker} ${styles[state]}`}
              />
              {STATE_LABEL[state]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
