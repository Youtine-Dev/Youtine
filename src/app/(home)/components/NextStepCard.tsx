"use client";

import type { Route } from "next";
import Link from "next/link";

import { conditionLabel, isFocusRoutine } from "@/app/routine/condition";
import { TIME_ICON, TIME_LABEL } from "@/app/routine/routineTime";
import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { useProducts, useRoutines, useRuns } from "@/lib/data";
import { stepIcon } from "@/lib/stepIcon";
import {
  isSameLocalDay,
  liveRunStart,
  RUN_START_KEY,
  type RunStart,
} from "@/lib/storage/history";
import { useStored } from "@/lib/storage/useStored";
import type { Routine, RoutineRun, RoutineTime } from "@/types/skincare";

import card from "./card.module.css";
import styles from "./NextStepCard.module.css";

/** 인라인 `null` 은 매 렌더 새 참조라 useStored 의 memo 를 무력화한다. */
const NO_RUN_START: RunStart | null = null;

type Suggestion =
  | { kind: "empty" }
  /** 오늘 할 루틴을 전부 마쳤다(m24①). */
  | { kind: "all-done" }
  /** step: 마지막으로 연 단계(1부터) — '이어서 하기'가 여기로 보낸다(m14). */
  | { kind: "in-progress"; routine: Routine; step: number }
  | { kind: "suggested"; routine: Routine };

/**
 * 다음에 할 루틴을 고른다.
 *
 * 1순위: 만료 전 시작 표시가 가리키는 루틴이 아직 있고, 그 뒤로 완료 기록이 없으면 "진행 중"이다.
 *        카드 '완료'로 끝낸 수행은 시작 표시를 지우지 않으므로 기록으로 판정한다(m14).
 * 2순위: 오늘 아직 안 한 루틴 중 현재 시간대(아침/저녁)에 맞는 것, 없으면 다른 시간대 것.
 *        오늘 다 했으면 완료 상태다(m24①). 기타 루틴은 선택 세트라 기본 루틴이 하나도
 *        없을 때만 후보가 된다 — 달성률 분모가 기본 세트인 것과 같은 기준(Q1).
 */
export function pickSuggestion(
  routines: readonly Routine[],
  runs: readonly RoutineRun[],
  runStart: RunStart | null,
  now: Date,
): Suggestion {
  if (routines.length === 0) return { kind: "empty" };

  const start = liveRunStart(runStart, now.getTime());
  // 시작 표시가 가리키는 루틴이 재생성으로 사라졌을 수 있다 — 그때는 진행 중이 아니다.
  const active = start && routines.find((r) => r.id === start.routineId);
  if (start && active) {
    const startedAt = Date.parse(start.startedAt);
    const finished = runs.some(
      (run) =>
        run.routineId === active.id && Date.parse(run.finishedAt) >= startedAt,
    );
    const step = start.step ?? 1;
    if (!finished)
      return {
        kind: "in-progress",
        routine: active,
        // 단계 편집으로 줄었을 수 있다 — 범위를 벗어나면 처음부터.
        step:
          Number.isInteger(step) && step >= 1 && step <= active.steps.length
            ? step
            : 1,
      };
  }

  const doneToday = new Set(
    runs
      .filter((run) => isSameLocalDay(run.finishedAt, now))
      .map((run) => run.routineId),
  );
  const base = routines.filter((r) => !isFocusRoutine(r.condition));
  const pool = (base.length > 0 ? base : routines).filter(
    (r) => !doneToday.has(r.id),
  );

  // 정오를 기준으로 아침/저녁을 나눈다. 기상~정오의 "아침" 구간은 짧고
  // 저녁 루틴은 그 이후 하루 대부분을 차지하므로, 하루를 반으로 가르는
  // 정오 기준이 가장 단순하면서도 무리가 없다.
  const preferred: RoutineTime = now.getHours() < 12 ? "am" : "pm";
  const routine = pool.find((r) => r.time === preferred) ?? pool[0];
  return routine ? { kind: "suggested", routine } : { kind: "all-done" };
}

/**
 * 홈의 "다음 단계" 카드 — 수행 중인 루틴이 있으면 이어서 하기, 없으면
 * 시간대에 맞는 루틴을 제안한다.
 *
 * 진행 중이면 저장된 단계로 보내지만 숫자 진행률바는 그리지 않는다 — '건너뛰기'·앞뒤 이동이
 * 있어 "몇 번째 단계를 열었나"가 곧 진행률은 아니다. 근거 없는 숫자를 지어내지 않는다.
 */
