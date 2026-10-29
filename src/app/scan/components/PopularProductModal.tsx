"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { addProduct, removeProduct, useProducts } from "@/lib/data";
import { stepIcon } from "@/lib/stepIcon";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useModalFocus } from "@/lib/useModalFocus";
import { realWarnings } from "@/lib/warnings";
import type { Product } from "@/types/skincare";

import { toMessage } from "../hooks/useProductRegister";
// 검색 결과 모달(`ProductSearchModal`)과 같은 껍데기를 쓴다 — 한 파일을 함께 import 한다.
import styles from "./productModal.module.css";

/**
 * 인기 제품 상세 — **이미 저장된 값만 보여 준다.**
 *
 * 공유 카탈로그(`products`)에서 온 제품이라 성분·이미지가 이미 DB 에 있다.
 * 그래서 여는 데 AI 호출이 없고 **즉시** 뜬다. 스캔 탭의 검색 모달과 다른 점이 이것이다
 * (그쪽은 아직 저장 전이라 성분을 그때 읽는다).
 *
 * 인기 제품에서는 `product.thumbnail` 이 **항상 비어 있다**(개인 사진을 조회하지 않는다 —
 * `/api/products/popular` 참조). **내 선반에서 열면** thumbnail 이 내 사진이고 나만 보는
 * 문맥이므로 그걸 우선한다.
 *
 * 선반 소유 여부는 **내 선반 목록으로 직접 판정한다**(m33) — 인기·성분별 제품처럼 선반 밖에서
 * 열어도 이미 담긴 제품이면 "선반에 추가하기"(눌러도 변화 0) 대신 그 사실과 빼기(I1)를 보여 준다.
 *
 * @param alreadyOnShelf 내 선반에서 연 경우. 목록 판정과 OR — 목록 로딩 전에도 확실한 문맥이다.
 */
