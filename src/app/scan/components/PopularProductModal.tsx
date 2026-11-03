"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import {
  addProduct,
  removeProduct,
  useIngredientKnowledge,
  useIngredientRole,
  useProducts,
} from "@/lib/data";
import { stepIcon } from "@/lib/stepIcon";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useModalFocus } from "@/lib/useModalFocus";
import { realWarnings } from "@/lib/warnings";
import type { Product } from "@/types/skincare";

import { toMessage } from "../hooks/useProductRegister";
// 검색 결과 모달(`ProductSearchModal`)과 같은 껍데기를 쓴다 — 한 파일을 함께 import 한다.
import styles from "./productModal.module.css";
import { labelCaptureHref } from "./ScanTabs";

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
  /** 역할 설명을 연 성분 칩(라벨 원문). 2026-11-02 사용자 요청. */
  const [roleOf, setRoleOf] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shelf = useProducts();

  // 모달 뒤 화면이 스크롤되면 안 된다(사용자 요청 2026-08-20).
  useBodyScrollLock();
  // 열리면 포커스를 안으로 — 안 그러면 Tab 이 배경 카드로 가 키보드로 닫기에 닿지 못한다(m31).
  useModalFocus(dialogRef);

  const image = product.thumbnail || product.image;
  // 선반 항목의 id 는 카탈로그 id 다(`GET /api/products` 가 p.id 를 준다).
  // 담는 중엔 목록이 먼저 갱신돼도 담기 버튼을 유지한다 — 빼기 줄로 바뀌면 포커스가 빠진다(m23).
  const onShelf =
    alreadyOnShelf ||
    pending === "remove" ||
    (pending !== "add" && shelf.value.some((item) => item.id === product.id));
  // "성분 정보 부족" 안내는 주의사항이 아니다 — 성분 없음은 위의 빈 성분 문구가 이미 말한다(m27).
  const warnings = realWarnings(product.warnings ?? []);

  // Esc 로 닫기 — 오버레이라 브라우저 뒤로가기가 닫아 주지 않는다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) return;
      /*
       * 안쪽 성분 설명 모달이 떠 있으면 그쪽만 닫힌다(m9 — IngredientDetailModal 과 같은 가드).
       * 두 리스너가 같은 window 에 붙고 이쪽이 먼저 등록돼 먼저 돈다 — 가드가 없으면 Esc 한 번에 둘 다 닫힌다.
       */
      if (dialogRef.current?.querySelector('[role="dialog"]')) return;
      onClose();
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
            <>
              <p className={styles.empty}>
                아직 성분 정보가 없어요.
                <br />
                성분표를 촬영하면 AI 가 읽어 채워 드려요.
              </p>
              {/* 안내만 있으면 막다른 길이고, 이름·브랜드를 손으로 다시 치면 글자가 달라 별도 행이
                  된다(m21) — 등록 폼을 이 제품으로 채워 카메라를 연다. 모달은 먼저 닫는다
                  (선반 탭은 detail 을 들고 있어 돌아오면 다시 뜬다). 담기 전이어도 등록이 담는다. */}
              <Link
                href={labelCaptureHref(product)}
                className={styles.emptyAction}
                onClick={onClose}
              >
                <Icon name="photo_camera" filled size="sm" />
                성분표 촬영하기
              </Link>
            </>
          ) : (
            <ul className={styles.ingredients}>
              {product.ingredients.map((ingredient) => (
                <li key={ingredient}>
                  {/* 누르면 이 성분의 역할(2026-11-02). 검색 모달의 칩은 저장 전 AI 추출값이라
                      표시 전용으로 둔다 — 오독된 이름의 설명이 공유 캐시에 쌓이면 안 된다. */}
                  <button
                    type="button"
                    className={`${styles.ingredient} ${styles.ingredientButton}`}
                    onClick={() => setRoleOf(ingredient)}
                    aria-haspopup="dialog"
                  >
                    {ingredient}
                  </button>
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
            /* 누른 버튼이 이걸로 바뀌며 사라진다 — 포커스를 여기로 받아 대화상자 안에 둔다(m23).
               React 의 autoFocus 는 마운트 때 focus() 를 부른다(이 버튼은 담기 성공 때만 마운트). */
            <button
              type="button"
              className={styles.submit}
              onClick={onClose}
              autoFocus
            >
              <Icon name="check_circle" filled />
              선반에 담았어요
            </button>
          ) : onShelf ? (
            /*
             * 이미 담긴 제품 — 담기 대신 그 사실과 빼기(I1).
             * 빼기 버튼은 확인 전후로 **같은 자리의 같은 요소**다. 바꿔 끼우면 누른 순간
             * 포커스가 body 로 빠진다(키보드 사용자는 확인 버튼을 다시 찾아야 한다).
             * 안내와 버튼은 좌우 한 줄(사용자 요청 2026-11-02). 확인 단계는 문장이 길고
             * 취소가 붙어 안내가 한 줄을 다 쓰고, 두 버튼이 그 아래에서 좌우로 선다.
             */
            <div
              className={
                confirmingRemove
                  ? `${styles.shelfRow} ${styles.shelfRowConfirm}`
                  : styles.shelfRow
              }
            >
              <p className={styles.shelfNote} aria-live="polite">
                <Icon
                  name="inventory_2"
                  size="sm"
                  className={styles.shelfNoteIcon}
                />
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
            </div>
          ) : (
            /* disabled 를 쓰지 않는다 — 누른 순간 비활성이 되면 포커스가 body 로 빠진다(m23). */
            <button
              type="button"
              className={styles.submit}
              onClick={pending === null ? handleAdd : undefined}
              aria-disabled={pending !== null}
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

      {/* 시트 밖·오버레이 안 — 포털로 빼면 위 Esc 가드와 useModalFocus 의 중첩 판별이 깨진다. */}
      {roleOf && (
        <IngredientRoleModal
          key={roleOf}
          name={roleOf}
          onClose={() => setRoleOf(null)}
        />
      )}
    </div>
  );
}

/**
 * 성분 칩 하나의 역할 — 제품 모달 **안에** 뜨는 작은 모달(사용자 요청 2026-11-02).
 *
 * 역할은 `/api/ai/ingredient-role`(공유 캐시, 없으면 AI 10~30초), 그 아래 기존 성분 지식이
 * 있으면 고민·피부 타입 이름만 한 줄씩 붙인다(지식은 DB 읽기라 따로 즉시 뜬다).
 *
 * `IngredientDetailModal` 을 재사용하지 않는다 — 그 모달은 성분별 제품 목록을 열고 그 목록이
 * 이 제품 모달을 열어 **순환 import + 끝없는 중첩**이 된다. 제품 목록은 여기 넣지 않는다.
 */
function IngredientRoleModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(dialogRef, closeRef);
  const titleId = useId();

  const role = useIngredientRole(name);
  // 보조 정보다 — 실패해도 따로 알리지 않고 줄만 뺀다(역할이 이 모달의 본문이다).
  const knowledge = useIngredientKnowledge(name);
  const helps = knowledge.value?.helps ?? [];
  const typeCautions = knowledge.value?.typeCautions ?? [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      /*
       * 바깥 제품 모달의 리스너는 보통 먼저 돌아 자기 가드로 물러난다. 그런데 그쪽 effect 가
       * 다시 등록되면(pending 변경) 이쪽이 먼저 돌게 되고, 닫힌 뒤엔 가드가 볼 dialog 가 없다
       * — 그 순서도 막으려고 여기서 멈춘다.
       */
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 실패 후 "다시 시도"를 누르면 SWR 은 성공해야 error 를 지운다 — 그동안은 기다림으로 보인다.
  const waiting = !role.ready || (role.error && role.validating);

  return (
    <div
      ref={dialogRef}
      className={`${styles.overlay} ${styles.overlayNested}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // 보기 전용 — 바깥(스크림)을 누르면 닫는다.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${styles.sheet} ${styles.sheetSmall}`}>
        <div className={styles.bar}>
          <h2 id={titleId} className={`${styles.title} ${styles.roleTitle}`}>
            {name}
          </h2>
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

        {/* 첫 생성은 10~30초다. 포커스는 닫기 버튼에 있으니, 처음부터 있는 live 영역이어야
            설명이 도착했을 때 스크린리더가 읽는다. */}
        <div className={styles.body} aria-live="polite">
          {waiting ? (
            <RoleWaiting />
          ) : role.error ? (
            <DataState
              error
              onRetry={() => {
                /* 재시도가 시작되면 이 버튼이 대기 화면으로 바뀌며 사라진다 — 포커스가 body 로
                   빠지지 않게 먼저 모달 안(닫기)으로 옮긴다(코드 리뷰 확정 2026-11-02). */
                closeRef.current?.focus();
                role.retry();
              }}
              label="성분 설명"
              message={role.errorMessage}
            />
          ) : (
            <p className={styles.roleText}>
              {/* null 은 실패가 아니라 "널리 알려진 역할을 확신할 수 없다"는 답이다(프롬프트 규칙 1·5). */}
              {role.value ?? "널리 알려진 역할을 확인하지 못한 성분이에요."}
            </p>
          )}

          {helps.length > 0 && (
            <p className={styles.roleMeta}>
              <strong>이런 고민에 도움</strong>
              {helps.map((item) => item.scenario).join(" · ")}
            </p>
          )}
          {typeCautions.length > 0 && (
            <p className={styles.roleMeta}>
              <strong>주의할 피부</strong>
              {typeCautions.map((item) => item.skinType).join(" · ")}
            </p>
          )}

          <p className={styles.roleDisclaimer}>
            AI 가 정리한 일반적인 정보이며 의학적 조언이 아닙니다.
          </p>
        </div>
      </div>
    </div>
  );
}

/** 첫 생성 대기 — 기다리는 동안만 마운트돼 0초부터 센다(ProductSearchModal 의 Extracting 과 같은 방식). */
function RoleWaiting() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className={styles.roleWaiting}>
      <Icon name="progress_activity" className={styles.spinner} />
      {/* 숫자는 매초 바뀐다 — 스크린리더가 매초 읽지 않게 문구만 알린다(RoutineForm N6). */}
      <span role="status">성분 역할을 정리하는 중이에요…</span>
      <span aria-hidden="true">{Math.round((now - startedAt) / 1000)}초</span>
    </p>
  );
}
