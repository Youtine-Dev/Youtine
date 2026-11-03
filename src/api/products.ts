/**
 * 내 선반 제품. 서버 `/api/products` 를 부른다.
 *
 * 이 계층은 **호출만** 한다 — 캐시·재검증은 `src/lib/data/` 의 훅이, 화면용 변환은 컴포넌트가 한다.
 */

import type { Product } from "@/types/skincare";

import { api } from "./client";

export const fetchProducts = () => api.get<Product[]>("/products");

/**
 * 많이 담긴 순 공유 카탈로그.
 * **개인 사진(`thumbnail`)은 오지 않는다** — 공유 이미지(`image`)만 담겨 있다.
 * 아직 아무도 담지 않았으면 빈 배열이다(정상).
 */
export const fetchPopularProducts = () =>
  api.get<Product[]>("/products/popular");

/**
 * 공유 카탈로그 **전체**에서 이름·브랜드·카테고리로 찾는다(AI 없음, 최대 20개).
 * 인기 목록과 같은 엔드포인트라 개인 사진은 오지 않는다. 빈 배열은 "아직 아무도 안 담음"이다.
 */
export const searchCatalogProducts = (input: { query: string }) =>
  api.get<Product[]>("/products/popular", { query: { q: input.query } });

/**
 * 그 성분이 든 제품을 카탈로그에서 찾는다.
 *
 * **빈 배열은 "아직 담긴 제품이 없다"는 뜻**이지 그런 제품이 없다는 뜻이 아니다 —
 * 카탈로그는 누군가 담아야 채워진다. 화면이 그 차이를 말해 줘야 한다.
 */
export const fetchProductsByIngredient = (input: { name: string }) =>
  api.get<Product[]>("/products/by-ingredient", {
    query: { name: input.name },
  });

/** 성분 출처. 화면에 표시해야 하므로 서버가 NOT NULL 로 받는다. */
export type IngredientSource = "photo" | "hwahae" | "fallback" | "manual";

export const createProduct = (input: {
  productName: string;
  productCompany?: string;
  category: string;
  ingredients: string[];
  /** 직접 찍은 사진의 256px data URL */
  thumbnail?: string;
  /**
   * 검색 결과에서 온 이미지 주소.
   * **서버가 받아서 data URL 로 바꿔 저장한다** — 클라이언트가 외부 이미지를 가져오지 않는다
   * (CORS 에 걸리고, 무엇보다 허용 호스트 검증이 서버에 있어야 한다).
   * `thumbnail` 이 함께 오면 직접 찍은 사진이 우선이다.
   */
  thumbnailUrl?: string;
  ingredientSource?: IngredientSource;
}) => api.post<Product>("/products", input);

// updateProductWarnings 는 삭제했다 — 주의사항 생성이 서버 큐로 옮겨가 호출처 0건(리뷰 R4).
// 서버 PATCH 라우트도 삭제했다(4라운드 M1 — 공유 주의사항을 누구나 덮었다). 되살리지 않는다.

/** 내 선반에서만 뺀다. 공유 카탈로그의 제품 자체는 남는다. */
export const removeProduct = (input: { id: string }) =>
  api.delete<{ ok: boolean }>("/products", { query: { id: input.id } });
