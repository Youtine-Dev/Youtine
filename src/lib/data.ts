"use client";

/**
 * 서버 데이터 계층 — `useStored`(localStorage)를 대체한다.
 *
 * **반환 모양을 `useStored` 와 맞췄다**(`{ ready, value }`). 화면의 `if (!ready) return null`
 * 이 그대로 동작하게 두고, 거기에 `error`·`retry` 를 더한 것이다.
 *
 * ⚠️ **`ready` 는 "로딩이 끝났다"이지 "성공했다"가 아니다.** 실패해도 `ready` 는 true 가 되고
 * `value` 는 폴백이다. `error` 를 확인하지 않으면 **네트워크 실패가 "데이터 없음"으로 위장된다.**
 * 화면은 `<DataState>` 로 로딩·에러를 먼저 처리한다.
 *
 * 쓰기 함수는 성공 후 관련 키를 `mutate` 한다 — localStorage 시절의 pub/sub 자동 갱신을
 * 서버에서도 유지하기 위함이다. 안 하면 저장해도 화면이 그대로다.
 */

import useSWR, { mutate, type SWRConfiguration } from "swr";

import {
  fetchShelfReport,
  recommendConcernIngredients,
  type ConcernIngredient,
  type ShelfReportResponse,
} from "@/api/ai";
import { ApiError } from "@/api/client";

import {
  createProduct,
  fetchPopularProducts,
  fetchProducts,
  fetchProductsByIngredient,
  removeProduct as removeProductRequest,
  searchCatalogProducts,
  type IngredientSource,
} from "@/api/products";
import {
  fetchConcernKnowledge,
  fetchIngredientKnowledge,
  type ConcernKnowledge,
  type IngredientKnowledge,
} from "@/api/knowledge";
import { fetchSkinProfile, saveSkinProfile } from "@/api/profile";
import {
  deleteRoutines as deleteRoutinesRequest,
  fetchRoutines,
  saveRoutines as saveRoutinesRequest,
  type RoutineInput,
} from "@/api/routines";
import { createRun, fetchRuns } from "@/api/runs";
import type {
  Product,
  Routine,
  RoutineRun,
  SkinProfile,
} from "@/types/skincare";

/** SWR 캐시 키. 쓰기 후 무엇을 다시 불러올지 정하는 기준이라 한 곳에 모은다. */
const KEYS = {
  products: "/products",
  popular: "/products/popular",
  routines: "/routines",
  runs: "/runs",
  profile: "/profile",
  /** 고민 성분 추천. **실제 키에는 고민 문자열이 붙는다**(아래 훅 참조). */
  concern: "/ai/concern",
  /** 선반 상호작용 분석. 서버가 지문으로 무효화하므로 클라이언트 키는 고정이다. */
  shelfReport: "/ai/report",
  /** 성분으로 찾은 제품. 실제 키에는 성분명이 붙는다. */
  byIngredient: "/products/by-ingredient",
  /** 성분 하나의 공유 지식. 실제 키에는 성분명이 붙는다. DB 읽기라 AI 옵션이 아니다. */
  ingredientKnowledge: "/knowledge/ingredient",
  concernKnowledge: "/knowledge/concerns",
} as const;

/**
 * DB 가 죽었거나 SSH 터널이 안 열려 있으면 503 이 **계속** 난다.
 * 기본값(무한 재시도)이면 콘솔이 에러로 뒤덮이므로 몇 번만 시도하고 화면에 넘긴다.
 */
const SWR_OPTIONS: SWRConfiguration = { errorRetryCount: 3 };

/**
 * **AI 호출 전용 옵션.** 위 기본값을 그대로 쓰면 429("이미 처리 중")가 쏟아진다.
 *
 * `/api/ai/*` 는 쿠키 사용자당 동시 1건만 허용하는데(`src/lib/ai/guard.ts`),
 * 이 호출은 10~30초가 걸린다. SWR 기본값은 그 사이에 **스스로 두 번째 요청을 만든다**:
 *  - `revalidateOnFocus`   창을 갔다 오면 재요청
 *  - `revalidateIfStale`   컴포넌트가 다시 마운트되면 재요청(탭 이동·HMR)
 *  - `dedupingInterval`    기본이 2초뿐이라 중복으로 안 쳐 준다
 *
 * 그리고 **나중에 시작한 요청이 이긴다.** 30초 걸려 성공한 첫 응답이 버려지고
 * 429 에러가 화면에 남는다 — 사용자 눈에는 "계속 429"로 보인다.
 *
 * `errorRetryCount: 0` 인 이유: 429 를 자동 재시도하면 앞 요청이 아직 살아 있어 또 429다.
 * 다시 부를지는 사람이 정한다(`Resource.retry`).
 */
