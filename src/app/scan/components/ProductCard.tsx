"use client";

import Image from "next/image";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { stepIcon } from "@/lib/stepIcon";

import card from "../../(home)/components/card.module.css";
import styles from "./ProductCard.module.css";

/**
 * 제품 카드 — **인기 제품·검색 결과·내 선반·성분별 추천이 전부 이 하나를 쓴다.**
 *
 * 예전에는 선반이 자기 CSS 로 따로 그렸는데, 같은 것을 두 벌로 그리면 반드시 갈라진다
 * (실제로 썸네일이 96px/72px 로 어긋나 있었다). 선반 쪽 모양으로 통일했다.
 *
 * ⛔ **가격을 표시하지 않는다.** 화해 실측(2026-08-18)에서 가격은 검색어에 따라 나오기도
 * 안 나오기도 했고, 나오더라도 정가가 아니라 사은품 묶음 "최저가"였다. 재현되지 않는 값을
 * 정가처럼 보여 줄 수 없다.
 *
 * ⚠️ `image` 에는 그 화면에서 **보여도 되는 이미지만** 넘긴다. 공유 카탈로그
 * (`products.image`)는 어디서나 되지만, 사용자가 직접 찍은 사진(`shelf_items.thumbnail`)은
 * 내 선반에서만 보여 준다(`db/migrations/002_product_image.sql` 참조).
 */
type Props = {
  name: string;
  /** 카테고리 칩 + 썸네일 아이콘 폴백에 쓴다. */
  category?: string;
  /** 썸네일(data URL). 없으면 카테고리 아이콘으로 폴백한다. */
  image?: string;
  /** 이름 아래 한 줄. 인기·검색은 브랜드, 선반은 성분 요약이나 주의 표시다. */
  note?: string | null;
  /** 주의 성분이 있는 제품. 테두리와 아이콘으로 표시한다. */
  flagged?: boolean;
  /** 없으면 누를 수 없는 카드다(내 선반). 있으면 버튼이 된다. */
  onSelect?: () => void;
};

export function ProductCard({
  name,
  category,
  image,
  note,
  flagged = false,
  onSelect,
}: Props) {
  /*
   * 로드에 실패한 src 를 기억해 아이콘으로 폴백한다(m26) — 깨진 값이면 브라우저
   * 기본 깨진 이미지 아이콘이 떴다. src 자체를 기억해야 다른 이미지로 바뀌면
   * 자동으로 다시 시도한다.
   */
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const body = (
    <>
      <span className={styles.thumb}>
        {image && image !== brokenSrc ? (
          // 이미 축소된 data URL 이라 next/image 최적화가 필요 없다.
          <Image
            src={image}
            alt=""
            width={96}
            height={96}
            unoptimized
            className={styles.image}
            onError={() => setBrokenSrc(image)}
          />
        ) : (
          <Icon name={stepIcon(category ?? "")} filled />
        )}
      </span>

      {category && (
        <span className={`${card.label} ${styles.chip}`}>{category}</span>
      )}
      {/* 버튼 안이라 span 만 — 헤딩·문단은 버튼에 못 들어가고, 헤딩 탐색이 버튼 안으로 튄다(m22).
          모양은 클래스(-webkit-box)가 정해 태그와 무관하다. 섹션 제목(h2)은 바깥에 있다. */}
      <span className={styles.name}>{name}</span>
      {note && (
        <span className={`${styles.note} ${flagged ? styles.noteAlert : ""}`}>
          {/* 주의 마크는 문구 바로 왼쪽(사용자 요청 2026-11-02 — 예전엔 카드 오른쪽 위 구석) */}
          {flagged && (
            <Icon name="warning" size="sm" filled className={styles.flag} />
          )}
          {note}
        </span>
      )}
    </>
  );

  const className = `${card.card} ${styles.card} ${flagged ? styles.flagged : ""}`;

  return (
    <li>
      {/*
        누를 데가 없는 카드를 button 으로 만들면 포커스는 잡히는데 아무 일도 안 일어난다.
        선반 카드처럼 동작이 없으면 div 로 둔다.
      */}
      {onSelect ? (
        <button type="button" className={className} onClick={onSelect}>
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
