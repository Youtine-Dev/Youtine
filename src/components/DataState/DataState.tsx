"use client";

import { Icon } from "@/components/Icon";

import styles from "./DataState.module.css";

/**
 * 서버 데이터의 로딩·실패 상태.
 *
 * localStorage 시절에는 읽기가 즉시 끝나서 이 자리가 필요 없었다. 네트워크가 끼면
 * **수백 ms~수 초** 동안 아무것도 그리지 않게 되고, 실패하면 "데이터 없음"과 구분이 안 된다.
 * 빈 상태 문구는 화면마다 다르지만 이 둘은 같아도 되므로 한 곳에 모은다.
 */
type Props = {
  /** 아직 불러오는 중 */
  loading?: boolean;
  /** 불러오지 못했다 */
  error?: boolean;
  onRetry?: () => void;
  /** 무엇을 못 불러왔는지. 예: "루틴" → "루틴 불러오지 못했어요"(조사는 붙이지 않는다) */
  label?: string;
  /**
   * 서버가 준 실패 사유(`Resource.errorMessage`). 있으면 기본 안내를 대신한다.
   *
   * 없을 때만 "인터넷 연결을 확인해 주세요"를 쓴다 — 429("이미 처리 중")처럼
   * 연결과 무관한 실패까지 그렇게 안내하면 사용자가 엉뚱한 데를 고치려 든다.
   */
  message?: string | null;
};

export function DataState({ loading, error, onRetry, label, message }: Props) {
  if (loading) {
    return (
      // aria-live 로 알리면 짧은 로딩에도 스크린리더가 매번 말한다. 존재만 알린다.
      <p className={styles.loading} role="status">
        {/*
          도는 것이 있어야 "멈춘 화면"과 구분된다. 글자만 흐려졌다 진해지는 것으로는
          부족하다 — AI 성분 추천은 10~30초가 걸린다. 레포의 다른 대기 화면
          (ProductForm·RoutineForm 등)이 쓰는 것과 같은 아이콘·같은 회전이다.
        */}
        <Icon name="progress_activity" size="sm" className={styles.spinner} />
        {/* 조사 없이 쓴다 — "성분을(를)" 처럼 자리표시가 화면에 그대로 나왔다(3라운드 m33). */}
        {label ? `${label} 불러오는 중…` : "불러오는 중…"}
      </p>
    );
  }

  if (!error) return null;

  return (
    <section className={styles.error} role="alert">
      <Icon name="cloud_off" className={styles.icon} />
      <p className={styles.text}>
        {label ? `${label} 불러오지 못했어요.` : "불러오지 못했어요."}
        <br />
        {message ?? "인터넷 연결을 확인해 주세요."}
      </p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          <Icon name="refresh" size="sm" />
          다시 시도
        </button>
      )}
    </section>
  );
}