export function NextStepCard() {
  const { ready, value: routines, error, errorMessage, retry } = useRoutines();
  // 오늘 한 루틴(m24①)·진행 중 판정(m14)은 기록에서, 빈 선반 안내(I4)는 선반에서 나온다.
  const runsRes = useRuns();
  const productsRes = useProducts();
  /*
   * 수행 중 표시는 **기기별 임시 상태**라 서버에 테이블이 없다(계획서 Step 3 메모).
   * 다른 기기에서 이어서 하기를 원하는 게 아니므로 localStorage 그대로 둔다.
   */
  const { value: runStart } = useStored<RunStart | null>(
    RUN_START_KEY,
    NO_RUN_START,
  );

  // 기록·선반까지 기다린다 — 먼저 그리면 오늘 한 루틴이 한 번 제안됐다가 바뀐다.
  // 둘의 실패는 카드를 막지 않는다: 기록 실패면 예전처럼 전부 후보, 선반 실패면 루틴 만들기.
  if (!ready || !runsRes.ready || !productsRes.ready)
    return <DataState loading label="루틴" />;
  if (error)
    return (
      <DataState error onRetry={retry} label="루틴" message={errorMessage} />
    );

  const suggestion = pickSuggestion(
    routines,
    runsRes.value,
    runStart,
    new Date(),
  );

  // 신규 사용자 — 루틴을 만들려 해도 "먼저 제품을 등록"으로 튕기므로 그 단계를 바로 준다(I4).
  if (
    suggestion.kind === "empty" &&
    !productsRes.error &&
    productsRes.value.length === 0
  ) {
    return (
      <section className={`${card.card} ${styles.empty}`}>
        <Icon name="inventory_2" filled className={styles.emptyIcon} />
        <h2 className={card.cardTitle}>다음 단계</h2>
        <p className={styles.emptyText}>
          루틴은 내 선반의 제품으로 만들어요.
          <br />
          쓰고 있는 제품부터 등록해 주세요.
        </p>
        <Link className={styles.emptyCta} href="/scan">
          <Icon name="add_circle" filled size="sm" />
          제품 먼저 등록하기
        </Link>
      </section>
    );
  }

  if (suggestion.kind === "empty") {
    return (
      <section className={`${card.card} ${styles.empty}`}>
        <Icon name="auto_awesome" filled className={styles.emptyIcon} />
        <h2 className={card.cardTitle}>다음 단계</h2>
        <p className={styles.emptyText}>
          아직 만든 루틴이 없어요.
          <br />
          루틴을 만들면 다음에 할 일을 알려드려요.
        </p>
        <Link className={styles.emptyCta} href="/routine/new">
          <Icon name="add_circle" filled size="sm" />
          루틴 만들기
        </Link>
      </section>
    );
  }

  if (suggestion.kind === "all-done") {
    return (
      <section className={`${card.card} ${styles.empty}`}>
        <Icon name="check_circle" filled className={styles.emptyIcon} />
        <h2 className={card.cardTitle}>다음 단계</h2>
        <p className={styles.emptyText}>오늘 루틴을 모두 마쳤어요.</p>
        <Link className={styles.emptyCta} href="/routine#records">
          기록 보기
        </Link>
      </section>
    );
  }

  const { routine } = suggestion;
  const inProgress = suggestion.kind === "in-progress";
  const step = inProgress ? suggestion.step : 1;
  // 이어서 하기면 마지막으로 연 단계를, 아니면 첫 단계를 보여 준다.
  const shown = routine.steps[step - 1];

  return (
    <section className={card.card}>
      <div className={styles.header}>
        <h2 className={card.cardTitle}>다음 단계</h2>
        <span className={`${card.label} ${styles.routine}`}>
          <Icon
            name={inProgress ? "play_circle" : TIME_ICON[routine.time]}
            size="sm"
          />
          {inProgress ? "진행 중" : `${TIME_LABEL[routine.time]} 루틴`}
        </span>
      </div>

      {shown && (
        <div className={styles.product}>
          <div className={styles.thumb} aria-hidden="true">
            <Icon name={stepIcon(shown.routineName)} filled />
          </div>

          <div className={styles.detail}>
            <h3 className={styles.productName}>{routine.name}</h3>
            <p className={styles.instruction}>
              {/* using_product 는 id 가 아니라 이름 문자열이다(정확 매칭 보장 없음) */}
              {shown.usingProduct.length > 0
                ? shown.usingProduct.join(" + ")
                : shown.routineName}
            </p>
            <ul className={styles.tags}>
              {/* 저장값("고민 집중")이 아니라 표시명("기타 루틴")을 쓴다 — RoutineCard 와 동일 규칙 */}
              <li className={`${card.label} ${styles.tag}`}>
                {conditionLabel(routine.condition)}
              </li>
              <li className={`${card.label} ${styles.tag}`}>
                {inProgress
                  ? `${routine.steps.length}단계 중 ${step}번째`
                  : `총 ${routine.steps.length}단계`}
              </li>
            </ul>
          </div>
        </div>
      )}

      <Link
        href={`/routine/${routine.id}/${step}` as Route}
        className={styles.cta}
      >
        <Icon name="play_arrow" filled size="sm" />
        {inProgress ? "이어서 하기" : "시작하기"}
      </Link>
    </section>
  );
}
