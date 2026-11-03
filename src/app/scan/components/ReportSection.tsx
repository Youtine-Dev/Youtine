"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Icon } from "@/components/Icon";
import { IngredientChip } from "@/components/IngredientChip/IngredientChip";
import { IngredientDetailModal } from "@/components/IngredientDetail/IngredientDetailModal";
import { IngredientProducts } from "@/components/IngredientProducts/IngredientProducts";
import { ApiError } from "@/api/client";
import { generateShelfReport, useProducts, useShelfReport } from "@/lib/data";
import { SKIN_TYPES } from "@/lib/prompts/interactions";
import { realWarnings } from "@/lib/warnings";
import type { IngredientPair } from "@/api/ai";
import type { Product } from "@/types/skincare";

import card from "../../(home)/components/card.module.css";
import styles from "./ReportSection.module.css";
import { labelCaptureHref } from "./ScanTabs";

/** 2개 이상 제품에 공통으로 들어간 성분 — 상위 3개만 인사이트로 보여준다. */
function sharedIngredients(
  products: readonly Product[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    // 한 제품 안에서 중복 표기됐을 수 있어 Set 으로 한 번만 센다.
    for (const ingredient of new Set(product.ingredients)) {
      counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));
}

/**
 * 주의사항 문장이 **어느 성분 이야기인지** 찾는다.
 *
 * `warning` 은 프롬프트상 그냥 `string[]` 이라 성분과 설명이 나뉘어 있지 않다.
 * 다만 규칙 3 이 "성분과 무관한 일반론 금지"를 요구하므로 문장 안에 성분명이 들어 있다.
 * 그 제품의 `ingredients` 중 문장에 등장하는 것을 골라 제목으로 쓴다.
 *
 * ⚠️ **못 찾으면 빈 배열이다 — 성분을 지어내지 않는다.** 규칙 6 의 "성분 정보가 부족하여…"
 * 같은 문장은 어느 성분에도 속하지 않으므로 설명만 보여 준다.
 */
function mentionedIngredients(
  warning: string,
  ingredients: readonly string[],
): string[] {
  // 한 글자 성분명은 아무 문장에나 걸린다.
  const found = ingredients.filter(
    (name) => name.length >= 2 && warning.includes(name),
  );
  // "판테놀"이 "디판테놀" 안에 들어 있는 식의 겹침은 긴 쪽만 남긴다.
  return [
    ...new Set(
      found.filter((a) => !found.some((b) => b !== a && b.includes(a))),
    ),
  ];
}

type WarningLine = { key: string; ingredients: string[]; text: string };
type ProductWarnings = { id: string; name: string; lines: WarningLine[] };

/**
 * 제품별로 묶는다. 예전에는 "제품명 — 주의사항" 한 줄씩 평평하게 늘어놓아
 * 같은 제품이 반복되고 무엇이 성분이고 무엇이 설명인지 구분되지 않았다.
 *
 * `warnings` 는 지연 생성이라 optional 이다(useIngredientAlerts.ts 와 같은 계약).
 * 아직 안 만들어진 제품은 "주의 성분 없음"으로 지어내지 않고 그냥 집계에서 뺀다.
 * "성분 정보 부족" 고정 문구도 뺀다 — 경고가 아니라 안내다(m27).
 */
function warningsByProduct(products: readonly Product[]): ProductWarnings[] {
  return products
    .map((product) => ({
      id: product.id,
      name: product.productName,
      lines: realWarnings(product.warnings ?? []).map((text, index) => ({
        key: `${product.id}-${index}`,
        ingredients: mentionedIngredients(text, product.ingredients),
        text,
      })),
    }))
    .filter((item) => item.lines.length > 0);
}

type SubTab = "summary" | "types" | "synergy";

const SUB_TABS: readonly { id: SubTab; label: string }[] = [
  { id: "summary", label: "종합" },
  { id: "types", label: "피부 타입별" },
  { id: "synergy", label: "시너지·궁합" },
];

/** 최초 생성은 1~2분 — 이 시점부터 "정상"이라고 알려야 사용자가 안 떠난다. */
const LONG_WAIT_SECONDS = 20;

/** 429(이전 요청 진행 중)일 때 캐시를 다시 볼 때까지의 간격. */
const BUSY_RECHECK_MS = 15_000;