const AI_SWR_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  errorRetryCount: 0,
  /* 호출 자체가 10~30초다. 그 안에 들어온 같은 요청은 전부 한 건으로 묶는다. */
  dedupingInterval: 120_000,
};

export type Resource<T> = {
  /** 첫 로딩이 끝났는가. **성공 여부가 아니다** — `error` 를 따로 봐야 한다. */
  ready: boolean;
  value: T;
  error: boolean;
  /**
   * 서버가 준 실패 사유. 없으면 `null`(네트워크 자체가 끊긴 경우 등).
   *
   * 이게 없으면 화면이 전부 "인터넷 연결을 확인해 주세요"로 뭉개진다 —
   * 429("이미 처리 중")처럼 **연결과 무관한 실패**를 사용자가 오해한다.
   */
  errorMessage: string | null;
  retry: () => void;
};

/** 서버가 준 `{ message }` 만 꺼낸다. 그 밖의 오류 내용은 화면에 올리지 않는다. */
function serverMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message : null;
}

/**
 * `key` 가 `null` 이면 **호출하지 않는다**(SWR 의 조건부 fetch).
 * 아직 물어볼 대상이 정해지지 않은 화면 — 예: 고민을 적기 전, 성분을 고르기 전 — 에 쓴다.
 */
function useResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  fallback: T,
  options: SWRConfiguration = SWR_OPTIONS,
): Resource<T> {
  const { data, error, mutate: revalidate } = useSWR<T>(key, fetcher, options);

  return {
    // 호출하지 않기로 한 상태는 "기다릴 것도 없다" — 로딩으로 보이면 안 된다.
    ready: key === null || data !== undefined || error !== undefined,
    value: data ?? fallback,
    error: error !== undefined,
    errorMessage: serverMessage(error),
    retry: () => void revalidate(),
  };
}

/**
 * 폴백은 **모듈 상수**로 둔다. 인라인 `[]` 를 넘기면 매 렌더 새 배열이라
 * 이 값을 의존성에 쓰는 `useMemo` 가 전부 무의미해진다(useStored 때와 같은 함정).
 */
const NO_PRODUCTS: Product[] = [];
const NO_ROUTINES: Routine[] = [];
const NO_RUNS: RoutineRun[] = [];

export const useProducts = () =>
  useResource(KEYS.products, fetchProducts, NO_PRODUCTS);

/**
 * 많이 담긴 순 공유 카탈로그. **빈 배열이 정상이다**(아무도 아직 담지 않은 상태).
 * 화면은 그때 시드 카탈로그로 폴백한다.
 */
export const usePopularProducts = () =>
  useResource(KEYS.popular, fetchPopularProducts, NO_PRODUCTS);

/**
 * 카탈로그 전체 검색(m26). `query` 가 비면 호출하지 않는다. 디바운스는 화면이 한다.
 * 키에 검색어가 붙어 같은 검색어로 돌아오면 캐시가 즉시 답한다.
 */
export const useCatalogSearch = (query: string | null) =>
  useResource(
    query ? `${KEYS.popular}?q=${encodeURIComponent(query)}` : null,
    () => searchCatalogProducts({ query: query ?? "" }),
    NO_PRODUCTS,
  );

/**
 * 인기 목록 + 검색 결과 키 전부. 담기·빼기 뒤 같이 무효화한다 — 검색 키를 빠뜨리면
 * 방금 담은 제품이 같은 검색어에서 계속 "결과 없음"이다(m26).
 */
const isCatalogKey = (key: unknown) =>
  typeof key === "string" && key.startsWith(KEYS.popular);

const NO_CONCERN_INGREDIENTS: ConcernIngredient[] = [];

