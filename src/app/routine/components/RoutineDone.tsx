"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { appendRun, useRoutines, useRuns } from "@/lib/data";
import {
  clearRunStart,
  isSameLocalDay,
  liveRunStart,
  RUN_START_KEY,
  type RunStart,
} from "@/lib/storage/history";
import { useStored } from "@/lib/storage/useStored";

import { TIME_LABEL, totalMinutes } from "../routineTime";
import styles from "./RoutineDone.module.css";

const NO_START: RunStart | null = null;

/**
 * 루틴 완료 화면 — 수행 기록을 남긴다.
 *
 * **이중 기록 방지**: 기록은 "시작 표시"(`markRunStep`)를 **소비**하면서 남긴다.
 * 새로고침하면 시작 표시가 이미 지워져 있어 두 번 기록되지 않는다.
 * 다만 기록이 서버 API 호출(비동기)이 되면서, 같은 시작 표시로 effect 가 두 번(StrictMode)
 * 겹쳐 돌 수 있어 `sentRef` 로 중복 호출만 막는다 — 소비 자체는 여전히 표시가 담당한다.
 *
 * - `completedStepIds` 는 '건너뛰기'로 지나친 단계를 뺀다(I10 — 시작 표시에 기록돼 있다).
 * - 시작 표시가 없거나 만료됐으면(중간 단계로 바로 들어옴·며칠 전 표시) 자동 기록하지 않는다 —
 *   시작 시각을 지어내지 않는다. 대신 그 사실을 알리고 **기록 남기기**를 고르게 한다(m24③).
 * - 저장 실패(네트워크 오류) 시 완료 축하는 유지하되 **실패 배너 + 다시 시도**를 띄운다.
 *   실패한 채 다른 루틴을 시작하면 단일 슬롯인 시작 표시가 덮여 기록이 영구 유실되므로
 *   (M7), 화면에서 바로 재시도할 수 있어야 한다. 시작 표시 자체는 성공 전까지 남아
 *   다음 진입 때도 자동으로 재시도된다.
 */
