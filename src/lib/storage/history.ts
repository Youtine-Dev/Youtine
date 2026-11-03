/**
 * 수행 중 표시 — **localStorage 에 남는 유일한 도메인 데이터**다.
 *
 * 수행 기록 자체는 서버로 옮겼다(`src/lib/data.ts` 의 `useRuns`·`appendRun`).
 * 하지만 "지금 어느 루틴을 하는 중인가"는 **기기별 임시 상태**라 서버에 테이블이 없고,
 * 다른 기기에서 이어서 하기를 지원하지도 않으므로 옮길 이유가 없다.
 */

import { load, remove, save } from "./local";

/** `useStored` 로 같은 값을 구독하는 화면이 있어 키를 노출한다. */
export const RUN_START_KEY = "run-start";

/**
 * 진행 중 표시 — 수행 화면 첫 단계에 들어설 때 찍는다.
 * `step`·`skippedStepIds` 는 나중에 붙은 필드라 옛 표시에는 없을 수 있다.
 */
export type RunStart = {
  routineId: string;
  startedAt: string;
  /** 마지막으로 연 단계(1부터) — 홈 '이어서 하기'가 여기로 보낸다(m14). */
  step?: number;
  /** '건너뛰기'로 지나친 단계 — 완료 기록에서 뺀다(I10). */
  skippedStepIds?: string[];
  /**
   * 전부 건너뛰어 기록 없이 끝낸 수행(4라운드 Q2) — 진행 중이 아니다. 지우지 않고 남기는 건
   * 완료 화면을 새로고침해도 '시작 표시 없음'의 수동 기록(전 단계 완료)이 뜨지 않게 하려는 것.
   */
  consumed?: boolean;
};

/**
 * 이보다 오래된 표시는 버려진 수행으로 본다(m14). 루틴 한 번은 길어야 수십 분이고,
 * 아침에 그만둔 루틴이 저녁까지 '진행 중'으로 남지 않도록 반나절보다 짧게 둔다.
 */
const RUN_START_TTL_MS = 6 * 60 * 60 * 1000;

/** 만료되지 않은 표시만 돌려준다. 시각이 깨졌거나 소비됐으면 진행 중이 아니다. */
export function liveRunStart(
  start: RunStart | null,
  now: number = Date.now(),
): RunStart | null {
  if (!start || start.consumed) return null;
  const at = Date.parse(start.startedAt);
  return Number.isFinite(at) && now - at < RUN_START_TTL_MS ? start : null;
}

/** 같은 날인가 — 기록은 ISO 문자열이라 기기 로컬 시간대로 비교한다. */
export function isSameLocalDay(iso: string, day: Date): boolean {
  const at = new Date(iso);
  return (
    !Number.isNaN(at.getTime()) &&
    at.getFullYear() === day.getFullYear() &&
    at.getMonth() === day.getMonth() &&
    at.getDate() === day.getDate()
  );
}

function liveFor(routineId: string): RunStart | null {
  const current = liveRunStart(load<RunStart | null>(RUN_START_KEY, null));
  return current?.routineId === routineId ? current : null;
}

function persist(start: RunStart): void {
  // 저장 실패(프라이빗 모드 등)면 완료 화면이 시작 표시를 못 찾아 기록이 통째로 빠진다.
  // 여기서 막을 수단은 없지만, 원인 추적이 가능하도록 흔적은 남긴다.
  if (!save(RUN_START_KEY, start)) {
    console.warn(
      `[history] 수행 시작 표시 저장 실패 — 기록이 누락될 수 있음 (routineId: ${start.routineId})`,
    );
  }
}

/**
 * 지금 연 단계를 기록한다. 시작 표시는 **첫 단계에서만** 새로 만든다 —
 * 중간 단계로 바로 들어온 경우 시작 시각을 지어내지 않는다(완료 화면이 따로 묻는다, m24③).
 *
 * 같은 루틴이 이미 진행 중이면 시작 시각을 유지한다(단계를 앞뒤로 오갈 수 있다).
 * 만료된 표시는 없는 것으로 보고 새로 시작한다 — 며칠 전 시각이 기록에 남지 않게(m14).
 */
export function markRunStep(routineId: string, step: number): void {
  const live = liveFor(routineId);
  if (live) {
    if (live.step !== step) persist({ ...live, step });
    return;
  }
  if (step !== 1) {
    // 소비 표시(전부 건너뜀)는 완료 화면 새로고침 방어용이라 수행 화면에 다시 들어오면 할 일이
    // 끝났다. 남기면 중간 단계로 들어와 실제로 마친 수행이 옛 '건너뜀' 화면에 가려 기록할 길이 없다.
    if (load<RunStart | null>(RUN_START_KEY, null)?.consumed) clearRunStart();
    return;
  }
  persist({
    routineId,
    startedAt: new Date().toISOString(),
    step,
    skippedStepIds: [],
  });
}

/** 단계를 건너뛰었는지 기록한다. 되돌아와 '다음'으로 넘기면 다시 완료로 친다(I10). */
export function setStepSkipped(
  routineId: string,
  stepId: string,
  skipped: boolean,
): void {
  const live = liveFor(routineId);
  if (!live) return;
  const rest = (live.skippedStepIds ?? []).filter((id) => id !== stepId);
  persist({ ...live, skippedStepIds: skipped ? [...rest, stepId] : rest });
}

/**
 * 기록을 남긴 뒤 진행 중 표시를 지운다.
 *
 * ⚠️ 완료 화면은 이 표시를 **소비하면서** 기록한다 — 서버 저장이 성공했을 때만 지운다.
 * 실패하면 표시가 남아 다음 진입 때 자동으로 재시도된다.
 */
export function clearRunStart(): boolean {
  return remove(RUN_START_KEY);
}

/**
 * 전부 건너뛴 수행을 기록 없이 '소비됨'으로 남긴다(Q2). `liveRunStart` 가 null 로 보므로
 * 이어서 하기·단계 기록에는 없는 것과 같고, 다음 단계 진입(`markRunStep`)이 덮어쓰거나 지운다.
 */
export function consumeRunStart(start: RunStart): void {
  persist({ ...start, consumed: true });
}