export function PopularProductModal({
  product,
  onClose,
  alreadyOnShelf = false,
}: {
  product: Product;
  onClose: () => void;
  alreadyOnShelf?: boolean;
}) {
  /** 진행 중인 쓰기. 빼기 직후 목록이 먼저 갱신돼도 "담는 중"으로 보이지 않게 종류를 구분한다. */
  const [pending, setPending] = useState<"add" | "remove" | null>(null);
  const [saved, setSaved] = useState(false);
  /** 빼기 확인 1단계 — 실수 한 번에 선반이 바뀌지 않게. */
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shelf = useProducts();

  // 모달 뒤 화면이 스크롤되면 안 된다(사용자 요청 2026-08-20).
  useBodyScrollLock();
  // 열리면 포커스를 안으로 — 안 그러면 Tab 이 배경 카드로 가 키보드로 닫기에 닿지 못한다(m31).
  useModalFocus(dialogRef);

  const image = product.thumbnail || product.image;
  // 선반 항목의 id 는 카탈로그 id 다(`GET /api/products` 가 p.id 를 준다).
  const onShelf =
    alreadyOnShelf ||
    pending === "remove" ||
    shelf.value.some((item) => item.id === product.id);
  // "성분 정보 부족" 안내는 주의사항이 아니다 — 성분 없음은 위의 빈 성분 문구가 이미 말한다(m27).
  const warnings = realWarnings(product.warnings ?? []);

  // Esc 로 닫기 — 오버레이라 브라우저 뒤로가기가 닫아 주지 않는다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  async function handleAdd() {
    setPending("add");
    setError(null);
    try {
      /*
       * 이미 카탈로그에 있는 제품이라 성분을 다시 읽지 않는다 — 저장된 값을 그대로 담는다.
       * 서버의 UPSERT 가 (name, brand) 로 같은 행을 찾아 내 선반에만 연결한다.
       */
      await addProduct({
        productName: product.productName,
        productCompany: product.productCompany,
        category: product.category,
        ingredients: product.ingredients,
      });
      setSaved(true);
    } catch (cause: unknown) {
      /*
       * `cause.message` 를 그대로 쓰면 ApiError 가 만든 `API 503 Service Unavailable`
       * 이 노출된다 — 서버가 body 에 담아 준 한글 안내가 버려진다(m11).
       * 문구 생성은 등록 경로와 같은 toMessage 한 곳에서만 한다.
       */
      setError(toMessage(cause, "선반에 담지 못했어요"));
    } finally {
      setPending(null);
    }
  }

  /** 선반에서만 뺀다(I1). 공유 카탈로그의 제품은 남는다 — 다시 담을 수 있다. */
  async function handleRemove() {
    setPending("remove");
    setError(null);
    try {
      await removeProduct({ id: product.id });
      // 뺀 제품의 상세를 띄워 둘 이유가 없다 — 선반에서 열었다면 그 카드도 이미 사라졌다.
      onClose();
    } catch (cause: unknown) {
      setError(toMessage(cause, "선반에서 빼지 못했어요"));
      setPending(null);
    }
  }

  return (
    <div
      ref={dialogRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={product.productName}
    >
      <div className={styles.sheet}>
        <div className={styles.bar}>
          <p className={styles.title}>제품 정보</p>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={pending !== null}
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.head}>
            <span className={styles.thumb}>
              {/* 깨진 이미지면 카테고리 아이콘으로(m34, ProductCard 와 같은 방식). */}
              {image && image !== brokenSrc ? (
                <Image
                  src={image}
                  alt=""
                  width={112}
                  height={112}
                  unoptimized
                  className={styles.thumbImg}
                  onError={() => setBrokenSrc(image)}
                />
              ) : (
                <Icon name={stepIcon(product.category)} filled />
              )}
            </span>

            <div className={styles.headText}>
              <p className={styles.name}>{product.productName}</p>
              <span className={styles.chip}>{product.category}</span>
              {product.productCompany && (
                <p className={styles.meta}>{product.productCompany}</p>
              )}
            </div>
          </div>

          <h3 className={styles.sectionTitle}>
            성분
            {product.ingredients.length > 0 && (
              <span className={styles.count}>
                {product.ingredients.length}개
              </span>
            )}
          </h3>

          {/* 빈 배열은 "아직 성분을 못 찾은 제품"이다. 지어내지 않았다는 뜻이라 그대로 알린다. */}
          {product.ingredients.length === 0 ? (
            <p className={styles.empty}>
              아직 성분 정보가 없어요.
              <br />
              담은 뒤 성분표 사진을 올리면 채워집니다.
            </p>
          ) : (
            <ul className={styles.ingredients}>
              {product.ingredients.map((ingredient) => (
                <li key={ingredient} className={styles.ingredient}>
                  {ingredient}
                </li>
              ))}
            </ul>
          )}

          {/* 주의사항은 지연 생성이라 아직 없을 수 있다. 있을 때만 보여 준다. */}
          {warnings.length > 0 && (
            <>
              <h3 className={styles.sectionTitle}>주의사항</h3>
              <ul className={styles.warnings}>
                {warnings.map((warning) => (
                  <li key={warning} className={styles.warning}>
                    <Icon name="warning" size="sm" />
                    {warning}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={styles.footer}>
          {error && (
            <p className={styles.error} role="alert">
              <Icon name="error" size="sm" />
              {error}
            </p>
          )}

          {saved ? (
            <button type="button" className={styles.submit} onClick={onClose}>
              <Icon name="check_circle" filled />
              선반에 담았어요
            </button>
          ) : onShelf ? (
            /*
             * 이미 담긴 제품 — 담기 대신 그 사실과 빼기(I1).
             * 빼기 버튼은 확인 전후로 **같은 자리의 같은 요소**다. 바꿔 끼우면 누른 순간
             * 포커스가 body 로 빠진다(키보드 사용자는 확인 버튼을 다시 찾아야 한다).
             */
            <>
              <p className={styles.shelfNote} aria-live="polite">
                <Icon name="inventory_2" size="sm" />
                {confirmingRemove
                  ? "선반에서 뺄까요? 리포트 분석에서도 빠지고, 나중에 다시 담을 수 있어요."
                  : "이미 내 선반에 있어요"}
              </p>
              <button
                type="button"
                className={
                  confirmingRemove
                    ? `${styles.secondary} ${styles.danger}`
                    : styles.secondary
                }
                onClick={
                  confirmingRemove
                    ? handleRemove
                    : () => setConfirmingRemove(true)
                }
                disabled={pending !== null}
              >
                {pending === "remove" ? (
                  <>
                    <Icon name="progress_activity" className={styles.spinner} />
                    빼는 중…
                  </>
                ) : (
                  <>
                    <Icon name="delete" />
                    {confirmingRemove ? "네, 선반에서 빼기" : "선반에서 빼기"}
                  </>
                )}
              </button>
              {confirmingRemove && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirmingRemove(false)}
                  disabled={pending !== null}
                >
                  취소
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={styles.submit}
              onClick={handleAdd}
              disabled={pending !== null}
            >
              {pending === "add" ? (
                <>
                  <Icon name="progress_activity" className={styles.spinner} />
                  담는 중…
                </>
              ) : (
                <>
                  <Icon name="add_circle" filled />
                  선반에 추가하기
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