/**
 * AI 분석 리포트 — 세 하위 탭.
 *
 *  - 종합: 저장된 `ingredients`·`warnings` 집계(AI 호출 없음, 즉시)
 *  - 피부 타입별 / 시너지·궁합: 선반 상호작용 분석 결과. **캐시만 자동으로 읽는다.**
 *
 * AI 생성은 헤더 오른쪽 **분석하기 버튼으로만** 시작한다(사용자 결정 2026-08-20).
 * 버튼은 "아직 분석 전"(최초 1회)이거나 **제품이 담기고 빠져 지문이 어긋났을 때**
 * 자연히 나타난다 — 캐시 전용 조회가 `null` 을 주기 때문이다. 분석이 최신이면 없다.
 */
export function ReportSection({
  active,
}: {
  /**
   * 이 패널이 현재 탭인지. hidden 뒤에서 모달이 살아 있으면 스크롤 락이 안 풀린다(M6).
   * `scan/page.tsx` 가 탭 패널을 `hidden` 으로만 토글하고 언마운트하지 않기 때문에,
   * 이 prop 없이 렌더하면 다른 탭으로 옮겨도 `useBodyScrollLock` 이 살아남아
   * 네 탭 전부 스크롤이 잠긴다. 형제인 ShelfSection 과 같은 이유·같은 패턴이다.
   */
  active: boolean;
}) {
  const { ready, value: products, error, errorMessage, retry } = useProducts();

  const [subTab, setSubTab] = useState<SubTab>("summary");
  const report = useShelfReport(); // 캐시 전용 — AI 를 태우지 않는다
  /** "아직 분석 전"(null) — 분석하기 버튼이 뜨는 조건이다. */
  const analyzed = report.ready && !report.error && report.value !== null;

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      await generateShelfReport(products);
      // 결과 탭이 보이게 옮겨 준다 — 종합 탭에서 눌렀으면 결과가 안 보인다.
      setSubTab((tab) => (tab === "summary" ? "synergy" : tab));
    } catch (cause: unknown) {
      /*
       * 429 = 이 사용자의 이전 요청이 아직 돈다(분석 중 새로고침 등, m23). 다시 눌러도 429 뿐이니
       * 기다렸다가 캐시를 다시 본다 — 앞 분석이 끝났으면 그 결과가 뜨고, 아니면 버튼이 남는다.
       */
      if (cause instanceof ApiError && cause.status === 429) {
        setGenerateError(
          "이전 분석이 아직 진행 중이에요. 잠시 후 결과를 다시 확인할게요.",
        );
        setTimeout(report.retry, BUSY_RECHECK_MS);
      } else if (cause instanceof ApiError) {
        const body = cause.body as { message?: string } | null;
        setGenerateError(
          body?.message ?? `분석하지 못했어요 (${cause.status})`,
        );
      } else {
        setGenerateError("분석하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setGenerating(false);
    }
  }

  // 진행 표시 — 스피너만 돌면 멈춘 줄 안다(RoutineForm 과 같은 이유·같은 방식).
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!generating) return;
    const startedAt = Date.now();
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [generating]);

  /** 시너지 탭에서 펼친 추천 성분. 하나만 연다(ConcernSection 과 같은 이유). */
  const [expanded, setExpanded] = useState<string | null>(null);
  /** 성분 상세 모달. 칩을 누르면 그 성분의 공유 지식이 뜬다. */
  const [detail, setDetail] = useState<string | null>(null);

  if (!ready) return <DataState loading label="제품" />;
  if (error)
    return (
      <DataState error onRetry={retry} label="제품" message={errorMessage} />
    );

  const uniqueIngredientCount = new Set(
    products.flatMap((product) => product.ingredients),
  ).size;
  const shared = sharedIngredients(products);
  const flagged = warningsByProduct(products);
  // 성분이 없으면 주의 성분을 판정할 수 없다 — '없음'(초록 체크)으로 읽히지 않게 따로 센다(m3).
  const missing = products.filter(
    (product) => product.ingredients.length === 0,
  );

  const selectTab = (id: SubTab) => setSubTab(id);

  /**
   * 충돌·시너지 공용 목록. 계약상 빈 배열이 정상이라 빈 문구를 밖에서 받는다.
   * 순서는 **제품 → 성분 → 설명** — 종합 탭의 자극 우려 목록과 같은 구조로
   * 통일한다(사용자 결정 2026-08-20 Q2).
   */
  const pairList = (pairs: IngredientPair[], empty: string) =>
    pairs.length === 0 ? (
      <p className={styles.groupEmpty}>{empty}</p>
    ) : (
      <ul className={styles.pairList}>
        {pairs.map((pair) => (
          <li key={pair.ingredients.join("+")} className={styles.pairItem}>
            {pair.products.length > 0 && (
              <p className={styles.pairProducts}>{pair.products.join(" · ")}</p>
            )}
            <p className={styles.pairChips}>
              {pair.ingredients.map((name) => (
                <IngredientChip
                  key={name}
                  name={name}
                  onSelect={() => setDetail(name)}
                />
              ))}
            </p>
            <p className={styles.desc}>{pair.description}</p>
          </li>
        ))}
      </ul>
    );

  /** 분석 데이터가 필요한 패널의 공통 게이트(진행·실패·분석 전). 통과하면 내용을 그린다. */
  const analysisGate = (content: () => React.ReactNode) => {
    if (generating) {
      return (
        <div className={styles.generating} role="status">
          <Icon name="progress_activity" className={styles.spinner} />
          <p className={styles.generatingText}>
            선반의 성분 조합을 분석하는 중이에요… {elapsed}초
          </p>
          {elapsed >= LONG_WAIT_SECONDS && (
            <p className={styles.generatingHint}>
              제품 조합을 하나씩 따져 보는 중이에요.
              <br />
              처음 한 번만 1~2분 걸리고, 선반이 그대로면 다음부터는 바로
              열립니다.
            </p>
          )}
        </div>
      );
    }
    // 보유 성분 0종이면 분석할 게 없다(m20) — 빈 캐시가 있어도 '확인된 조합 없음'으로 보이면 안 된다.
    if (uniqueIngredientCount === 0) {
      return (
        <p className={styles.groupEmpty}>
          등록한 제품에 성분 정보가 없어요.
          <br />
          성분표를 촬영하면 분석할 수 있어요.
        </p>
      );
    }
    if (report.error) {
      return (
        <DataState
          error
          onRetry={report.retry}
          label="분석"
          message={report.errorMessage}
        />
      );
    }
    if (!analyzed) {
      /* 분석 전(또는 선반이 바뀌어 캐시가 어긋남) — AI 는 버튼으로만 시작한다. */
      return (
        <p className={styles.groupEmpty}>
          아직 분석 전이에요.
          <br />
          위의 <strong>분석하기</strong> 버튼을 누르면 선반 전체의 성분 조합을
          살펴봐 드려요.
        </p>
      );
    }
    return content();
  };

  return (
    <section className={`${card.card} ${styles.section}`}>
      {/* key 로 리마운트 — 다른 성분을 열면 그 성분부터 시작한다.
          active 일 때만 렌더(M6) — hidden 뒤에 남으면 useBodyScrollLock 이 페이지 전체를 잠근다.
          detail 상태는 유지하므로 탭에 돌아오면 모달이 다시 뜬다. */}
      {active && detail && (
        <IngredientDetailModal
          key={detail}
          name={detail}
          onClose={() => setDetail(null)}
        />
      )}

      <div className={styles.header}>
        <span className={styles.badge}>
          <Icon name="science" />
        </span>
        <div className={styles.headerText}>
          <h2 className={card.cardTitle}>AI 분석 리포트</h2>
          <p className={`${card.label} ${styles.subtitle}`}>
            {products.length === 0
              ? "등록한 제품이 없어요"
              : `등록 제품 ${products.length}개 · 성분 ${uniqueIngredientCount}종`}
          </p>
        </div>

        {/*
          분석하기 — 최초 1회, 그리고 제품이 담기고 빠져 캐시 지문이 어긋나면
          자연히 다시 나타난다(캐시 전용 조회가 null 을 주므로). 최신이면 없다.
        */}
        {products.length > 0 && report.ready && !analyzed && (
          <button
            type="button"
            className={styles.analyze}
            onClick={handleGenerate}
            // 성분 0종은 AI 가 볼 게 없다(m20) — 이유는 분석 탭·종합의 안내가 말한다.
            disabled={generating || uniqueIngredientCount === 0}
          >
            {generating ? (
              <>
                <Icon
                  name="progress_activity"
                  size="sm"
                  className={styles.spinner}
                />
                분석 중… {elapsed}초
              </>
            ) : (
              <>
                <Icon name="auto_awesome" filled size="sm" />
                분석하기
              </>
            )}
          </button>
        )}
      </div>

      {/* 분석 결과가 생기면(재확인 성공 포함) 앞선 실패 안내는 낡은 것이다. */}
      {generateError && !analyzed && (
        <p className={styles.generateError} role="alert">
          <Icon name="error" size="sm" />
          {generateError}
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon="science"
          title="분석할 제품이 없어요"
          text="제품을 등록하면 성분·시너지·주의사항을 모아서 보여드려요."
          ctaHref="/scan?tab=add"
          ctaLabel="제품 등록하기"
        />
      ) : (
        <>
          {/*
            하위 세그먼트 — ScanTabs 의 밑줄 패턴을 따른다(DESIGN.md 에 탭 규정이 없어
            코드베이스 선례가 정본이다). URL 에 올리지 않는 이유: 리포트는 이미
            `/scan?tab=report` 안이고, 한 단계 더 딥링크할 필요가 확인되지 않았다.
          */}
          <div className={styles.subTabs}>
            {SUB_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={
                  id === subTab
                    ? `${styles.subTab} ${styles.subTabActive}`
                    : styles.subTab
                }
                aria-pressed={id === subTab}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {subTab === "summary" && (
            <>
              {shared.length > 0 && (
                <div className={styles.block}>
                  <h3 className={styles.blockTitle}>자주 쓰는 성분</h3>
                  <ul className={styles.sharedList}>
                    {shared.map((item) => (
                      <li key={item.name} className={styles.sharedItem}>
                        <span className={styles.sharedName}>{item.name}</span>
                        <span className={styles.sharedCount}>
                          {item.count}개 제품
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {flagged.length === 0 ? (
                missing.length === 0 && (
                  <p className={styles.safe}>
                    <Icon
                      name="check_circle"
                      size="sm"
                      filled
                      className={styles.safeIcon}
                    />
                    등록한 제품에서 확인된 주의 성분이 없어요.
                  </p>
                )
              ) : (
                <div className={styles.block}>
                  <h3 className={`${styles.blockTitle} ${styles.alertTitle}`}>
                    <Icon name="warning" size="sm" filled />
                    자극 우려 성분
                  </h3>

                  {flagged.map((product) => (
                    <article key={product.id} className={styles.product}>
                      <h4 className={styles.productName}>{product.name}</h4>

                      <ul className={styles.lines}>
                        {product.lines.map((line) => (
                          <li key={line.key} className={styles.line}>
                            {/* 성분을 특정하지 못한 문장은 제목 없이 설명만 보여 준다 */}
                            {line.ingredients.length > 0 && (
                              <p className={styles.ingredient}>
                                {line.ingredients.join(" · ")}
                              </p>
                            )}
                            <p className={styles.desc}>{line.text}</p>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}

                  <Link
                    href="/scan?tab=popular"
                    className={`${card.label} ${styles.alertCta}`}
                  >
                    대체 제품 찾기
                  </Link>
                </div>
              )}

              {/* 홈 성분 알림과 같은 문구. 한 개면 그 제품으로 폼을 채워 카메라를 연다(m21 과 같은 길) —
                  손으로 이름을 다시 치면 글자가 달라 별도 행이 된다. */}
              {missing.length > 0 && (
                <div>
                  <p className={styles.safe}>
                    <Icon
                      name="info"
                      size="sm"
                      filled
                      className={styles.safeIcon}
                    />
                    성분 정보가 없는 제품 {missing.length}개는 확인하지
                    못했어요. 성분표를 촬영하면 주의 성분을 알려드려요.
                  </p>
                  <Link
                    href={
                      missing.length === 1
                        ? labelCaptureHref(missing[0])
                        : "/scan?tab=add"
                    }
                    className={`${card.label} ${styles.photoCta}`}
                  >
                    <Icon name="photo_camera" size="sm" filled />
                    성분표 촬영하기
                  </Link>
                </div>
              )}
            </>
          )}

          {subTab === "types" &&
            analysisGate(() => {
              const cautions = report.value?.skin_type_cautions ?? [];
              return (
                <>
                  {cautions.length === 0 ? (
                    /* 빈 배열은 실패가 아니다(규칙 2) — 확신할 주의점이 없다는 답이다. */
                    <p className={styles.groupEmpty}>
                      보유 성분 중 피부 타입별로 특별히 주의할 것이 확인되지
                      않았어요.
                    </p>
                  ) : (
                    SKIN_TYPES.map((type) => {
                      const items = cautions.filter(
                        (item) => item.skin_type === type,
                      );
                      if (items.length === 0) return null;
                      return (
                        <div key={type} className={styles.block}>
                          <h3 className={styles.blockTitle}>{type} 피부</h3>
                          <ul className={styles.pairList}>
                            {items.map((item) => (
                              <li
                                key={`${type}-${item.ingredient}`}
                                className={styles.pairItem}
                              >
                                <p className={styles.pairChips}>
                                  <IngredientChip
                                    name={item.ingredient}
                                    onSelect={() => setDetail(item.ingredient)}
                                  />
                                </p>
                                {item.products.length > 0 && (
                                  <p className={styles.pairProducts}>
                                    {item.products.join(" · ")}
                                  </p>
                                )}
                                <p className={styles.desc}>{item.caution}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })
                  )}
                  <p className={styles.disclaimer}>
                    일반적인 정보이며 의학적 조언이 아닙니다.
                    <br />
                    피부 질환이 의심되면 전문의와 상담하세요.
                  </p>
                </>
              );
            })}

          {subTab === "synergy" &&
            analysisGate(() => {
              const conflicts = report.value?.conflicts ?? [];
              const synergies = report.value?.synergies ?? [];
              const suggestions = report.value?.suggestions ?? [];
              return (
                <>
                  <div className={styles.block}>
                    <h3 className={`${styles.blockTitle} ${styles.alertTitle}`}>
                      <Icon name="warning" size="sm" filled />
                      같이 쓰면 주의
                    </h3>
                    {pairList(
                      conflicts,
                      "보유 제품 사이에 충돌로 알려진 조합이 확인되지 않았어요.",
                    )}
                  </div>

                  <div className={styles.block}>
                    <h3 className={styles.blockTitle}>
                      <Icon name="handshake" size="sm" filled />
                      같이 쓰면 좋음
                    </h3>
                    {pairList(
                      synergies,
                      "보유 제품 사이에 시너지로 알려진 조합이 확인되지 않았어요.",
                    )}
                  </div>

                  {suggestions.length > 0 && (
                    <div className={styles.block}>
                      <h3 className={styles.blockTitle}>
                        <Icon name="add_circle" size="sm" filled />
                        이런 성분을 더하면 좋아요
                      </h3>
                      <ul className={styles.suggestionList}>
                        {suggestions.map((item) => {
                          const open = expanded === item.ingredient;
                          return (
                            <li
                              key={item.ingredient}
                              className={styles.suggestionItem}
                            >
                              {/* 펼칠 때만 제품을 조회한다(ConcernSection 과 같은 이유). */}
                              <button
                                type="button"
                                className={styles.suggestionHead}
                                onClick={() =>
                                  setExpanded(open ? null : item.ingredient)
                                }
                                aria-expanded={open}
                              >
                                <span className={styles.suggestionText}>
                                  <IngredientChip name={item.ingredient} />
                                  <span className={styles.desc}>
                                    {item.reason}
                                  </span>
                                </span>
                                <Icon
                                  name={open ? "expand_less" : "expand_more"}
                                  className={styles.chevron}
                                />
                              </button>
                              {open && (
                                <IngredientProducts
                                  ingredient={item.ingredient}
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <p className={styles.disclaimer}>
                    일반적인 정보이며 의학적 조언이 아닙니다.
                    <br />새 성분은 소량으로 먼저 테스트해 보세요.
                  </p>
                </>
              );
            })}
        </>
      )}
    </section>
  );
}
