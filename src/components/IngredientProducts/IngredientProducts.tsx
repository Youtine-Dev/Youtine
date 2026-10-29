"use client";

import { useState } from "react";

import { PopularProductModal } from "@/app/scan/components/PopularProductModal";
import { ProductCard } from "@/app/scan/components/ProductCard";
import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { useProductsByIngredient } from "@/lib/data";
import type { Product } from "@/types/skincare";

import styles from "./IngredientProducts.module.css";

/**
 * 성분 하나에 대한 카탈로그 제품 목록.
 *
 * **웹 검색이 아니라 저장된 성분을 거른다**(concern-flow Q4). 그래서 "관련 있어 보임"이
 * 아니라 실제로 그 성분이 들어 있는 제품이고, 즉시 뜬다.
 *
 * ⚠️ **빈 결과의 의미가 중요하다.** "그런 제품이 없다"가 아니라 **"아직 아무도 담지 않았다"**
 * 이다. 카탈로그는 사용자가 담아야 채워지므로, 초기에는 대부분 비어 있다.
 * 막다른 길을 만들지 않도록 스캔 탭으로 가는 길을 함께 준다.
 *
 * `concern/` 에서 이리로 옮겼다(2026-08-20) — 리포트의 "추가하면 좋을 성분"도 같은
 * 화면을 쓰게 되면서 한 라우트 전용이 아니게 됐다(EmptyState 승격과 같은 근거).
 */
export function IngredientProducts({ ingredient }: { ingredient: string }) {
  const products = useProductsByIngredient(ingredient);
  const [detail, setDetail] = useState<Product | null>(null);

  if (!products.ready) return <DataState loading label="제품" />;
  if (products.error)
    return (
      <DataState
        error
        onRetry={products.retry}
        label="제품"
        message={products.errorMessage}
      />
    );

  if (products.value.length === 0) {
    return (
      <p className={styles.empty}>
        <Icon name="info" size="sm" />
        <span>
          {/* 조사 없이 — "이(가)" 자리표시가 화면에 그대로 나왔다(3라운드 m33). */}
          <strong>{ingredient}</strong> 성분이 든 제품이 아직 카탈로그에 없어요.
          스캔 탭에서 제품을 찾아 담으면 여기에도 나타납니다.
        </span>
      </p>
    );
  }

  return (
    <>
      {detail && (
        <PopularProductModal product={detail} onClose={() => setDetail(null)} />
      )}

      <ul className={styles.grid}>
        {products.value.map((product) => (
          <ProductCard
            key={product.id}
            name={product.productName}
            note={product.productCompany}
            // 공유 이미지만 온다 — 개인 사진은 조회에서 빠져 있다.
            image={product.image}
            category={product.category}
            onSelect={() => setDetail(product)}
          />
        ))}
      </ul>
    </>
  );
}