export function RoutineDone({ routineId }: { routineId: string }) {
  const { ready, value: routines, error, errorMessage, retry } = useRoutines();
  const runsRes = useRuns();
  /** 소비되지 않은 시작 표시가 있으면 아직 기록 전이다. */
  const { value: stored } = useStored<RunStart | null>(RUN_START_KEY, NO_START);
  const start = stored?.routineId === routineId ? liveRunStart(stored) : null;
  /** StrictMode 이중 실행이나 재렌더로 같은 시작 표시가 두 번 기록 요청되는 것을 막는다. */
  const sentRef = useRef(false);
  /** 재시도해도 같은 시각을 보낸다 — 서버 멱등 키가 `started_at` 이다(RoutineCard m1 과 같은 이유). */
  const finishedAtRef = useRef<string | null>(null);
  /** 기록 저장 실패 여부 — 성공 UI 는 유지한 채 배너로만 알린다. */
  const [saveFailed, setSaveFailed] = useState(false);
  /** 소비한 시작 표시 — 지운 뒤에도 건너뛴 단계 표시가 '모두 마침'으로 바뀌지 않게 남긴다. */
  const [recorded, setRecorded] = useState<RunStart | null>(null);

  const routine = routines.find((item) => item.id === routineId);
  const skipped = new Set((start ?? recorded)?.skippedStepIds ?? []);

  /**
   * 기록 전송 — 최초(effect)·수동 재시도(배너)·시작 표시 없는 기록(m24③)이 같은 경로를 탄다.
   * 성공했을 때만 시작 표시를 소비한다 — 실패하면 표시가 남아 다음에 다시 시도된다.
   */
  const sendRun = useCallback(() => {
    if (!routine) return;
    if (sentRef.current) return;
    sentRef.current = true;
    finishedAtRef.current ??= new Date().toISOString();
    const finishedAt = finishedAtRef.current;
    const skippedIds = new Set(start?.skippedStepIds ?? []);

    appendRun({
      routineId,
      // 시작 표시가 없으면 사용자가 '기록 남기기'를 고른 경우다 — 카드 '완료'와 같은 규칙.
      startedAt: start?.startedAt ?? finishedAt,
      finishedAt,
      completedStepIds: routine.steps
        .filter((step) => !skippedIds.has(step.id))
        .map((step) => step.id),
    })
      .then(() => {
        setSaveFailed(false);
        if (!start) return;
        setRecorded(start);
        clearRunStart();
      })
      .catch((err: unknown) => {
        sentRef.current = false;
        setSaveFailed(true);
        console.error("루틴 수행 기록 저장 실패", err);
      });
  }, [routine, routineId, start]);

  /*
   * 기록은 **외부 시스템(서버) 갱신**이라 effect 가 맞는 자리다.
   * 결과를 로컬 state 로 미러링하지 않는다 — SWR 캐시가 스스로 변경을 알리므로
   * 화면은 저장소에서 파생하기만 하면 된다. (실패 배너만 예외로 state 를 둔다.)
   * 이미 소비됐다 = 기록 완료(새로고침) 또는 중간 URL 로 바로 들어옴 — 자동으로 보내지 않는다.
   */
  useEffect(() => {
    if (ready && start) sendRun();
  }, [ready, start, sendRun]);

  if (!ready) return <DataState loading label="루틴" />;
  if (error)
    return (
      <DataState error onRetry={retry} label="루틴" message={errorMessage} />
    );

  if (!routine) {
    return (
      <main className={styles.main} role="alert">
        <Icon name="search_off" filled className={styles.icon} />
        <h1 className={styles.title}>이 루틴을 찾을 수 없어요</h1>
        <Link className={styles.cta} href="/routine">
          루틴 목록으로
        </Link>
      </main>
    );
  }

  const minutes = totalMinutes(routine.steps);
  const total = routine.steps.length;
  const doneCount = routine.steps.filter(
    (step) => !skipped.has(step.id),
  ).length;
  /*
   * 시작 표시 없이 끝까지 왔다(m24③) — 기록이 안 남았다는 사실을 알린다. 오늘 이 루틴
   * 기록이 이미 있으면(기록 후 새로고침 등) 묻지 않는다 — 같은 수행을 두 번 남기게 된다.
   * 기록을 못 불러왔으면 단정할 수 없어 묻지 않는다. 저장이 실패했으면 실패 배너가 대신 묻는다.
   */
  const today = new Date();
  const unrecorded =
    !start &&
    !recorded &&
    !saveFailed &&
    runsRes.ready &&
    !runsRes.error &&
    !runsRes.value.some(
      (run) =>
        run.routineId === routineId && isSameLocalDay(run.finishedAt, today),
    );

  return (
    <main className={styles.main}>
      <Icon name="check_circle" filled className={styles.icon} />

      <h1 className={styles.title}>{TIME_LABEL[routine.time]} 루틴 완료</h1>
      <p className={styles.text}>
        {doneCount === total
          ? `${total}단계를 모두 마쳤어요`
          : `${total}단계 중 ${doneCount}단계를 마쳤어요`}
        {minutes !== null && ` · 약 ${minutes}분`}
      </p>

      {unrecorded && (
        <div className={`${styles.warn} ${styles.notice}`} role="status">
          <Icon name="info" size="sm" />
          <span className={styles.warnText}>
            첫 단계부터 시작하지 않아 이번 수행은 아직 기록되지 않았어요.
          </span>
          <button
            type="button"
            className={styles.noticeAction}
            onClick={sendRun}
          >
            기록 남기기
          </button>
        </div>
      )}

      {saveFailed && (
        <div className={styles.warn} role="alert">
          <Icon name="error" size="sm" />
          <span className={styles.warnText}>
            기록 저장에 실패했어요.
            {start && (
              <>
                <br />
                다른 루틴을 시작하면 이 기록이 사라져요.
              </>
            )}
          </span>
          <button type="button" className={styles.warnRetry} onClick={sendRun}>
            다시 시도
          </button>
        </div>
      )}

      <ol className={styles.steps}>
        {routine.steps.map((step) => {
          const wasSkipped = skipped.has(step.id);
          return (
            <li
              key={step.id}
              className={`${styles.step} ${wasSkipped ? styles.stepSkipped : ""}`}
            >
              <Icon
                name={wasSkipped ? "remove" : "check"}
                size="sm"
                className={styles.stepCheck}
              />
              {step.routineName}
              {wasSkipped && <span className={styles.skipTag}>건너뜀</span>}
            </li>
          );
        })}
      </ol>

      <div className={styles.actions}>
        <Link className={styles.cta} href="/routine">
          <Icon name="list" filled size="sm" />
          루틴 목록으로
        </Link>
        {/*
          기록이 루틴 탭으로 옮겨 왔다(Step 6). 같은 페이지지만 루틴 두 그룹 아래라
          접힘선 밖이므로 앵커로 바로 보낸다.
        */}
        <Link className={styles.secondary} href="/routine#records">
          기록 보기
        </Link>
      </div>
    </main>
  );
}
