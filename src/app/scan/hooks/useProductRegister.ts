"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  extractIngredients,
  searchProductCandidates,
  type IngredientsResponse,
  type ProductCandidate,
} from "@/api/ai";
import { ApiError } from "@/api/client";
import type { IngredientSource } from "@/api/products";
import { addProduct, useProducts } from "@/lib/data";
import { fileToLabelDataUrl, resizeToThumbnail } from "@/lib/imageResize";
import type { Product } from "@/types/skincare";

export type RegisterInput = {
  productName: string;
  capacity: string;
  productCompany: string;
  /**
   * 제품 사진(전면). **썸네일로만 쓴다.**
   * 선반과 검색 결과에서 제품을 알아보는 용도라 성분 추출에는 보내지 않는다.
   */
  productFile: File | null;
  /**
   * 성분표 사진. **성분 추출에만 쓴다.**
   * ⚠️ 썸네일로 쓰지 않는다 — 예전에는 이 사진이 선반 썸네일이 되어
   * 목록에 성분표 클로즈업이 떴다. 제품을 알아볼 수 없었다.
   */
  labelFile: File | null;
};

/**
 * 성분까지 확인된 제품 — **아직 저장하지 않았다.**
 * 사용자가 모달에서 "선반에 등록하기"를 눌러야 저장된다.
 */
export type SearchResult = {
  productName: string;
  category: string;
  ingredients: string[];
  /** 저장용 256px 썸네일. 사진을 올렸을 때만 있다(Q7). */
  thumbnail?: string;
  productCompany?: string;
  /**
   * 화면이 성분 출처를 표시해야 하므로 저장까지 들고 간다.
   * 서버가 이 등급으로 공유 카탈로그 덮어쓰기를 판정한다(Q3 — 낮은 등급은 기존 값을 못 덮는다).
   */
  ingredientSource: IngredientSource;
  /** 후보 검색에서 얻은 용량. 저장하지 않고 확인 화면에만 쓴다(DB 컬럼이 없다). */
  volume?: string;
  /**
   * 후보 검색에서 얻은 이미지 주소.
   * 확인 화면에 그대로 띄우고, 담을 때 **서버가 받아서** data URL 로 저장한다.
   * 직접 찍은 `thumbnail` 이 있으면 그쪽이 우선이다.
   */
  imageUrl?: string;
};

/**
 * 등록 진행 단계.
 *
 * `choosing` 부터 `saving` 까지가 **모달이 떠 있는 구간**이다.
 */
export type RegisterPhase =
  | "idle"
  /** 후보 검색 중(웹 검색, 실측 18~37초) */
  | "searching"
  /** 후보 목록에서 고르는 중 */
  | "choosing"
  /** 고른 제품의 성분 추출 중(실측 14~54초) */
  | "extracting"
  /** 성분까지 확인됨. 등록 대기 */
  | "found"
  | "saving"
  | "done";

/**
 * 제품 등록 — **검색 → 후보 선택 → 성분 확인 → 저장**.
 *
 * 예전에는 한 번에 저장까지 갔다. 사용자가 무엇이 담기는지 보지 못한 채 들어갔고,
 * 이름을 조금만 다르게 쓰면 AI 가 다른 제품을 물어 와도 그대로 저장됐다.
 *
 * ⭐ **성분표 사진이 있으면 후보 검색을 건너뛴다.** 성분표가 손에 있으면 그게 가장 정확한
 * 근거이고, 후보를 고를 이유도 없다(실측 14초 vs 검색 37초 + 추출).
 * 제품 사진만 있을 때는 성분을 알 수 없으므로 **검색은 그대로 진행**하고 썸네일로만 쓴다.
 */