/**
 * 고민에 도움이 되는 성분. **`wonder` 가 없으면 호출하지 않는다**(키가 null 이면 SWR 이 쉰다).
 *
 * ⭐ **고민 문자열이 키의 일부다.** 같은 고민으로 돌아오면 캐시가 즉시 답해
 * 10~30초짜리 호출을 다시 하지 않는다. 고민을 바꾸면 키가 달라져 새로 부른다.
 */
export function useConcernIngredients(
  wonder: string | null,
): Resource<ConcernIngredient[]> {
  const res = useResource(
    wonder ? `${KEYS.concern}?w=${encodeURIComponent(wonder)}` : null,
    // 키가 null 이면 이 함수는 호출되지 않는다. 그래서 빈 문자열 폴백이 실행될 일이 없다.
    () => recommendConcernIngredients({ wonder: wonder ?? "" }),
    null,
    // 이 레포에서 SWR 로 부르는 유일한 AI 엔드포인트다 — 자동 재검증을 끈다.
    AI_SWR_OPTIONS,
  );

  // 응답이 `{ ingredients }` 한 겹이라 화면이 쓰기 좋게 벗겨 준다.
  return { ...res, value: res.value?.ingredients ?? NO_CONCERN_INGREDIENTS };
}

/**
 * 그 성분이 든 카탈로그 제품. `name` 이 없으면 호출하지 않는다.
 *
 * ⚠️ **빈 배열은 "아직 담긴 제품이 없다"** 는 뜻이다(카탈로그는 누군가 담아야 채워진다).
 * 화면이 "그런 제품이 없다"로 읽히지 않게 안내를 구분해야 한다.
 */
/**
 * 선반 서명 — 리포트 SWR 키의 일부. 서버 지문(shelfFingerprint)과 **같은 사건**에만
 * 바뀌도록 같은 입력(정렬된 id + ingredients)을 쓴다. 32비트 djb2 로 짧게 줄인다 —
 * 충돌해 봐야 클라이언트가 스테일을 한 번 더 보여줄 뿐, 서버는 진짜 지문으로 판정한다.
 */
