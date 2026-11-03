"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { ProductCandidate } from "@/api/ai";
import { Icon } from "@/components/Icon";
import { useRoutines } from "@/lib/data";
import { stepIcon } from "@/lib/stepIcon";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useModalFocus } from "@/lib/useModalFocus";

import type { Product } from "@/types/skincare";

import type { RegisterPhase, SearchResult } from "../hooks/useProductRegister";
// 인기 제품 모달(`PopularProductModal`)과 같은 껍데기를 쓴다 — 한 파일을 함께 import 한다.
import styles from "./productModal.module.css";

/**
 * 검색 → 후보 선택 → 성분 확인 → 등록.
 *
 * 한 모달 안에서 단계가 바뀐다. 단계마다 별도 화면으로 나누지 않은 이유는
 * **뒤로 돌아갈 수 있어야** 하기 때문이다 — 후보 검색은 실측 18~37초라
 * 잘못 골랐다고 처음부터 다시 하게 만들면 안 된다.
 *
 * ⚠️ **배경을 눌러도 닫히지 않는다.** 실수로 닫으면 최대 1분 넘게 걸린 결과가 날아간다.
 * 나가는 길은 닫기 버튼과 Esc 뿐이고, 진행 중(추출·저장)에는 둘 다 막는다.
 */
