"use client";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { SentenceBreak } from "@/components/SentenceBreak";

import { useIngredientAlerts } from "../hooks/useIngredientAlerts";

import card from "./card.module.css";
import styles from "./IngredientAlerts.module.css";

/**
 * 등록 제품의 주의사항(`Product.warnings`)을 취합해 보여준다.
 * 실데이터 취합·지연 생성은 `useIngredientAlerts` 훅이 담당한다.
 */
export function IngredientAlerts() {
  const state = useIngredientAlerts();

  return (
    <section className={card.card}>
      {/* 누를 수 없는 info 아이콘이 있었다 — 동작 없는 장식이라 뺐다(3라운드 I14). */}
      <div className={styles.header}>
        <h2 className={card.cardTitle}>성분 알림</h2>
      </div>

      {/* 제품 목록을 불러오는 짧은 순간뿐이다 — 이제 홈에서 AI 생성을 하지 않는다. */}
      {state.kind === "checking" && (
        <p className={styles.status} role="status">
          <Icon name="progress_activity" className={styles.spinner} />
          성분 주의사항을 불러오고 있어요.
        </p>
      )}

      {/* 제품 목록을 못 불러온 것과 "제품이 없다"는 다르다 — 구분하지 않으면
          네트워크 실패가 "제품을 등록하세요"로 잘못 안내된다. */}
      {state.kind === "error" && (
        <DataState
          error
          onRetry={state.retry}
          label="성분 알림"
          message={state.errorMessage}
        />
      )}

      {state.kind === "no-products" && (
        <p className={styles.status}>
          등록된 제품이 없어요.
          <br />
          제품을 등록하면 주의사항을 알려드려요.
        </p>
      )}

      {state.kind === "no-warnings" && (
        <p className={styles.status}>
          {/* 분석 중인데 체크(완료) 아이콘이면 "끝났다"로 읽힌다(3라운드 I14). */}
          <Icon
            name={state.pendingCount > 0 ? "hourglass_top" : "check_circle"}
            filled
          />
          {state.pendingCount > 0 ? (
            <SentenceBreak
              text={`${state.pendingCount}개 제품을 분석하고 있어요. 끝나면 여기에 표시됩니다.`}
            />
          ) : (
            "등록한 제품에 특별한 주의사항이 없어요."
          )}
        </p>
      )}

      {state.kind === "ready" && (
        <>
          <ul className={styles.list}>
            {state.alerts.map((alert) => (
              <li key={alert.id} className={styles.item}>
                <Icon name="warning" className={styles.itemIcon} />
                <div>
                  <h3 className={`${card.label} ${styles.itemTitle}`}>
                    {alert.productName}
                  </h3>
                  <p className={styles.itemDetail}>{alert.warning}</p>
                </div>
              </li>
            ))}
          </ul>
          {/* 분석은 등록 시점에 서버가 백그라운드로 한다 — 아직 안 끝난 제품만 알린다. */}
          {state.pendingCount > 0 && (
            <p className={styles.status}>
              {state.pendingCount}개 제품은 아직 분석 중이에요.
            </p>
          )}
        </>
      )}
    </section>
  );
}
