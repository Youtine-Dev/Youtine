/**
 * 주간 루틴 달성률 (Q10).
 *
 * `SkinHealthCard` 는 원래 "피부 건강 점수"였지만 **산출 근거가 없었다.**
 * 그래서 이름과 내용을 맞춰 **수행 기록에서 계산되는 달성률**로 바꿨다.
 *
 *   달성률 = 이번 주 완료 단계 수 ÷ 이번 주 예정 단계 수(경과 일수 기준) × 100
 *   주간 변화 = 이번 주 − 지난주 (%p, 지난주는 7일 전체가 분모)
 *   예정은 루틴이 **생긴 날부터** 센다(4라운드 Q3) — 두 주 모두 생성 전 요일은 분모에서 뺀다.
 *
 * 예정은 **기본 세트만** 매일 1회로 본다(3라운드 M8·사용자 결정 Q1). 기타 세트는
 * 상황별(생리 주기·환절기·여행) 선택 루틴이라 매일 예정으로 치면 기본 루틴을 매일
 * 다 해도 약 50%에서 멈췄다. 기타 세트 수행은 분자에 더하되 100%에서 자른다.
 *
 * 순수 함수로 둔 이유: 홈과 프로필이 같은 숫자를 써야 하는데, 각자 계산하면
 * 두 화면이 다른 값을 보여 주는 사고가 난다. React 에 의존하지 않아 검증도 쉽다.
 */

import { isFocusRoutine } from "@/app/routine/condition";
import type { Routine, RoutineRun } from "@/types/skincare";