export function ProductSearchModal({
  phase,
  candidates,
  result,
  saved,
  existing,
  savedOver,
  shelfCount,
  viaLabel,
  extractStartedAt,
  error,
  onSelect,
  onBack,
  onConfirm,
  onRegisterAnother,
  onClose,
  onRetakeLabel,
  typedName,
  onUseTypedName,
}: {
  phase: RegisterPhase;
  candidates: ProductCandidate[];
  result: SearchResult | null;
  saved: Product | null;
  /** 확인 중인 결과가 이미 내 선반에 있으면 그 항목(m15). */
  existing: Product | undefined;
  /** 저장 직전 선반에 있던 같은 제품 — 완료 화면 문구가 갈린다(m15). */
  savedOver: Product | undefined;
  shelfCount: number;
  /** 성분표 사진으로 읽는 경로인지 — 검색을 안 했으니 제목이 '검색 결과'면 틀린 말이다(m16). */
  viaLabel: boolean;
  /** 성분 추출 시작 시각(ms). 훅이 들고 있어 모달이 다시 떠도 경과 초가 이어진다(m28). */
  extractStartedAt: number;
  error: string | null;
  onSelect: (candidate: ProductCandidate) => void;
  onBack: () => void;
  onConfirm: () => void;
  onRegisterAnother: () => void;
  onClose: () => void;
  /** 성분·후보를 못 찾았을 때 — 모달을 닫고 성분표 촬영으로 보낸다. */
  onRetakeLabel: () => void;
  /** 사용자가 폼에 입력한 제품명 — 후보에 없을 때 그대로 등록하는 데 쓴다. */
  typedName: string;
  /** 검색을 건너뛰고 입력한 이름으로 진행한다. */
  onUseTypedName: () => void;
}) {
  const busy = phase === "extracting" || phase === "saving";
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // 완료 후 다음 행동 문구 — 루틴이 없는데 "다시 짜기"라고 하면 틀린 말이다(m33).
  const hasRoutines = useRoutines().value.length > 0;

  // 모달 뒤 화면이 스크롤되면 안 된다(사용자 요청 2026-08-20).
  useBodyScrollLock();
  // 열리면 포커스를 안으로 — 안 그러면 Tab 이 배경 카드로 가 키보드로 닫기에 닿지 못한다(m31).
  useModalFocus(dialogRef);

  // Esc 로 닫기 — 오버레이라 브라우저 뒤로가기가 닫아 주지 않는다(CameraCapture 와 같은 이유).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  return (
    <div
      ref={dialogRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className={styles.sheet}>
        <div className={styles.bar}>
          {/* 성분 화면에서는 후보로 돌아갈 수 있다. 후보가 없으면(사진 등록) 숨긴다. */}
          {phase === "found" && candidates.length > 0 ? (
            <button
              type="button"
              className={styles.back}
              onClick={onBack}
              aria-label="다른 제품 고르기"
            >
              <Icon name="arrow_back" />
            </button>
          ) : (
            <span className={styles.barSpacer} />
          )}

          <p id={titleId} className={styles.title}>
            {phase === "choosing"
              ? "어떤 제품인가요?"
              : phase === "done"
                ? "등록 완료"
                : viaLabel
                  ? "성분 읽기 결과"
                  : "검색 결과"}
          </p>

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.body}>
          {phase === "choosing" && (
            <CandidateList
              candidates={candidates}
              onSelect={onSelect}
              typedName={typedName}
              onUseTypedName={onUseTypedName}
              onRetakeLabel={onRetakeLabel}
              searchFailed={Boolean(error)}
            />
          )}

          {phase === "extracting" && (
            <Extracting startedAt={extractStartedAt} />
          )}

          {(phase === "found" || phase === "saving") && result && (
            <ResultView
              result={result}
              // 저장 중에는 모달을 떠나는 버튼을 주지 않는다(닫기와 같은 규칙).
              onRetakeLabel={phase === "found" ? onRetakeLabel : undefined}
            />
          )}

          {phase === "done" && saved && (
            <SavedView
              product={saved}
              before={savedOver}
              shelfCount={shelfCount}
            />
          )}
        </div>

        <div className={styles.footer}>
          {error && (
            <p className={styles.error} role="alert">
              <Icon name="error" size="sm" />
              {error}
            </p>
          )}

          {/* 이미 담긴 제품을 다시 등록해도 개수는 그대로다 — 누르기 전에 알린다(m15). */}
          {phase === "found" && existing && (
            <p className={styles.shelfNote}>
              <Icon
                name="inventory_2"
                size="sm"
                className={styles.shelfNoteIcon}
              />
              이미 내 선반에 있는 제품이에요. 등록해도 개수는 늘지 않아요.
            </p>
          )}

          {(phase === "found" || phase === "saving") && result && (
            <button
              type="button"
              className={styles.submit}
              onClick={onConfirm}
              disabled={phase === "saving"}
            >
              {phase === "saving" ? (
                <>
                  <Icon name="progress_activity" className={styles.spinner} />
                  담는 중…
                </>
              ) : (
                <>
                  <Icon name="add_circle" filled />
                  선반에 등록하기
                </>
              )}
            </button>
          )}

          {phase === "done" && (
            <>
              {/*
                방금 제품이 늘었다 — 새 제품을 반영해 루틴을 (다시) 짜는 것이 자연스러운
                다음 행동이다(사용자 피드백 2026-08-20: 닫기(X)와 "더 등록하기"의 기능이
                같아서 헷갈렸다). 더 등록하기는 보조 버튼으로 내린다.
              */}
              <Link href="/routine/new" className={styles.submit}>
                <Icon name="auto_awesome" filled />
                {hasRoutines ? "루틴 다시 짜기" : "루틴 만들기"}
              </Link>
              <button
                type="button"
                className={styles.secondary}
                onClick={onRegisterAnother}
              >
                <Icon name="add_circle" />
                다른 제품 등록하기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateList({
  candidates,
  onSelect,
  typedName,
  onUseTypedName,
  onRetakeLabel,
  searchFailed,
}: {
  candidates: ProductCandidate[];
  onSelect: (candidate: ProductCandidate) => void;
  typedName: string;
  onUseTypedName: () => void;
  onRetakeLabel: () => void;
  /** 검색 자체가 실패했다 — 아래 오류가 사유를 말하니 "결과가 없어요"라고 하지 않는다(m8). */
  searchFailed: boolean;
}) {
  // 깨진 썸네일 주소 — 브라우저 기본 깨진 이미지 대신 아이콘으로 폴백한다(m34, ProductCard 와 같은 방식).
  const [brokenSrcs, setBrokenSrcs] = useState<string[]>([]);

  /*
   * 후보에 원하는 제품이 없을 때의 탈출구 — 어떤 제품이든 등록은 가능해야 한다.
   * 문구가 "더 깊게 검색"인 이유: 이 버튼은 단순 건너뛰기가 아니라 **다음 단계에서
   * 카탈로그 → 브랜드 공식몰 → AI 순으로 더 파고든다**(성분 추출 경로). 후보 목록보다
   * 실제로 더 많은 곳을 뒤진다.
   */
  const typedOption = typedName.trim() ? (
    <button
      type="button"
      className={styles.typedOption}
      onClick={onUseTypedName}
    >
      <Icon name="travel_explore" size="sm" />
      <span>
        <strong>&lsquo;{typedName}&rsquo;</strong> 더 깊게 검색하기
      </span>
    </button>
  ) : null;

  /*
   * ⭐ 빈 배열은 실패가 아니라 정상 응답이다(카탈로그·화해에 없으면 []).
   *    막다른 길을 만들지 않도록 **다음 행동을 버튼으로** 준다.
   */
  if (candidates.length === 0) {
    return (
      <>
        <p className={styles.empty}>
          {!searchFailed && (
            <>
              검색 결과가 없어요.
              <br />
            </>
          )}
          더 깊게 찾아보거나, 성분표를 찍어 직접 읽을 수 있어요.
        </p>
        {typedOption}
        {/* 안내만 하고 버튼이 없으면 막다른 길이다(m29) — 성분 0개 화면과 같은 촬영 흐름. */}
        <button
          type="button"
          className={styles.emptyAction}
          onClick={onRetakeLabel}
        >
          <Icon name="photo_camera" filled size="sm" />
          성분표 촬영하기
        </button>
      </>
    );
  }

  return (
    <>
      <p className={styles.lead}>
        찾은 제품 {candidates.length}개예요.
        <br />
        담을 제품을 골라 주세요.
      </p>

      <ul className={styles.candidates}>
        {candidates.map((candidate, index) => {
          const image = candidate.image_url;
          return (
            // 이름이 겹치는 후보가 올 수 있어 index 를 함께 쓴다.
            <li key={`${candidate.product_name}-${index}`}>
              <button
                type="button"
                className={styles.candidate}
                onClick={() => onSelect(candidate)}
              >
                <span className={styles.candidateThumb}>
                  {/*
                  화해 CDN 썸네일(96x96). 서버가 허용 호스트인지 이미 걸렀다.
                  최적화는 끈다 — 이미 작은 이미지라 얻을 게 없고 서버 부하만 는다.
                */}
                  {image && !brokenSrcs.includes(image) ? (
                    <Image
                      src={image}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      className={styles.candidateThumbImg}
                      onError={() => setBrokenSrcs((list) => [...list, image])}
                    />
                  ) : (
                    <Icon name="image" className={styles.candidateThumbIcon} />
                  )}
                </span>

                <span className={styles.candidateText}>
                  <span className={styles.candidateName}>
                    {candidate.product_name}
                  </span>
                  {/* brand·volume 은 페이지에서 확인 못 하면 null 이다(규칙 6·7). 없으면 그냥 뺀다. */}
                  {(candidate.brand || candidate.volume) && (
                    <span className={styles.candidateMeta}>
                      {[candidate.brand, candidate.volume]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <Icon name="chevron_right" className={styles.candidateArrow} />
              </button>
            </li>
          );
        })}
      </ul>

      {/* 후보가 있어도 원하는 게 아닐 수 있다 — 목록 아래에 같은 탈출구를 둔다. */}
      {typedOption}
    </>
  );
}

/**
 * 성분 추출 대기. 실측 14~54초라 경과를 보여 주지 않으면 멈춘 줄 안다.
 * 시작 시각은 훅에서 받는다 — 탭을 갔다 와 다시 마운트돼도 이어서 센다(m28).
 */
function Extracting({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <p className={styles.loading} role="status">
      <Icon name="progress_activity" className={styles.spinner} />
      성분을 읽는 중… {elapsed}초
    </p>
  );
}

/** 등록 완료. 폼 아래 인라인이 아니라 모달로 보여 준다 — 방금 한 행동의 결과가 눈에 띄어야 한다. */
function SavedView({
  product,
  before,
  shelfCount,
}: {
  product: Product;
  /** 저장 전부터 선반에 있던 같은 제품. 있으면 "담았어요·총 N개"(변화 없음) 대신 바뀐 것을 말한다(m15). */
  before: Product | undefined;
  shelfCount: number;
}) {
  // 서버는 출처 등급이 높을 때만 성분을 바꾼다 — 실제로 바뀌었는지는 저장 결과로 판정한다.
  const replaced =
    before !== undefined &&
    JSON.stringify(before.ingredients) !== JSON.stringify(product.ingredients);

  return (
    <div className={styles.saved}>
      <Icon name="check_circle" filled className={styles.savedIcon} />
      <p className={styles.savedTitle}>
        {before ? "이미 선반에 있던 제품이에요" : "선반에 담았어요"}
      </p>
      <p className={styles.savedName}>
        {product.productName}
        <span className={styles.chip}>{product.category}</span>
      </p>
      <p className={styles.savedCount}>
        {!before
          ? `내 선반에 총 ${shelfCount}개`
          : replaced
            ? `성분 정보를 새로 읽은 ${product.ingredients.length}개로 바꿨어요`
            : "선반은 그대로예요"}
      </p>
    </div>
  );
}

function ResultView({
  result,
  onRetakeLabel,
}: {
  result: SearchResult;
  onRetakeLabel?: () => void;
}) {
  const image = result.thumbnail || result.imageUrl;
  const photo = result.ingredientSource === "photo";
  // 깨진 이미지면 카테고리 아이콘으로(m34). src 를 기억해 다른 이미지로 바뀌면 다시 시도한다.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  return (
    <>
      <div className={styles.head}>
        <span className={styles.thumb}>
          {/*
            직접 찍은 사진이 우선, 없으면 검색 결과 이미지. 둘 다 없으면 카테고리 아이콘.
            (담을 때 서버가 검색 이미지를 받아 data URL 로 바꿔 저장하므로,
             담긴 뒤에는 어느 쪽이든 같은 모양이 된다.)
            ⚠️ 저장 전 미리보기는 외부(화해 CDN) 원본 URL 을 직접 로드한다 —
            저장 시 서버가 data URL 로 임베딩하는 정책의 **의도된 예외**다(m28).
          */}
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
            <Icon name={stepIcon(result.category)} filled />
          )}
        </span>

        <div className={styles.headText}>
          <p className={styles.name}>{result.productName}</p>
          <span className={styles.chip}>{result.category}</span>
          {/* 제조사·용량은 없을 수 있다. 빈 자리를 만들지 않고 있을 때만 보여 준다. */}
          {(result.productCompany || result.volume) && (
            <p className={styles.meta}>
              {[result.productCompany, result.volume]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      <h3 className={styles.sectionTitle}>
        성분
        {result.ingredients.length > 0 && (
          <span className={styles.count}>{result.ingredients.length}개</span>
        )}
      </h3>

      {/*
        빈 배열은 실패가 아니라 정상 응답이다 — 프롬프트가 "확신 없으면 []" 를 요구한다.
        성분을 지어내지 않았다는 뜻이므로 그대로 알리고 다음 행동을 제안한다.
        이 상태로도 담을 수 있다(이름만 저장).
      */}
      {result.ingredients.length === 0 ? (
        <>
          {/* 사진으로 읽었는데 0개면 "사진을 올리라"는 안내는 방금 한 일이다(m9) — 다시 찍는 요령을 준다. */}
          <p className={styles.empty}>
            {photo ? "성분표를 읽지 못했어요." : "성분 정보를 찾지 못했어요."}
            <br />
            {photo
              ? "성분표가 박스에 꽉 차게, 밝은 곳에서 가까이 다시 찍어 주세요."
              : "성분표 사진을 올리면 정확히 읽을 수 있습니다."}
          </p>
          {/* 문구로만 안내하면 막다른 길이다 — 바로 촬영으로 이어지는 버튼을 준다. */}
          {onRetakeLabel && (
            <button
              type="button"
              className={styles.emptyAction}
              onClick={onRetakeLabel}
            >
              <Icon name="photo_camera" filled size="sm" />
              {photo ? "다시 촬영하기" : "성분표 촬영하기"}
            </button>
          )}
        </>
      ) : (
        <ul className={styles.ingredients}>
          {result.ingredients.map((ingredient) => (
            <li key={ingredient} className={styles.ingredient}>
              {ingredient}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
