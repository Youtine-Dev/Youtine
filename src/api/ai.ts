/**
 * AI 엔드포인트 클라이언트 래퍼.
 *
 * AGENTS.md 컨벤션대로 **raw 응답(snake_case)을 그대로 반환**한다.
 * camelCase 변환·한글화·derived 필드는 훅/컴포넌트에서 한다.
 * (봉투 벗기기와 스키마 검증은 이미 Route Handler 가 끝냈다.)
 *
 * 프론트는 항상 같은 오리진 `/api/ai/*` 만 부른다 — 헤드리스 Claude 연동 방식이 바뀌어도
 * 이 파일과 화면 코드는 그대로다.
 */

import { api } from "./client";

/** 후보 1건 — 프롬프트 출력 스키마 그대로 */
export type ProductCandidate = {
  /** 판촉 문구를 제거한 제품 이름(프롬프트 규칙 5) */
  product_name: string;
  /** 페이지에서 확인 못 하면 null (규칙 6) */
  brand: string | null;
  /** 페이지에 없으면 null (규칙 7) */
  volume: string | null;
  /**
   * 제품 썸네일 주소 (규칙 9). 확인 못 하면 null.
   * **서버가 허용 호스트인지 이미 걸렀다** — 화면은 그대로 띄워도 된다.
   */
  image_url: string | null;
};

export type ProductSearchResponse = {
  /** **빈 배열이 정상 응답이다** (프롬프트 규칙 3: 화해에 없으면 []) */
  candidates: ProductCandidate[];
};

/** 성분 추출 응답 — 프롬프트 출력 스키마 + 라우트가 붙이는 출처 */
export type IngredientsResponse = {
  product_name: string;
  category: string;
  /** **빈 배열이 정상 응답이다** (프롬프트 규칙 2: 확신 없으면 []) */
  ingredients: string[];
  /**
   * 성분을 어디서 얻었나 — **모델 출력이 아니라 라우트가 붙인다**(3라운드 M4).
   * catalog 카탈로그 히트 · brand 공식몰 · photo 사진 판독 · web 웹 추정.
   */
  source?: "catalog" | "brand" | "photo" | "web";
  /** 카탈로그에 저장된 브랜드. `source: "catalog"` 일 때만 온다(빈 문자열 = 브랜드 미상). */
  brand?: string;
};

/** 루틴 단계 1개 — 프롬프트 출력 스키마 그대로 */
export type RoutineStepResponse = {
  routine_name: string;
  /** 초 단위 */
  estimated_time: number;
  /** 제품 **이름** 배열 (id 아님) */
  using_product: string[];
  how_to_use: string[];
  tips: string[];
  /** 단수형 키에 배열 — 명세 그대로 */
  warning: string[];
};

export type RoutineResponse = {
  morning: RoutineStepResponse[];
  evening: RoutineStepResponse[];
  /**
   * wonder 요약 키워드(2~8자 요구) — 루틴 이름 "블랙헤드 - 저녁 루틴" 조합용.
   * 라우트가 길이 위반(2~20자 밖)을 null 로 강등한다(프롬프트 규칙 9, 2026-08-20 추가).
   */
  concern_summary: string | null;
};

/** 고민에 도움이 되는 성분 1건 — 프롬프트 출력 스키마 그대로 */
export type ConcernIngredient = {
  name: string;
  /** 이 고민에 어떻게 도움이 되는지(40자 이내, 규칙 4) */
  effect: string;
  /** 알려진 주의점. 없으면 null (규칙 6) */
  caution: string | null;
};

export type ConcernResponse = {
  /** **빈 배열이 정상 응답이다** (규칙 7: 고를 수 없으면 []) */
  ingredients: ConcernIngredient[];
};

/** 피부 타입별 주의 1건 — interactions 프롬프트 출력 스키마 그대로(snake_case) */
export type SkinTypeCaution = {
  skin_type: "건성" | "지성" | "복합성" | "민감성";
  ingredient: string;
  products: string[];
  caution: string;
};

/** 충돌(conflicts)·시너지(synergies) 공용 — 서로 다른 제품에 나뉜 성분 조합 */
export type IngredientPair = {
  ingredients: string[];
  products: string[];
  description: string;
};