function shelfSignature(products: readonly Product[]): string {
  const canonical = JSON.stringify(
    products
      .map((p) => ({ id: p.id, ingredients: p.ingredients }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash * 33) ^ canonical.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * 선반 상호작용 분석 리포트 — **캐시 전용 조회**(AI 를 절대 태우지 않는다).
 *
 * 지문이 맞는 서버 캐시가 있으면 그 내용, 없으면 `null`("아직 분석 전") — 화면은
 * `null` 을 보고 **분석하기 버튼**을 띄운다(사용자 결정 2026-08-20 — 분석은 명시적
 * 버튼으로만). 실제 생성은 `generateShelfReport()` 가 한다.
 *
 * 무효화는 **키 교체**다: 키에 선반 서명이 들어 있어 제품을 담고 빼면 키가 바뀌고,
 * 새 키의 캐시 전용 조회가 `null` 을 받아 버튼이 자연히 다시 나타난다.
 */
export function useShelfReport(): Resource<ShelfReportResponse | null> {
  const products = useProducts();
  const key =
    products.ready && !products.error && products.value.length > 0
      ? `${KEYS.shelfReport}?s=${shelfSignature(products.value)}`
      : null;

  // 캐시 전용이라 싸다(DB 1회) — AI 옵션이 아니라 기본 SWR 옵션으로 신선도를 유지한다.
  return useResource<ShelfReportResponse | null>(
    key,
    () => fetchShelfReport(),
    null,
  );
}

/**
 * 분석을 실제로 생성한다(1~2분 AI). 성공하면 현재 선반 서명 키에 결과를 채워
 * `useShelfReport` 구독자가 즉시 갱신된다. 실패는 예외로 올라간다 — 화면이 알린다.
 */
export async function generateShelfReport(
  products: readonly Product[],
): Promise<void> {
  const report = await fetchShelfReport({ generate: true });
  await mutate(`${KEYS.shelfReport}?s=${shelfSignature(products)}`, report, {
    revalidate: false,
  });
}

/**
 * 성분 하나의 공유 지식(고민별 도움·타입별 주의·시너지·충돌). DB 읽기라 즉시 답한다.
 * `name` 이 없으면(모달 닫힘) 호출하지 않는다.
 */
export const useIngredientKnowledge = (name: string | null) =>
  useResource<IngredientKnowledge | null>(
    name ? `${KEYS.ingredientKnowledge}?n=${encodeURIComponent(name)}` : null,
    () => fetchIngredientKnowledge({ name: name ?? "" }),
    null,
  );

/** 고민 시나리오별 성분 사전. `enabled` 는 사전 카드를 펼쳤을 때만 부르기 위한 것. */
export const useConcernKnowledge = (enabled: boolean) =>
  useResource<ConcernKnowledge | null>(
    enabled ? KEYS.concernKnowledge : null,
    fetchConcernKnowledge,
    null,
  );

export const useProductsByIngredient = (name: string | null) =>
  useResource(
    name ? `${KEYS.byIngredient}?n=${encodeURIComponent(name)}` : null,
    () => fetchProductsByIngredient({ name: name ?? "" }),
    NO_PRODUCTS,
  );

export const useRoutines = () =>
  useResource(KEYS.routines, fetchRoutines, NO_ROUTINES);

export const useRuns = () => useResource(KEYS.runs, fetchRuns, NO_RUNS);

export const useSkinProfile = () =>
  useResource<SkinProfile | null>(KEYS.profile, fetchSkinProfile, null);

// ── 쓰기 ────────────────────────────────────────────────────────────
// 실패하면 예외가 그대로 올라간다. 화면이 "저장하지 못했어요"를 보여줘야 하므로
// 여기서 삼키지 않는다(localStorage 시절 `null` 반환과 같은 취지다).

export async function addProduct(input: {
  productName: string;
  productCompany?: string;
  category: string;
  ingredients: string[];
  /** 직접 찍은 사진(256px data URL) */
  thumbnail?: string;
  /** 검색 결과 이미지 주소. 서버가 받아서 저장한다(직접 찍은 사진이 우선). */
  thumbnailUrl?: string;
  ingredientSource?: IngredientSource;
}): Promise<Product> {
  const created = await createProduct(input);
  // 리포트 무효화는 따로 안 한다 — useShelfReport 의 키에 선반 서명이 들어 있어
  // products 갱신이 곧 키 교체다.
  // 인기 카탈로그는 담긴 수(shelf_count) 순이라 담기가 곧 순위 변경이다 — 같이 무효화한다(m10).
  await Promise.all([mutate(KEYS.products), mutate(isCatalogKey)]);
  return created;
}

// setProductWarnings 는 삭제했다 — 주의사항 생성이 서버 큐로 옮겨간 뒤 호출처 0건
// (리뷰 R4). 클라이언트 생성 패턴을 되살리지 않는다.

export async function removeProduct(input: { id: string }): Promise<void> {
  await removeProductRequest(input);
  // 리포트 키는 products 갱신으로 같이 바뀐다(선반 서명). 인기 카탈로그는 빼기도 순위에 반영(m10).
  await Promise.all([mutate(KEYS.products), mutate(isCatalogKey)]);
}

export async function saveRoutines(routines: RoutineInput[]): Promise<void> {
  await saveRoutinesRequest({ routines });
  await mutate(KEYS.routines);
}

/**
 * 세트(condition) 단위 삭제 — 루틴 삭제 버튼(사용자 피드백 2026-08-20).
 * 배열을 받는 이유: 기본 루틴 그룹은 "고민 집중이 아닌 전부"라 이관 데이터의
 * 임의 condition 이 섞일 수 있다. 화면에 보이는 그룹과 같은 범위를 지우려면
 * 그 그룹의 condition 들을 각각 지워야 한다(재검토 N2).
 */
export async function deleteRoutines(conditions: string[]): Promise<void> {
  for (const condition of conditions) {
    await deleteRoutinesRequest({ condition });
  }
  await mutate(KEYS.routines);
}

export async function appendRun(
  input: Omit<RoutineRun, "id">,
): Promise<RoutineRun> {
  const created = await createRun(input);
  await mutate(KEYS.runs);
  return created;
}

export async function saveProfile(
  input: Omit<SkinProfile, "updatedAt">,
): Promise<void> {
  await saveSkinProfile(input);
  await mutate(KEYS.profile);
}
