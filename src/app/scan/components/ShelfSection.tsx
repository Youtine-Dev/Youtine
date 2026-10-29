"use client";

import Link from "next/link";
import { useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Icon } from "@/components/Icon";
import { useProducts } from "@/lib/data";
import { realWarnings } from "@/lib/warnings";
import type { Product } from "@/types/skincare";

import { PopularProductModal } from "./PopularProductModal";
import { ProductCard } from "./ProductCard";
import styles from "./ShelfSection.module.css";

/**
 * 선반 카드 한 줄 설명.
 * 주의 성분이 있으면 그 사실을 우선 알리고, 없으면 성분 앞 2개 또는 제조사로
 * 채운다 — `ingredients` 빈 배열은 정상 응답이라(Q7 계약) 없다고 지어내지 않는다.
 */
function shelfNote(product: Product, flagged: boolean): string | null {
  if (flagged) return "주의 성분 포함";
  if (product.ingredients.length > 0) {
    return product.ingredients.slice(0, 2).join(" · ");
  }
  return product.productCompany ?? null;
}

export function ShelfSection({
  active,
}: {
  /** 이 패널이 현재 탭인지. hidden 뒤에서 모달이 살아 있으면 스크롤 락이 안 풀린다(M6). */
  active: boolean;
}) {
  const { ready, value: products, error, errorMessage, retry } = useProducts();
  /** 카드를 누르면 상세 모달(인기 탭과 같은 모달, 담기 버튼만 없음). */
  const [detail, setDetail] = useState<Product | null>(null);

  if (!ready) return <DataState loading label="제품" />;
  if (error)
    return (
      <DataState error onRetry={retry} label="제품" message={errorMessage} />
    );

  if (products.length === 0) {
    return (
      <EmptyState
        icon="inventory_2"
        title="아직 등록한 제품이 없어요"
        text="성분표를 촬영하면 AI가 성분을 읽어서 선반에 담아드려요."
        /* 선반 탭에서 누르는 버튼이다 — `/scan` 그대로면 URL 이 같아 화면이 안 바뀐다. */
        ctaHref="/scan?tab=add"
        ctaLabel="제품 등록하기"
      />
    );
  }

  return (
    <ul className={styles.grid}>
      {/* 인기 탭과 같은 상세 모달 — 내 선반이므로 담기 버튼은 뺀다.
          active 일 때만 렌더(M6) — hidden 뒤에 남으면 useBodyScrollLock 이 페이지 전체를 잠근다.
          detail 상태는 유지하므로 탭에 돌아오면 모달이 다시 뜬다. */}
      {active && detail && (
        <PopularProductModal
          product={detail}
          onClose={() => setDetail(null)}
          alreadyOnShelf
        />
      )}

      {products.map((product) => {
        // "성분 정보 부족" 고정 문구는 경고가 아니다 — 성분이 없다는 사실이 "위험"으로 보이면 안 된다(m27).
        const flagged = realWarnings(product.warnings ?? []).length > 0;

        return (
          <ProductCard
            key={product.id}
            name={product.productName}
            category={product.category}
            /* 내가 찍은 사진 우선, 없으면 공유 카탈로그 이미지(화해) — 아이콘은 마지막 폴백.
               개인 사진(thumbnail)을 공유 목록에 넘기지 않는 규칙은 그대로다(여긴 내 선반). */
            image={product.thumbnail || product.image}
            note={shelfNote(product, flagged)}
            flagged={flagged}
            onSelect={() => setDetail(product)}
          />
        );
      })}

      <li>
        {/* 등록 폼은 이제 다른 탭이다. 앵커(`#add`)로는 못 간다 — 숨겨진 조상 안이라
            스크롤 대상으로 잡히지 않아 눌러도 아무 일이 안 일어난다. */}
        <Link href="/scan?tab=add" className={styles.addCard}>
          <span className={styles.addIcon}>
            <Icon name="add" />
          </span>
          <span className={styles.addLabel}>제품 추가</span>
        </Link>
      </li>
    </ul>
  );
}