export function useProductRegister() {
  const [phase, setPhase] = useState<RegisterPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [found, setFound] = useState<SearchResult | null>(null);
  const [saved, setSaved] = useState<Product | null>(null);
  /**
   * 검색 시작 때 올린 제품 사진을 들고 있는다.
   * 후보를 고르는 것은 검색이 끝난 뒤라, 그때 다시 폼에서 가져올 수 없다.
   */
  const [productFile, setProductFile] = useState<File | null>(null);
  /**
   * 성분 추출 시작 시각(ms). 모달이 아니라 **여기** 둔다(m28) — 다른 탭에 갔다 오면
   * 모달은 다시 마운트되는데, 시각을 모달이 들고 있으면 경과 초가 0부터 다시 센다.
   */
  const [extractStartedAt, setExtractStartedAt] = useState(0);
  // 저장 시 addProduct 가 캐시를 mutate 하므로 여기서는 읽기만 한다(개수·중복 판정).
  const products = useProducts();
  /** 확인 중인 결과가 이미 내 선반에 있으면 그 항목(m15) — 담아도 개수가 늘지 않는다. */
  const existing = found ? findOnShelf(products.value, found) : undefined;
  /** 저장 직전에 선반에 있던 같은 제품. 완료 화면이 "담았어요" 대신 무엇이 바뀌었는지 말한다. */
  const [savedOver, setSavedOver] = useState<Product | undefined>(undefined);

  /*
   * 화면(스캔 탭)을 떠나면 진행 중 AI 요청을 끊는다(m11). 안 끊으면 서버에서 계속 돌아
   * 돌아와 다시 누를 때 사용자당 1건 가드에 429 로 막힌다. StrictMode 재마운트도 새 컨트롤러를 만든다.
   */
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  /** 성분 추출 — 후보를 골랐거나 사진이 있을 때 공통으로 탄다. */
  const extract = useCallback(
    async (input: {
      productName: string;
      capacity?: string;
      productCompany?: string;
      volume?: string;
      imageUrl?: string;
      productFile: File | null;
      labelFile: File | null;
    }) => {
      setPhase("extracting");
      setExtractStartedAt(Date.now());
      setError(null);
      const signal = abortRef.current?.signal;

      try {
        /*
         * 두 사진의 쓰임이 다르다.
         *  - 성분표: 가능한 한 원본을 AI 에 보낸다(글씨 해상도가 곧 정확도).
         *    단, 갤러리 원본이 크거나 HEIF 면 fileToLabelDataUrl 이 재인코딩한다(m12).
         *  - 제품:   256px 썸네일로 줄여 저장만 한다(Q7).
         * 둘은 서로 다른 파일이므로 각자 한 번씩만 변환한다.
         */
        const [labelImage, thumbnail] = await Promise.all([
          input.labelFile ? fileToLabelDataUrl(input.labelFile) : undefined,
          input.productFile ? resizeToThumbnail(input.productFile) : undefined,
        ]);

        const raw = await extractIngredients(
          {
            productName: input.productName,
            // capacity 는 서버 컬럼이 없어 저장하지 않는다. 프롬프트 입력으로만 쓴다.
            capacity: input.capacity || input.volume || undefined,
            productCompany: input.productCompany || undefined,
            productImg: labelImage,
          },
          { signal },
        );

        // raw 는 snake_case 다. 여기(화면 계층)에서 프론트 모델로 옮긴다.
        setFound({
          /*
           * 성분표 사진 경로는 사용자가 보낸 이름으로 고정한다(m21) — 이름을 특정한 제품의 성분표라,
           * AI 가 읽은 표기로 바꾸면 (이름, 브랜드) UPSERT 키가 어긋나 같은 제품이 별도 행이 된다.
           * '이미 선반에 있음'(existing) 판정도 이 이름을 쓴다.
           */
          productName: input.labelFile
            ? input.productName
            : raw.product_name || input.productName,
          category: raw.category,
          ingredients: raw.ingredients,
          thumbnail,
          /*
           * 회사를 비운 채 카탈로그에 걸리면 저장된 브랜드를 쓴다 — 안 쓰면 POST 가
           * (이름, '') 로 같은 제품의 중복 행을 만든다.
           */
          productCompany:
            input.productCompany ||
            (raw.source === "catalog" && raw.brand) ||
            undefined,
          // 성분을 어디서 얻었는지다. 제품 사진은 성분 근거가 아니므로 판단에 넣지 않는다.
          ingredientSource: toIngredientSource(
            raw.source,
            Boolean(input.labelFile),
          ),
          volume: input.volume,
          imageUrl: input.imageUrl,
        });
        setPhase("found");
      } catch (cause: unknown) {
        // 화면을 떠나 끊은 요청 — 오류가 아니다(보여 줄 화면도 이미 없다).
        if (signal?.aborted) return;
        /*
         * 후보 목록이 있으면 그 화면으로 되돌린다 — 37초 걸린 검색 결과를 버리지 않고
         * 다른 후보를 고를 수 있게 한다.
         */
        setPhase(candidates.length > 0 ? "choosing" : "idle");
        setError(toMessage(cause, "성분을 찾지 못했어요"));
      }
    },
    [candidates.length],
  );

  /** 1단계 — 사진이 있으면 성분 추출로 직행, 없으면 후보를 찾는다. */
  const search = useCallback(
    async (input: RegisterInput) => {
      const productName = input.productName.trim();
      if (!productName) {
        setPhase("idle");
        setError("제품 이름을 입력해 주세요.");
        return;
      }

      setError(null);
      setFound(null);
      setSaved(null);
      setSavedOver(undefined);
      setCandidates([]);
      setProductFile(input.productFile);

      // 성분표가 있으면 그게 가장 정확한 근거다. 후보를 고를 이유가 없다.
      if (input.labelFile) {
        await extract({
          productName,
          capacity: input.capacity.trim(),
          productCompany: input.productCompany.trim(),
          productFile: input.productFile,
          labelFile: input.labelFile,
        });
        return;
      }

      setPhase("searching");
      const signal = abortRef.current?.signal;
      try {
        const raw = await searchProductCandidates(
          { query: productName },
          { signal },
        );
        setCandidates(raw.candidates);
        setPhase("choosing");
      } catch (cause: unknown) {
        if (signal?.aborted) return;
        /*
         * ⭐ 검색이 실패해도 **막다른 길로 두지 않는다.**
         * 예전에는 idle 로 되돌려 사용자가 할 수 있는 게 없었다(외부 장애면 몇 시간
         * 등록 자체가 막힌다). 이제 후보 0건 상태로 모달을 열어 "입력한 이름 그대로
         * 등록" 경로를 준다 — 검색은 편의일 뿐, **등록을 막을 이유가 없다.**
         */
        setCandidates([]);
        setPhase("choosing");
        setError(toMessage(cause, "제품을 찾지 못했어요"));
      }
    },
    [extract],
  );

  /**
   * 검색 결과가 없거나 원하는 제품이 없을 때 — **사용자가 입력한 이름 그대로** 진행한다.
   * 성분은 뒤 단계(카탈로그 → 공식몰 → AI)가 알아서 채우고, 못 찾으면 빈 배열로 저장된 뒤
   * 나중에 성분표 사진으로 보완된다.
   */
  const registerTypedName = useCallback(
    async (input: { productName: string; productCompany?: string }) => {
      await extract({
        productName: input.productName.trim(),
        productCompany: input.productCompany?.trim() || undefined,
        productFile,
        labelFile: null,
      });
    },
    [extract, productFile],
  );

  /** 2단계 — 후보를 고르면 그 제품의 성분을 읽는다. */
  const selectCandidate = useCallback(
    async (candidate: ProductCandidate) => {
      await extract({
        productName: candidate.product_name,
        productCompany: candidate.brand ?? undefined,
        volume: candidate.volume ?? undefined,
        // 서버가 허용 호스트인지 이미 걸렀다. 저장 시 서버가 다시 확인하고 받아 온다.
        imageUrl: candidate.image_url ?? undefined,
        // 검색 시 올린 제품 사진을 그대로 썸네일로 쓴다.
        productFile,
        // 이 경로에는 성분표가 없다. 이름·브랜드로 추론한다(빈 배열이 올 수 있다).
        labelFile: null,
      });
    },
    [extract, productFile],
  );

  /** 후보 목록으로 되돌아간다(다른 제품을 고르려는 경우). */
  const backToCandidates = useCallback(() => {
    setFound(null);
    setError(null);
    setPhase("choosing");
  }, []);

  /** 3단계 — 확인한 결과를 선반에 담는다. */
  const confirm = useCallback(async () => {
    if (!found) return;

    setPhase("saving");
    setError(null);
    // 저장 전 선반. 완료 문구는 서버가 정한 id 로 판정한다 — 이름 비교(findOnShelf)는 누르기 전 안내용 추정이다.
    const shelfBefore = products.value;

    try {
      const product = await addProduct({
        productName: found.productName,
        productCompany: found.productCompany,
        // 직접 찍은 사진이 우선. 없으면 서버가 검색 결과 이미지를 받아 저장한다.
        thumbnail: found.thumbnail,
        thumbnailUrl: found.imageUrl,
        category: found.category,
        ingredients: found.ingredients,
        ingredientSource: found.ingredientSource,
      });

      setSaved(product);
      setSavedOver(shelfBefore.find((item) => item.id === product.id));
      setFound(null);
      setCandidates([]);
      setPhase("done");
    } catch (cause: unknown) {
      /*
       * ⚠️ 실패해도 `found` 를 지우지 않는다 — 모달을 열어 둔 채 에러를 보여 주고
       * 다시 시도할 수 있게 한다. 여기서 닫으면 1분 넘게 걸린 결과가 통째로 날아간다.
       */
      setPhase("found");
      setError(toMessage(cause, "선반에 담지 못했어요"));
    }
  }, [found, products.value]);

  /** 저장하지 않고 모달을 닫는다. 폼 입력은 그대로 두어 다시 검색할 수 있다. */
  const dismiss = useCallback(() => {
    setFound(null);
    setCandidates([]);
    setError(null);
    setPhase("idle");
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setCandidates([]);
    setFound(null);
    setSaved(null);
    setSavedOver(undefined);
    setProductFile(null);
  }, []);

  return {
    phase,
    error,
    candidates,
    found,
    saved,
    existing,
    savedOver,
    extractStartedAt,
    shelfCount: products.value.length,
    search,
    selectCandidate,
    registerTypedName,
    backToCandidates,
    confirm,
    dismiss,
    reset,
  };
}