export type ShelfSuggestion = {
  /** 보유하지 **않은** 성분(규칙 5 — 라우트가 보유 성분 제안을 걸러낸다) */
  ingredient: string;
  reason: string;
};

export type ShelfReportResponse = {
  /** 네 배열 모두 **빈 배열이 정상 응답이다** (규칙 2: 확신 없으면 []) */
  skin_type_cautions: SkinTypeCaution[];
  conflicts: IngredientPair[];
  synergies: IngredientPair[];
  suggestions: ShelfSuggestion[];
};

/**
 * 검색어로 제품 후보를 찾는다.
 *
 * `/api/ai/*` 중 **유일하게 웹 검색을 쓴다**(화해 검색 결과가 근거).
 * 실측 18~37초 — 화면에 진행 표시가 필요하다.
 */
export function searchProductCandidates(
  input: { query: string },
  // 화면을 떠나면 abort — 서버가 request.signal 로 자식을 끝내 사용자당 1건 슬롯을 비운다(4라운드 m11).
  options?: { signal?: AbortSignal },
) {
  return api.post<ProductSearchResponse>("/ai/search", input, options);
}

/**
 * 제품 성분 추출.
 * @param productImg data URL. **원본을 보낸다** — 성분표 글씨 해상도가 곧 정확도다.
 *   (저장용 썸네일은 별도로 축소한다.)
 */
export function extractIngredients(
  input: {
    productName: string;
    capacity?: string;
    productCompany?: string;
    productImg?: string;
  },
  options?: { signal?: AbortSignal },
) {
  return api.post<IngredientsResponse>("/ai/ingredients", input, options);
}

/** 아침/저녁 루틴 생성. 수십 초가 걸리므로 화면에 진행 표시가 필요하다. */
export function generateRoutine(input: {
  wonder: string;
  usableTime: { morning: string; evening: string };
  products: { productName: string; category: string; ingredients: string[] }[];
}) {
  return api.post<RoutineResponse>("/ai/routine", input);
}

/**
 * 피부 고민에 도움이 되는 성분 추천 (최대 6개).
 * **웹 검색을 쓰지 않아** 다른 AI 호출보다 빠르다(실측 10~30초).
 */
export function recommendConcernIngredients(input: { wonder: string }) {
  return api.post<ConcernResponse>("/ai/concern", input);
}

/**
 * 성분이 화장품에서 하는 역할 — 프롬프트 출력 `{ role }` 에 라우트가 대표명 `name` 을 붙인다.
 * `role: null` 은 정상 응답이다("널리 알려진 역할을 확신할 수 없다", 프롬프트 규칙 1·5).
 */
export type IngredientRoleResponse = { name: string; role: string | null };

/**
 * 성분 칩 하나의 역할 설명. 공유 캐시가 있으면 즉시, 없으면 AI(실측 10~30초) 후 저장된다.
 * `name` 은 칩에 보이는 라벨 원문 그대로 보낸다 — 정규화는 서버가 한다.
 */
export function fetchIngredientRole(input: { name: string }) {
  return api.post<IngredientRoleResponse>("/ai/ingredient-role", input);
}

/**
 * 선반 전체 상호작용 분석 (시너지·충돌·타입별 주의·추가 추천).
 * **선반은 서버가 직접 읽는다.**
 *
 * 기본은 **캐시 전용**(수백 ms) — 지문이 맞는 캐시가 없으면 `null` 이 온다
 * ("아직 분석 전"). `generate: true` 일 때만 AI 를 태운다(1~2분, 진행 표시 필수) —
 * 분석은 명시적 버튼으로만 시작한다(사용자 결정 2026-08-20).
 */
export function fetchShelfReport(input: { generate?: boolean } = {}) {
  return api.post<ShelfReportResponse | null>("/ai/report", input);
}

// fetchWarnings 는 삭제했다 — 주의사항 생성이 서버 등록 시점 큐로 옮겨가
// 클라이언트 호출처 0건(리뷰 R4). /api/ai/warnings 라우트는 서버 큐 계약의 정본으로 남는다.
