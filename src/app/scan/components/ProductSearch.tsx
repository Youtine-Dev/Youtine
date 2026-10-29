"use client";

import { useEffect, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { useCatalogSearch, usePopularProducts } from "@/lib/data";
import type { Product } from "@/types/skincare";

import { POPULAR_PRODUCTS, searchProducts } from "../products";
import { PopularProductModal } from "./PopularProductModal";
import { ProductCard } from "./ProductCard";
import styles from "./ProductSearch.module.css";

/**
 * 제품 검색 + 인기 제품.
 *
 * **인기 제품은 서버 공유 카탈로그에서 온다** — 담긴 횟수 순이라 쓸수록 좋아진다
 * (계획서 Q2 결정). 성분·이미지가 이미 저장돼 있어 카드를 누르면 **AI 호출 없이 즉시** 열린다.
 *
 * ⚠️ 아직 아무도 담지 않았으면 카탈로그가 비어 있다. 그때는 **시드 24종**으로 폴백하는데,
 * 시드에는 성분도 이미지도 없다. 그래서 시드 카드는 상세를 열 수 없고 **등록 폼을 채운다**
 * (거기서 검색·성분 추출을 거쳐 담기면 그 제품이 카탈로그에 들어간다).
 */

/** 서버 검색은 입력이 이만큼 멈춘 뒤에만 부른다 — 글자마다 부르면 요청이 몰린다. */
const SEARCH_DEBOUNCE_MS = 250;

export function ProductSearch({
  active,
  onSelect,
}: {
  /** 이 패널이 현재 탭인지. hidden 뒤에서 모달이 살아 있으면 스크롤 락이 안 풀린다(M6). */
  active: boolean;
  /** 시드 카드를 고르면 등록 폼을 채운다. 시드에는 성분이 없어 폼을 반드시 거친다. */
  onSelect: (product: { name: string; brand: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Product | null>(null);
  const popular = usePopularProducts();

  /**
   * 카탈로그가 비었으면 시드로 폴백한다. 둘은 카드 클릭 동작이 다르다.
   *
   * ⚠️ **`ready`·`error` 를 먼저 봐야 한다.** 실패해도 `value` 는 빈 배열이라,
   * 안 보면 서버 장애가 "아직 아무도 안 담음"으로 위장돼 조용히 시드가 뜬다.
   */
  const catalog = popular.value;
  const useCatalog = catalog.length > 0;

  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  // 입력이 멈춘 뒤에만 서버를 부른다. setState 가 타이머 콜백 안이라 effect 동기 호출이 아니다.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [trimmed]);

  /*
   * ⭐ 검색 대상은 **둘**이다(m10). 카탈로그는 **서버에서 전체를** 찾는다(m26) —
   * 메모리의 인기 상위 12개만 거르면 방금 담은 제품도 "결과가 없습니다"가 된다.
   * 목록을 합치지 않고 나눠 두는 이유는 **클릭 동작이 다르기** 때문이다:
   * 카탈로그는 성분이 있어 상세 모달, 시드는 성분이 없어 등록 폼 프리필.
   */
  const found = useCatalogSearch(searching && debounced ? debounced : null);
  // 화면 검색어와 서버 검색어가 같고 응답이 왔을 때만 결과를 믿는다 — 아니면 "결과 없음"이 잠깐 거짓말을 한다.
  const settled = debounced === trimmed && found.ready;
  const catalogHits = searching ? found.value : [];
  // 같은 제품이 양쪽에 있으면 카탈로그만 남긴다 — 성분·이미지를 볼 수 있는 쪽이 낫다.
  const seedHits = searching
    ? searchProducts(trimmed).filter(
        (seed) =>
          !catalogHits.some((product) => product.productName === seed.name),
      )
    : [];
  const hitCount = catalogHits.length + seedHits.length;

  return (
    <>
      {/* active 일 때만 렌더(M6) — hidden 뒤에 남으면 useBodyScrollLock 이 페이지 전체를 잠근다.
          detail 상태는 유지하므로 탭에 돌아오면 모달이 다시 뜬다. */}
      {active && detail && (
        <PopularProductModal product={detail} onClose={() => setDetail(null)} />
      )}

      <div className={styles.searchBar}>
        <Icon name="search" className={styles.searchIcon} />
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제품명이나 브랜드를 검색하세요"
          aria-label="제품 검색"
        />
      </div>

      <section className={styles.results}>
        <h2 className={styles.heading}>
          {searching ? "검색 결과" : "인기 제품"}
          {searching && settled && !found.error && (
            <span className={styles.status}>{hitCount}개</span>
          )}
        </h2>

        {/*
          서버 검색이 아직 안 끝났으면 로딩을 보여 준다 — 안 그러면 아직 도착하지 않은
          카탈로그 제품이 "검색 결과 없음"으로 보인다(m10). 실패도 "없음"으로 뭉개지 않는다.
        */}
        {searching ? (
          !settled ? (
            <DataState loading label="제품" />
          ) : found.error ? (
            <DataState
              error
              onRetry={found.retry}
              label="검색 결과"
              message={found.errorMessage}
            />
          ) : hitCount === 0 ? (
            <p className={styles.empty}>
              검색 결과가 없습니다. &lsquo;등록&rsquo; 탭에서 이름으로
              찾아보세요.
            </p>
          ) : (
            <ul className={styles.grid}>
              {/* 카탈로그 히트 — 성분이 저장돼 있으니 그리드 카드와 같이 상세 모달을 연다. */}
              {catalogHits.map((product) => (
                <ProductCard
                  key={`catalog-${product.id}`}
                  name={product.productName}
                  note={product.productCompany}
                  image={product.image}
                  category={product.category}
                  onSelect={() => setDetail(product)}
                />
              ))}
              {/* 시드 히트 — 성분이 없어 상세를 열 수 없다. 등록 폼을 채운다. */}
              {seedHits.map((product) => (
                <ProductCard
                  key={`seed-${product.id}`}
                  name={product.name}
                  note={product.brand}
                  category={product.category}
                  onSelect={() =>
                    onSelect({ name: product.name, brand: product.brand })
                  }
                />
              ))}
            </ul>
          )
        ) : !popular.ready ? (
          <DataState loading label="인기 제품" />
        ) : popular.error ? (
          <DataState
            error
            onRetry={popular.retry}
            label="인기 제품"
            message={popular.errorMessage}
          />
        ) : useCatalog ? (
          <ul className={styles.grid}>
            {catalog.map((product) => (
              <ProductCard
                key={product.id}
                name={product.productName}
                note={product.productCompany}
                // 공유 이미지만 온다 — 개인 사진은 조회 자체에서 빠져 있다.
                image={product.image}
                category={product.category}
                onSelect={() => setDetail(product)}
              />
            ))}
          </ul>
        ) : (
          <ul className={styles.grid}>
            {POPULAR_PRODUCTS.map((product) => (
              <ProductCard
                key={product.id}
                name={product.name}
                note={product.brand}
                category={product.category}
                onSelect={() =>
                  onSelect({ name: product.name, brand: product.brand })
                }
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