/**
 * 선반에서 같은 제품을 찾는다 — 서버 UPSERT 키와 같은 (이름, 브랜드). 서버는 둘 다 trim 하고
 * 브랜드 미상을 빈 문자열로 저장하며(`POST /api/products`), 키 비교는 대소문자를 가리지 않는다
 * (utf8mb4_unicode_ci — 'COSRX' 와 'cosrx' 는 같은 행).
 */
export function findOnShelf(
  shelf: readonly Product[],
  target: { productName: string; productCompany?: string },
): Product | undefined {
  const key = (name: string, brand = "") =>
    `${name.trim()}\n${brand.trim()}`.toLowerCase();
  const wanted = key(target.productName, target.productCompany);
  return shelf.find(
    (item) => key(item.productName, item.productCompany) === wanted,
  );
}

/**
 * `/api/ai/ingredients` 의 `source`(어디서 성분을 얻었나) → 저장 출처 등급(Q3).
 * 카탈로그 히트는 가장 낮은 `manual` 로 보낸다 — 이미 저장된 목록을 되돌려 보낼 뿐이라
 * 서버 등급 규칙이 기존 출처를 지킨다. 서버가 아직 `source` 를 안 주거나 모르는 값이면 예전 판정.
 */
function toIngredientSource(
  source: IngredientsResponse["source"],
  hasLabelFile: boolean,
): IngredientSource {
  switch (source) {
    case "photo":
      return "photo";
    case "brand":
      return "hwahae";
    case "web":
      return "fallback";
    case "catalog":
      return "manual";
    default:
      return hasLabelFile ? "photo" : "manual";
  }
}

/**
 * AI 호출이든 저장이든 사용자에게 보일 문구는 한 곳에서 만든다.
 *
 * `ApiError.message` 는 `API ${status} ${statusText}` 로 고정돼 있어 그대로 쓰면
 * 서버가 body 에 담아 준 한글 안내가 버려진다 — body 의 `message` 를 먼저 본다.
 * `PopularProductModal` 도 이걸 쓴다(m11). 재구현하지 말 것.
 */
export function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) {
    const body = cause.body as { message?: string } | null;
    return body?.message ?? `${fallback} (${cause.status})`;
  }
  return cause instanceof Error
    ? cause.message
    : "알 수 없는 오류가 발생했어요.";
}
