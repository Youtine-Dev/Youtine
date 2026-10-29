"use client";

import { useProducts } from "@/lib/data";
import { realWarnings } from "@/lib/warnings";
import type { Product } from "@/types/skincare";

export type IngredientAlertItem = {
  id: string;
  productName: string;
  warning: string;
};

export type IngredientAlertsState =
  | { kind: "checking" }
  | { kind: "error"; retry: () => void; errorMessage: string | null }
  | { kind: "no-products" }
  | { kind: "no-warnings"; pendingCount: number }
  | { kind: "ready"; alerts: IngredientAlertItem[]; pendingCount: number };

/**
 * "성분 정보 부족" 고정 문구는 경고가 아니다 — 성분 0개 제품이 "주의" 알림으로 떴다(3라운드 m27).
 * 그런 제품은 `no-warnings` 로 떨어진다(분석은 끝났으니 pending 도 아니다).
 */
function toAlerts(products: Product[]): IngredientAlertItem[] {
  return products.flatMap((product) =>
    realWarnings(product.warnings ?? []).map((warning, index) => ({
      id: `${product.id}-${index}`,
      productName: product.productName,
      warning,
    })),
  );
}

/**
 * 등록 제품의 주의사항(`Product.warnings`)을 **DB 에서 읽기만** 한다.
 *
 * ⛔ 예전에는 이 훅이 주의사항 없는 제품을 발견하면 클라이언트에서 순차로 AI 를
 *    호출했다(제품당 약 34초). 그 호출들이 **사용자당 동시 1건 가드를 독점**해서
 *    홈에 들어올 때마다 "내 고민"·루틴 생성이 429 로 튕겼고, 탭을 옮기면 고아가 된
 *    진행 중 호출이 가드를 쥔 채 남았다(사용자 보고 2026-08-20).
 *    생성은 제품 등록 시점에 서버 백그라운드 큐가 한다(`src/lib/ai/warningsQueue.ts`).
 *    홈은 AI 를 부르지 않는다 — 저장된 것을 즉시 보여줄 뿐이다.
 *
 * `pendingCount` = 아직 분석이 안 끝난 제품 수(warnings NULL). 서버 큐가 채우면
 * 다음 `/products` 재검증 때 자연히 줄어든다.
 */
export function useIngredientAlerts(): IngredientAlertsState {
  const { ready, value: products, error, errorMessage, retry } = useProducts();

  if (!ready) return { kind: "checking" };
  if (error) return { kind: "error", retry, errorMessage };
  if (products.length === 0) return { kind: "no-products" };

  const pendingCount = products.filter(
    (product) => product.warnings === undefined,
  ).length;

  const alerts = toAlerts(products);
  if (alerts.length === 0) return { kind: "no-warnings", pendingCount };

  return { kind: "ready", alerts, pendingCount };
}