export type Achievement = {
  /** 이번 주 완료 단계 수 */
  done: number;
  /** 이번 주 예정 단계 수 — 루틴별 (월요일·생성일 중 늦은 날 ~ 오늘) 일수 × 단계 수의 합 */
  planned: number;
  /** 0~100. 예정이 0이면 계산 불가라 null */
  percent: number | null;
  /** 지난주 대비 %p. 지난주 기록이 없으면 null (0으로 쓰면 "변화 없음"이라는 거짓말이 된다) */
  delta: number | null;
  /** 이번 주에 기록이 하나라도 있는가 — 첫 주 빈 상태 판단용 */
  hasRuns: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** 이번 주 월요일 00:00. 한국에서 주는 월요일에 시작한다. */
function startOfWeek(now: Date): number {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 0=일요일 → 월요일 기준으로 옮기면 일요일은 6일 전이다.
  const offset = (date.getDay() + 6) % 7;
  return date.getTime() - offset * DAY_MS;
}

/** 그 시각이 속한 로컬 날짜의 00:00. 주 경계·"오늘 완료"와 같은 기기 로컬 기준이다. */
function localDay(at: number): number {
  const date = new Date(at);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * 기간 안 완료 단계 수. **같은 루틴은 하루 1회분만** 센다 — 같은 날 두 번 하면
 * 다른 루틴을 안 한 날을 메워 달성률이 부풀었다(M8). 그날 가장 많이 한 1회를 쓰고,
 * 1회분은 그 루틴의 현재 단계 수를 넘지 않는다.
 * `stepsById` 에 없는 루틴(삭제돼 고아가 된 기록)은 세지 않는다.
 */
function countSteps(
  runs: readonly RoutineRun[],
  stepsById: ReadonlyMap<string, number>,
  from: number,
  to: number,
): number {
  const perRoutineDay = new Map<string, number>();
  for (const run of runs) {
    const finished = new Date(run.finishedAt);
    const at = finished.getTime();
    if (Number.isNaN(at) || at < from || at >= to) continue;
    const max = stepsById.get(run.routineId);
    if (max === undefined) continue;

    // 날짜는 로컬 기준 — 주 경계(startOfWeek)·"오늘 완료"와 같은 기준이다.
    const key = `${run.routineId} ${finished.toDateString()}`;
    const steps = Math.min(run.completedStepIds.length, max);
    perRoutineDay.set(key, Math.max(perRoutineDay.get(key) ?? 0, steps));
  }
  let sum = 0;
  for (const steps of perRoutineDay.values()) sum += steps;
  return sum;
}

export function weeklyAchievement(
  runs: readonly RoutineRun[],
  routines: readonly Routine[],
  now: Date = new Date(),
): Achievement {
  const thisWeek = startOfWeek(now);
  const lastWeek = thisWeek - WEEK_MS;
  const startOfToday = localDay(now.getTime());
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();
  /*
   * 예정 루틴 — **기본 세트**를 매일 1회씩 한다고 본다(Q1).
   * 기본 세트가 없으면(기타만 있음) 있는 세트로 센다 — 분모 0 이면 화면이
   * "아직 만든 루틴이 없어요"라고 거짓 안내한다.
   */
  const basic = routines.filter(
    (routine) => !isFocusRoutine(routine.condition),
  );
  const scheduled = basic.length > 0 ? basic : routines;

  /*
   * 예정은 루틴이 **생긴 날(그날 포함)부터** 센다(4라운드 Q3). 주중에 만든 루틴의
   * 생성 전 요일까지 예정으로 치면 첫날 전부 해도 25–50%, 다음 주엔 "지난주보다
   * 86%p 올랐어요"가 나왔다(리뷰 r4 m1).
   *  - 생성일은 첫 수행일보다 늦을 수 없다 — 편집(PUT)이 created_at 을 리셋하던
   *    시절에 저장된 루틴은 생성일이 실제보다 늦다.
   *  - 생성 시각이 없으면(시드) 처음부터 있던 것으로 본다.
   *  - 기기 시계가 늦어 생성일이 내일로 보여도 오늘은 센다 — 분모 0 이면 "루틴 없음"이 된다.
   */
  const firstRun = new Map<string, number>();
  for (const run of runs) {
    const at = new Date(run.finishedAt).getTime();
    if (Number.isNaN(at)) continue;
    firstRun.set(
      run.routineId,
      Math.min(firstRun.get(run.routineId) ?? at, at),
    );
  }
  const since = (routine: Routine): number => {
    const created = Date.parse(routine.createdAt ?? "");
    if (Number.isNaN(created)) return -Infinity;
    const first = firstRun.get(routine.id) ?? created;
    return Math.min(localDay(Math.min(created, first)), startOfToday);
  };
  /*
   * [from, to) 동안의 예정 단계 수. 이번 주는 **경과 일수**(월요일~오늘 포함)만 센다 —
   * 아직 오지 않은 요일을 미완료로 치면 주 초마다 달성률이 거짓으로 낮아진다(리뷰 m7).
   * DST 가 있는 시간대에서 하루가 23/25시간일 수 있어 round 로 나눈다.
   */
  const plannedIn = (from: number, to: number) =>
    scheduled.reduce((sum, routine) => {
      const days = Math.round((to - Math.max(from, since(routine))) / DAY_MS);
      return sum + routine.steps.length * Math.max(0, days);
    }, 0);
  const planned = plannedIn(thisWeek, tomorrow);
  // 지난주는 완결된 주 — 생성 이후 7일 전체가 분모다. 지난주에 루틴이 없었으면 0 → 델타 null.
  const lastPlanned = plannedIn(lastWeek, thisWeek);

  /*
   * 분모(예정)가 현재 루틴 기준이므로 분자(완료)도 현재 루틴의 수행만 센다 —
   * 세트 삭제로 고아가 된 기록이 달성률을 부풀리지 않게 한다(재검토 N3:
   * 기타만 수행 후 기타 삭제 → 안 한 기본 루틴 기준 100%가 되던 문제).
   * 기타 세트 수행도 분자에 들어간다(Q1) — 상한은 아래 100% 자르기가 맡는다.
   * 부작용: 루틴을 다시 만들면 id 가 바뀌어 그 주 달성률이 리셋된다 —
   * 바뀐 예정표에 옛 수행을 섞어 세는 것보다 정직하다. (단계 편집은 id 를 유지한다.)
   */
  const stepsById = new Map(
    routines.map((routine) => [routine.id, routine.steps.length]),
  );

  const done = countSteps(runs, stepsById, thisWeek, thisWeek + WEEK_MS);
  const lastDone = countSteps(runs, stepsById, lastWeek, thisWeek);

  // 기타 세트 수행이 분모 밖에서 더해지므로 100%에서 자른다 — 101% 는 지표로 의미가 없다.
  const percent =
    planned === 0 ? null : Math.min(100, Math.round((done / planned) * 100));

  // 델타도 같은 분자 기준(현재 루틴의 수행)으로 판단해야 주간 비교가 성립한다.
  const hadLastWeek = runs.some((run) => {
    const at = new Date(run.finishedAt).getTime();
    return (
      stepsById.has(run.routineId) &&
      !Number.isNaN(at) &&
      at >= lastWeek &&
      at < thisWeek
    );
  });
  const lastPercent =
    lastPlanned === 0
      ? null
      : Math.min(100, Math.round((lastDone / lastPlanned) * 100));

  return {
    done,
    planned,
    percent,
    delta:
      percent === null || lastPercent === null || !hadLastWeek
        ? null
        : percent - lastPercent,
    hasRuns: done > 0,
  };
}
