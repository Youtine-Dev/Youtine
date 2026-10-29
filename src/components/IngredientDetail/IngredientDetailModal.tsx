"use client";

import { useEffect, useRef, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { IngredientChip } from "@/components/IngredientChip/IngredientChip";
import { IngredientProducts } from "@/components/IngredientProducts/IngredientProducts";
import { useIngredientKnowledge } from "@/lib/data";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useModalFocus } from "@/lib/useModalFocus";

import styles from "./IngredientDetailModal.module.css";

/**
 * 성분 상세 모달 — 성분 하나의 공유 지식을 한 화면에 모은다:
 * 이런 고민에 도움 · 피부 타입별 주의 · 같이 쓰면 좋음/주의 · 이 성분이 든 제품.
 *
 * "그 성분은 무엇을 주의해야 하고 어떤 성분과 시너지가 있는지 알 수 있어야 한다"
 * (사용자 비전 2026-08-20)의 구현이다. **AI 를 부르지 않는다** — DB 지식(시드 +
 * 리포트 수확)만 읽어 즉시 뜬다.
 *
 * 파트너 칩을 누르면 **모달 안에서 그 성분으로 넘어간다** — 지식 사이를 걸어다니는
 * 것이 사전의 본질이라 모달을 닫았다 다시 열게 하지 않는다.
 */
export function IngredientDetailModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  /**
   * 지금 보고 있는 성분. 파트너 칩으로 갈아탈 수 있어 prop 과 분리된 state 다.
   * `name` 은 초기값으로만 쓴다 — **호출부가 `key={name}` 으로 리마운트**하므로
   * 다른 성분으로 다시 열면 자연히 그 성분부터 시작한다(동기화 effect 불필요).
   */
  const [current, setCurrent] = useState(name);
  const knowledge = useIngredientKnowledge(current);

  // 모달이 떠 있는 동안 배경 스크롤을 잠근다(모달 공통 규칙).
  useBodyScrollLock();

  /*
   * 열릴 때 포커스를 모달 안(닫기)으로 옮기고, Tab 을 시트 안에 가두고, 닫힐 때 열었던
   * 트리거로 복원한다(공용 훅, 3라운드 m31). 복원은 호출부가 여럿(ConcernDictionary·
   * ReportSection)이라 각자에게 맡기지 않고 모달이 직접 한다.
   */
  const closeRef = useRef<HTMLButtonElement>(null);
  /** 중첩 모달 판별용 — 이 시트 **안쪽**만 본다(바깥 형제 모달까지 세면 안 된다). */
  const sheetRef = useRef<HTMLDivElement>(null);
  useModalFocus(sheetRef, closeRef);

  // Esc 로 닫기 — 다른 모달 3종과 같은 규칙.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      /*
       * 시트 안에 다른 모달(제품 상세)이 떠 있으면 이 모달은 닫지 않는다(m9).
       * 자식 쪽에서 stopImmediatePropagation 을 해도 못 막는다 — 두 리스너가 같은
       * window 에 붙고 **부모가 먼저 등록돼 먼저 실행**되기 때문이다. 가드가 유일한 길이다.
       * 되돌리면 Esc 한 번에 둘 다 닫히고, 특히 자식이 "담는 중"일 때 부모가 닫히면
       * 자식이 언마운트돼 저장 실패를 사용자가 영영 못 본다.
       */
      if (sheetRef.current?.querySelector('[role="dialog"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const value = knowledge.value;
  const hasAny =
    value !== null &&
    value.helps.length +
      value.typeCautions.length +
      value.synergies.length +
      value.conflicts.length >
      0;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${current} 성분 정보`}
      onClick={onClose}
    >
      {/* 시트 안쪽 클릭이 overlay 로 새어 닫히지 않게 막는다 */}
      <div
        ref={sheetRef}
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.bar}>
          <h2 className={styles.title}>{current}</h2>
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

        <div className={styles.body}>
          {!knowledge.ready ? (
            <DataState loading label="성분 정보" />
          ) : knowledge.error ? (
            <DataState
              error
              onRetry={knowledge.retry}
              label="성분 정보"
              message={knowledge.errorMessage}
            />
          ) : !hasAny ? (
            /*
             * 빈 지식은 실패도, 나쁜 성분이라는 뜻도 아니다 — 아직 안 쌓였을 뿐이다.
             * 지식은 시드 + 리포트 수확으로 자라므로 그 사실을 그대로 말한다.
             */
            <p className={styles.empty}>
              아직 이 성분에 대해 쌓인 정보가 없어요.
              <br />
              분석 리포트가 만들어질 때마다 지식이 늘어납니다.
            </p>
          ) : (
            <>
              {value.helps.length > 0 && (
                <section className={styles.group}>
                  <h3 className={styles.groupTitle}>이런 고민에 도움</h3>
                  <ul className={styles.list}>
                    {value.helps.map((item) => (
                      <li key={item.scenario} className={styles.item}>
                        <p className={styles.itemHead}>{item.scenario}</p>
                        <p className={styles.desc}>{item.description}</p>
                        {item.caution && (
                          <p className={styles.caution}>
                            <Icon name="info" size="sm" />
                            {item.caution}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {value.typeCautions.length > 0 && (
                <section className={styles.group}>
                  <h3 className={`${styles.groupTitle} ${styles.warnTitle}`}>
                    피부 타입별 주의
                  </h3>
                  <ul className={styles.list}>
                    {value.typeCautions.map((item) => (
                      <li key={item.skinType} className={styles.item}>
                        <p className={styles.itemHead}>{item.skinType} 피부</p>
                        <p className={styles.desc}>{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {value.synergies.length > 0 && (
                <section className={styles.group}>
                  <h3 className={styles.groupTitle}>같이 쓰면 좋음</h3>
                  <ul className={styles.list}>
                    {value.synergies.map((item) => (
                      <li key={item.partner} className={styles.item}>
                        <p>
                          <IngredientChip
                            name={item.partner}
                            onSelect={() => setCurrent(item.partner)}
                          />
                        </p>
                        <p className={styles.desc}>{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {value.conflicts.length > 0 && (
                <section className={styles.group}>
                  <h3 className={`${styles.groupTitle} ${styles.warnTitle}`}>
                    같이 쓰면 주의
                  </h3>
                  <ul className={styles.list}>
                    {value.conflicts.map((item) => (
                      <li key={item.partner} className={styles.item}>
                        <p>
                          <IngredientChip
                            name={item.partner}
                            onSelect={() => setCurrent(item.partner)}
                          />
                        </p>
                        <p className={styles.desc}>{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* 지식 유무와 무관하게 제품으로 가는 길을 항상 연다 — 막다른 길 금지. */}
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>이 성분이 든 제품</h3>
            <IngredientProducts ingredient={current} />
          </section>

          <p className={styles.disclaimer}>
            일반적인 정보이며 의학적 조언이 아닙니다.
            <br />
            피부 질환이 의심되면 전문의와 상담하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
