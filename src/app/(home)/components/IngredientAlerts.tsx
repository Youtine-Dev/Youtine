"use client";

import { useState } from "react";

import { PopularProductModal } from "@/app/scan/components/PopularProductModal";
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
  // id 로 들고 있다 — 재검증으로 그 제품이 목록에서 빠지면 모달도 저절로 닫힌다.
  const [openId, setOpenId] = useState<string | null>(null);
  const opened =
    state.kind === "ready"
      ? state.alerts.find((alert) => alert.product.id === openId)
      : undefined;

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
          {/* 분석 중인데 체크(완료) 아이콘이면 "끝났다"로 읽힌다(3라운드 I14).
              성분이 없어 분석을 못 한 제품도 체크면 "안전"으로 읽힌다(4라운드 m3). */}
          <Icon
            name={
              state.pendingCount > 0
                ? "hourglass_top"
                : state.noIngredientCount > 0
                  ? "info"
                  : "check_circle"
            }
            filled
          />
          {state.pendingCount > 0 ? (
            <SentenceBreak
              text={`${state.pendingCount}개 제품을 분석하고 있어요. 끝나면 여기에 표시됩니다.`}
            />
          ) : state.noIngredientCount > 0 ? (
            `성분 정보가 없는 제품 ${state.noIngredientCount}개 — 성분표를 촬영하면 주의사항을 알려드려요.`
          ) : (
            "등록한 제품에 특별한 주의사항이 없어요."
          )}
        </p>
      )}

      {state.kind === "ready" && (
        <>
          {/*
            홈엔 요약(제품·건수)만 두고 누르면 모달로 연다. 제자리에서 펼치면(details) 접을 때
            페이지가 줄어 스크롤이 당겨지고, 바로 위 '다음 단계' 버튼이 멈춘 마우스 밑으로
            밀려 들어와 hover 색으로 바뀌었다(2026-11-02 재현). 모달은 페이지 높이를 안 바꾼다.
          */}
          <ul className={styles.list}>
            {state.alerts.map(({ product, warnings }) => (
              <li key={product.id}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => setOpenId(product.id)}
                  aria-haspopup="dialog"
                >
                  <Icon name="warning" className={styles.itemIcon} />
                  <span className={styles.itemTitle}>
                    {product.productName}
                  </span>
                  <span className={styles.count}>주의 {warnings.length}</span>
                  <Icon name="chevron_right" className={styles.chevron} />
                </button>
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

      {/* 스캔 › 선반에서 여는 것과 같은 제품 상세 모달(사용자 요청 2026-11-02) —
          전부 내 선반 제품이라 선반과 똑같이 alreadyOnShelf(담기 대신 빼기). */}
      {opened && (
        <PopularProductModal
          product={opened.product}
          onClose={() => setOpenId(null)}
          alreadyOnShelf
        />
      )}
    </section>
  );
}
