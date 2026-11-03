"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { useProducts, useRoutines, useSkinProfile } from "@/lib/data";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

import { ROUTINE_CONDITION } from "../../condition";
import { useRoutineGenerate } from "../../hooks/useRoutineGenerate";
import styles from "./RoutineForm.module.css";

/** 프롬프트의 `usable_time` 은 자유 문자열이지만, 고르게 하면 오타·모호한 값이 안 들어온다. */
const TIME_OPTIONS = ["3분", "5분", "10분", "15분", "20분"] as const;

/** 저장된 시간이 선택지에 있을 때만 쓴다 — 없는 값을 select 에 넣으면 화면과 제출값이 어긋난다. */
function timeOption(saved: string | undefined, fallback: string): string {
  return TIME_OPTIONS.find((option) => option === saved) ?? fallback;
}

/** 실측 약 90초. 이 시점부터는 "정상입니다"라고 알려 줘야 사용자가 안 떠난다. */
const LONG_WAIT_SECONDS = 20;

/**
 * 생성 중 전면 차단 오버레이 — 사용자 피드백 2026-08-20: 인라인 스피너로는
 * "AI 가 일하는 중"이 안 읽히고, 기다리는 동안 다른 곳을 눌러 흐름이 깨졌다.
 * 화면 전체를 덮어 터치를 막고, 스크롤도 잠근다.
 * (이 라우트는 전용 페이지라 이동하면 언마운트되므로 스크롤 락이 남지 않는다.)
 */
