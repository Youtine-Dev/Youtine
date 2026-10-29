"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { deleteRoutines, useRoutines, useRuns } from "@/lib/data";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { isSameLocalDay } from "@/lib/storage/history";
import { useModalFocus } from "@/lib/useModalFocus";

import { isFocusRoutine, ROUTINE_CONDITION } from "../condition";
import { RoutineCard } from "./RoutineCard";
import styles from "./RoutineList.module.css";

/**
 * 삭제 확인 모달 — 사용자 요청 2026-08-20 ("정말 삭제하시겠습니까"를 모달로).
 * 스크림·blur·스크롤 락은 앱의 다른 모달과 같은 규칙이다. 이 라우트는 탭 패널이
 * 아니라 이동 시 언마운트되므로 스크롤 락이 남는 문제(hidden 패널)와 무관하다.
 */
function DeleteConfirmModal({
  label,
  deleting,
  failed,
  onConfirm,
  onClose,
}: {
  label: string;
  deleting: boolean;
  failed: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useBodyScrollLock();

  /*
   * 열릴 때 포커스를 모달 안(취소)으로 옮기고, Tab 을 가두고, 닫히면 트리거로 돌려준다
   * (재검토 N5 · 3라운드 m31 — 예전엔 초기 포커스만 있어 Tab 이 배경으로 빠졌다).
   */
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalFocus(dialogRef, cancelRef);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, deleting]);

  return (
    <div
      ref={dialogRef}
      className={styles.confirmOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} 삭제 확인`}
    >
      <div className={styles.confirmSheet}>
        <Icon name="delete" filled className={styles.confirmIcon} />
        <p className={styles.confirmTitle}>정말 삭제하시겠습니까?</p>
        <p className={styles.confirmText}>
          {label}의 아침·저녁 루틴이 모두 삭제돼요.
          <br />
          되돌릴 수 없습니다.
        </p>

        {failed && (
          <p className={styles.confirmError} role="alert">
            삭제하지 못했어요.
            <br />
            다시 시도해 주세요.
          </p>
        )}

        <div className={styles.confirmActions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.confirmCancel}
            onClick={onClose}
            disabled={deleting}
          >
            취소
          </button>
          <button
            type="button"
            className={styles.confirmDelete}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 세트 단위 삭제 — 버튼을 누르면 확인 모달이 뜬다.
 * `conditions` 는 화면 그룹에 실제로 보이는 condition 목록이다 — 그룹 판정(부정형)과
 * 삭제 범위가 어긋나지 않게 한다(재검토 N2).
 */
function DeleteRoutineSet({
  conditions,
  label,
}: {
  conditions: string[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    setFailed(false);
    try {
      await deleteRoutines(conditions);
      // 성공하면 routines 캐시 갱신으로 이 섹션의 목록이 비워진다.
      setOpen(false);
    } catch {
      // 모달을 열어 둔 채 에러를 보여 준다 — 닫아 버리면 실패를 알 수 없다.
      setFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.delete}
        onClick={() => {
          setFailed(false);
          setOpen(true);
        }}
      >
        <Icon name="delete" size="sm" />
        삭제
      </button>

      {open && (
        <DeleteConfirmModal
          label={label}
          deleting={deleting}
          failed={failed}
          onConfirm={handleConfirm}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * 저장된 루틴 목록.
 *
 * 루틴이 localStorage 로 옮겨가면서 이 조각만 클라이언트가 된다 —
 * 페이지(`page.tsx`)와 `TopAppBar`·`WeekStrip` 은 서버 컴포넌트로 남는다.
 */
export function RoutineList() {
  const routinesRes = useRoutines();
  const runsRes = useRuns();
  // Pro 업셀 안내 — early return(로딩/에러)보다 앞에 있어야 한다(훅 규칙).
  const [proNotice, setProNotice] = useState(false);
  /**
   * 편집 중인 카드 — 한 번에 하나만 편집한다(m7). 저장이 같은 조건의 형제를 함께
   * 보내므로, 아침·저녁을 동시에 편집하면 한쪽 저장이 다른 쪽 초안의 기준을 바꾼다.
   */
  const [editingId, setEditingId] = useState<string | null>(null);

  // "오늘 완료" 표시가 기록에서 나오므로 둘 다 있어야 한 번에 정확히 그린다.
  if (!routinesRes.ready || !runsRes.ready)
    return <DataState loading label="루틴" />;

  if (routinesRes.error || runsRes.error)
    return (
      <DataState
        error
        label="루틴"
        // 둘 다 실패할 수도 있다 — 먼저 있는 쪽(routines)의 메시지를 우선한다.
        message={routinesRes.errorMessage ?? runsRes.errorMessage}
        onRetry={() => {
          routinesRes.retry();
          runsRes.retry();
        }}
      />
    );

  const routines = routinesRes.value;
  const runs = runsRes.value;

  /*
   * "오늘 완료"는 **수행 기록에서 파생**한다(Step 7).
   * 예전에는 카드마다 로컬 state 로 토글했는데, 새로고침하면 풀리는 가짜 상태였고
   * 주간 달성률과도 어긋났다. 기록을 단일 출처로 삼으면 둘이 항상 일치한다.
   */
  const today = new Date();
  const doneToday = new Set(
    runs
      .filter((run) => isSameLocalDay(run.finishedAt, today))
      .map((run) => run.routineId),
  );

  if (routines.length === 0) {
    return (
      <section className={styles.empty} role="status">
        <Icon name="auto_awesome" filled className={styles.emptyIcon} />
        <h2 className={styles.emptyTitle}>아직 루틴이 없어요</h2>
        <p className={styles.emptyText}>
          피부 고민과 쓸 수 있는 시간을 알려 주면, 등록한 제품으로 아침·저녁
          루틴을 만들어 드려요.
        </p>
        <Link className={styles.emptyCta} href="/routine/new">
          <Icon name="add_circle" filled size="sm" />
          루틴 만들기
        </Link>
      </section>
    );
  }

  /*
   * 두 갈래로 나눠 보여준다 — 저장이 조건 단위 교체라 **실제로 따로 사는 루틴**이다.
   * 한 목록에 섞으면 "다시 만들기"가 무엇을 지우는지 알 수 없다.
   */
  const focus = routines.filter((r) => isFocusRoutine(r.condition));
  const basic = routines.filter((r) => !isFocusRoutine(r.condition));
  // 편집하던 카드가 사라졌으면(세트 삭제 등) 잠금도 풀린다 — 다른 카드가 영영 잠기지 않게.
  const editing = routines.some((r) => r.id === editingId) ? editingId : null;

  const cards = (list: typeof routines) => (
    <ul className={styles.list}>
      {list.map((routine) => (
        <RoutineCard
          key={routine.id}
          routine={routine}
          done={doneToday.has(routine.id)}
          editLocked={editing !== null && editing !== routine.id}
          onEditingChange={(on) => setEditingId(on ? routine.id : null)}
        />
      ))}
    </ul>
  );

  return (
    /* id 는 기록 섹션의 "루틴 보러 가기"가 가리키는 앵커다. */
    <div id="routines" className={styles.groups}>
      <section>
        <h2 className={styles.heading}>기본 루틴</h2>
        <p className={styles.lead}>
          매일 하는 아침·저녁 루틴이에요.
          <br />
          카드를 펼치면 단계를 볼 수 있어요.
        </p>

        {basic.length === 0 ? (
          <p className={styles.groupEmpty}>
            아직 기본 루틴이 없어요.
            <br />
            보유한 제품으로 매일 쓸 루틴을 먼저 만들어 보세요.
          </p>
        ) : (
          cards(basic)
        )}

        <div className={styles.groupActions}>
          <Link className={styles.regenerate} href="/routine/new">
            <Icon
              name={basic.length === 0 ? "add_circle" : "refresh"}
              size="sm"
            />
            {basic.length === 0 ? "기본 루틴 만들기" : "기본 루틴 다시 만들기"}
          </Link>
          {basic.length > 0 && (
            <DeleteRoutineSet
              conditions={[...new Set(basic.map((r) => r.condition))]}
              label="기본 루틴"
            />
          )}
        </div>
      </section>

      <section>
        {/* 표시명만 "기타 루틴" — 저장값은 "고민 집중" 그대로다(condition.ts 참조). */}
        <h2 className={styles.heading}>기타 루틴</h2>
        <p className={styles.lead}>
          피부 고민이나 특별한 상황에 맞춘 두 번째 루틴이에요.
          <br />
          다시 만들어도 기본 루틴은 그대로 남아요.
        </p>

        {focus.length === 0 ? (
          <p className={styles.groupEmpty}>
            아직 기타 루틴이 없어요.
            <br />
            <strong>내 고민</strong> 탭에서 고민을 등록하면 그 고민에 맞춰 짜
            드려요.
          </p>
        ) : (
          cards(focus)
        )}

        <div className={styles.groupActions}>
          <Link className={styles.regenerate} href="/routine/new?focus=1">
            <Icon
              name={focus.length === 0 ? "add_circle" : "refresh"}
              size="sm"
            />
            {focus.length === 0 ? "기타 루틴 만들기" : "기타 루틴 다시 만들기"}
          </Link>
          {focus.length > 0 && (
            <DeleteRoutineSet
              conditions={[ROUTINE_CONDITION.focus]}
              label="기타 루틴"
            />
          )}
        </div>
      </section>

      {/*
        무료 티어는 루틴 2세트(기본+기타)까지 — 사용자 결정 2026-08-20.
        결제 흐름은 없다. 자리와 안내만 두는 업셀 표시다.
      */}
      <section className={styles.pro}>
        <button
          type="button"
          className={styles.proButton}
          onClick={() => setProNotice(true)}
        >
          <Icon name="add_circle" size="sm" />
          루틴 더 만들기
        </button>
        {proNotice && (
          <p className={styles.proNotice} role="status">
            무료 버전에서는 루틴을 2개(기본·기타)까지 만들 수 있어요.
            <br />더 만들려면 <strong>Pro 업그레이드</strong>가 필요해요.
          </p>
        )}
      </section>
    </div>
  );
}