function AIWorkingOverlay({ focus }: { focus: boolean }) {
  useBodyScrollLock();

  /*
   * 진행 표시 — 스피너만 돌면 멈춘 줄 안다(ProductForm 과 같은 이유).
   * 오버레이 안에서 세야 마운트마다 0부터 시작한다 — 폼에 두면 두 번째 생성의 첫 1초에
   * 직전 경과 초(예: 92초)와 '거의 다 됐어요' 힌트가 비쳤다(r4 m13).
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    /*
     * ⚠️ 라이브 리전을 루트에 두지 않는다(재검토 N6) — 안에 매초 바뀌는 초 카운터가
     * 있어 스크린리더가 생성 90초 내내 반복 낭독했다. 상태 전환 문구(제목·20초 힌트)만
     * role="status" 로 알리고, 카운터는 보조기기에서 숨긴다.
     */
    <div className={styles.overlay}>
      <div className={styles.overlayCard}>
        <Icon name="auto_awesome" filled className={styles.aiIcon} />
        <p className={styles.overlayTitle} role="status">
          AI가 {focus ? "기타 루틴을" : "루틴을"} 짜고 있어요
        </p>
        <p className={styles.overlayMeta} aria-hidden="true">
          제품과 성분을 하나씩 따져 보는 중 · {elapsed}초
        </p>
        {elapsed >= LONG_WAIT_SECONDS && (
          <p className={styles.overlayHint} role="status">
            보통 1~2분 걸립니다.
            <br />
            화면을 닫지 말고 잠시만 기다려 주세요.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * @param focus 기타 루틴(저장값 "고민 집중")을 만드는 중인가. 등록된 고민을 미리 채우고,
 *   결과를 `condition = "고민 집중"` 으로 저장해 **기본 루틴과 따로 남긴다.**
 */
export function RoutineForm({ focus = false }: { focus?: boolean }) {
  const wonderId = useId();
  const morningId = useId();
  const eveningId = useId();

  /*
   * 저장된 피부 프로필(고민·가용 시간)로 시작한다 — 다시 만들 때마다 같은 내용을
   * 다시 적게 하지 않는다(I3). 기타 루틴은 "내 고민"에 등록한 문장이 여기로 온다.
   * `null` 이 "아직 손대지 않음"이다. `useEffect` 로 채우면 프로필이 늦게
   * 도착했을 때 사용자가 입력하던 내용을 덮어쓴다.
   */
  const profile = useSkinProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const wonder = draft ?? profile.value?.wonder ?? "";

  const [morningDraft, setMorning] = useState<string | null>(null);
  const [eveningDraft, setEvening] = useState<string | null>(null);
  const morning =
    morningDraft ?? timeOption(profile.value?.usableTime.morning, "5분");
  const evening =
    eveningDraft ?? timeOption(profile.value?.usableTime.evening, "10분");

  /*
   * 저장이 condition 단위 교체라 같은 condition 의 루틴이 이미 있으면 **통째로 바뀐다**(m24④).
   * 단계 편집·오늘 완료·이번 주 달성률이 새 루틴 기준으로 다시 시작되므로 제출 전에 알린다.
   */
  const condition = focus ? ROUTINE_CONDITION.focus : ROUTINE_CONDITION.basic;
  const routines = useRoutines();
  const replacing = routines.value.some(
    (routine) => routine.condition === condition,
  );

  /** 선반이 비었으면 폼을 보여줄 이유가 없다. `null` 은 "아직 서버 응답 전". */
  const products = useProducts();
  const shelfCount = products.ready ? products.value.length : null;

  const { status, error, saved, generate, reset, canRetrySave, retrySave } =
    useRoutineGenerate();
  const working = status === "working";
  // '저장 다시 시도' 중에도 입력을 잠근다 — 오버레이는 AI 생성 중에만 띄운다(저장은 짧다).
  const busy = working || status === "saving";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generate({
      wonder,
      usableTime: { morning, evening },
      condition,
    });
  }

  /*
   * 선반을 못 불러온 것과 "제품이 없다"는 다르다 — 구분하지 않으면 네트워크 실패가
   * "제품을 먼저 등록하세요"로 잘못 안내된다.
   * 로딩 중(`shelfCount === null`)에는 폼을 그대로 보여준다. 입력을 미리 할 수 있고,
   * 제출 시점에 `useRoutineGenerate` 가 목록이 왔는지 다시 확인한다.
   */
  if (products.error) {
    return (
      <DataState
        error
        onRetry={products.retry}
        label="제품 목록"
        message={products.errorMessage}
      />
    );
  }

  if (shelfCount === 0) {
    return (
      <section className={styles.empty} role="status">
        <Icon name="inventory_2" filled className={styles.emptyIcon} />
        <h2 className={styles.heading}>먼저 제품을 등록해 주세요</h2>
        <p className={styles.lead}>
          루틴은 보유한 제품으로만 만듭니다.
          <br />
          선반이 비어 있으면 AI 가 쓸 재료가 없어요.
        </p>
        <Link className={styles.cta} href="/scan">
          <Icon name="add_circle" filled size="sm" />내 선반에 추가하기
        </Link>
      </section>
    );
  }

  if (status === "done" && saved.length > 0) {
    return (
      <section className={styles.result} role="status">
        <div className={styles.resultHead}>
          <p className={styles.resultTitle}>
            <Icon name="check_circle" filled size="sm" />
            {focus ? "기타 루틴을 만들었어요" : "루틴을 만들었어요"}
          </p>
          <Link className={styles.cta} href="/routine">
            <Icon name="check_circle" filled size="sm" />
            루틴 보러 가기
          </Link>
        </div>

        {saved.map((routine) => (
          <article key={routine.id} className={styles.routine}>
            <header className={styles.routineHead}>
              <h2 className={styles.routineName}>{routine.name}</h2>
              <span className={styles.routineSummary}>{routine.summary}</span>
            </header>

            <ol className={styles.steps}>
              {routine.steps.map((step, index) => (
                <li key={step.id} className={styles.step}>
                  <span className={styles.stepIndex}>{index + 1}</span>
                  <div className={styles.stepBody}>
                    <p className={styles.stepName}>{step.routineName}</p>
                    {/*
                      using_product 는 id 가 아니라 이름 문자열이다. 저장된 제품과
                      매칭되지 않을 수 있으므로 여기서는 이름을 그대로 보여준다 —
                      못 찾았다고 단계를 숨기면 사용자가 이유를 알 수 없다.
                    */}
                    {step.usingProduct.length > 0 && (
                      <p className={styles.stepProduct}>
                        {step.usingProduct.join(" + ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </article>
        ))}

        <div className={styles.resultActions}>
          <button type="button" className={styles.again} onClick={reset}>
            다시 만들기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.intro}>
        <h2 className={styles.heading}>
          {focus ? "기타 루틴을 만들게요" : "어떤 피부 고민이 있나요?"}
        </h2>
        <p className={styles.lead}>
          고민과 쓸 수 있는 시간을 알려 주면, 등록한 제품
          {shelfCount === null ? "" : ` ${shelfCount}개`}로 아침·저녁{" "}
          {focus ? "기타 루틴을" : "루틴을"} 짜 드려요.
          {/* 조건 단위 교체라 기본 루틴은 남는다. 안 알려 주면 덮어쓸까 봐 안 만든다. */}
          {focus && (
            <>
              <br />
              기본 루틴은 그대로 두고 따로 저장돼요.
            </>
          )}
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={wonderId}>
            피부 고민 <span className={styles.required}>필수</span>
          </label>
          <textarea
            id={wonderId}
            className={styles.textarea}
            value={wonder}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 볼은 건조한데 T존은 번들거려요. 트러블 자국도 신경 쓰여요."
            rows={4}
            required
            disabled={busy}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={morningId}>
              아침에 쓸 수 있는 시간
            </label>
            <select
              id={morningId}
              className={styles.select}
              value={morning}
              onChange={(e) => setMorning(e.target.value)}
              disabled={busy}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={eveningId}>
              저녁에 쓸 수 있는 시간
            </label>
            <select
              id={eveningId}
              className={styles.select}
              value={evening}
              onChange={(e) => setEvening(e.target.value)}
              disabled={busy}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {replacing && (
          <p className={styles.replaceNotice}>
            <Icon name="info" size="sm" />
            <span>
              지금 {focus ? "기타" : "기본"} 루틴이 새 루틴으로 바뀌어요. 편집한
              단계도 사라지고, 오늘 완료와 이번 주 달성률은 새 루틴 기준으로
              다시 세요. 지난 수행 기록은 남아요.
            </span>
          </p>
        )}

        {/* 진행 표시는 전면 오버레이(AIWorkingOverlay)가 맡는다 — 버튼은 잠그기만 한다. */}
        <button className={styles.submit} type="submit" disabled={busy}>
          <Icon name="auto_awesome" filled />
          루틴 만들기
        </button>
      </form>

      {working && <AIWorkingOverlay focus={focus} />}

      {status === "error" && error && (
        <p className={styles.error} role="alert">
          <Icon name="error" size="sm" />
          {error}
        </p>
      )}

      {/* 생성은 됐고 저장만 실패했다 — AI 재호출(90초) 없이 같은 결과를 다시 보낸다(r4 m27). */}
      {canRetrySave && (
        <button
          type="button"
          className={styles.submit}
          onClick={retrySave}
          disabled={status === "saving"}
        >
          <Icon name="refresh" />
          {status === "saving" ? "저장 중…" : "만든 루틴 다시 저장하기"}
        </button>
      )}
    </section>
  );
}
