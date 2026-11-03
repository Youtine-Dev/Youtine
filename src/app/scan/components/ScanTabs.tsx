import Link from "next/link";

import { Icon } from "@/components/Icon";

import styles from "./ScanTabs.module.css";

/**
 * 스캔 탭의 상단 하위 메뉴.
 *
 * **서버 컴포넌트다.** 탭 상태가 URL(`/scan?tab=`)에만 살기 때문에 훅이 필요 없다 —
 * 링크 4개면 끝이라 `role="tablist"` + 화살표 키 계약(APG)을 떠안지 않는다.
 * 그 계약은 `npm run check`·`build` 가 검증해 주지 못하는 종류라 안 지는 편이 낫다.
 */

export type ScanTab = "add" | "popular" | "shelf" | "report";

/**
 * ⚠️ 라벨을 짧게 쓴다. 390px 가용폭은 358px 뿐이고, 폰트 폴백(Pretendard CDN 실패 →
 * Malgun Gothic)이 걸리면 더 넓어진다. 전체 이름("AI 분석 리포트")은 각 섹션의 h2 가 든다.
 */
export const SCAN_TABS = [
  { id: "add", label: "등록", icon: "add_a_photo" },
  { id: "popular", label: "인기", icon: "trending_up" },
  { id: "shelf", label: "선반", icon: "inventory_2" },
  { id: "report", label: "리포트", icon: "analytics" },
] as const satisfies readonly { id: ScanTab; label: string; icon: string }[];

/**
 * 쿼리 문자열을 탭으로 좁힌다.
 *
 * ⚠️ **없으면 빈 화면이 뜬다.** typedRoutes 의 `Route` 타입은 `?${string}` 가 나머지를
 * 통째로 먹어서 `?tab=shefl` 같은 오타도 빌드를 통과한다. 좁히지 않으면 네 패널이 전부
 * `hidden` 이 되어 아무것도 안 보인다 — 에러도 안 난다.
 * 배열(`?tab=a&tab=b`)·`undefined` 도 같은 경로로 기본 탭에 떨어진다.
 */
export function toScanTab(value: string | string[] | undefined): ScanTab {
  return SCAN_TABS.find((tab) => tab.id === value)?.id ?? "add";
}

/**
 * 성분 없는 제품의 '성분표 촬영하기'(4라운드 m21) — 등록 폼을 이름·브랜드로 채우고 성분표 카메라를 연다.
 * 서버 UPSERT 키가 (이름, 브랜드)라 글자가 같아야 그 행의 성분이 채워진다 — 손으로 다시 치면 별도 행이 된다.
 * URL 로 넘기는 이유: 홈·성분 상세처럼 등록 폼 밖(다른 페이지)에서도 누른다. 받는 쪽은 `ScanWorkspace`.
 */
export function labelCaptureHref(product: {
  productName: string;
  productCompany?: string;
}) {
  const params = new URLSearchParams({ tab: "add", name: product.productName });
  if (product.productCompany) params.set("brand", product.productCompany);
  return `/scan?${params.toString()}` as const;
}

export function ScanTabs({ active }: { active: ScanTab }) {
  return (
    <nav className={styles.bar} aria-label="스캔 하위 메뉴">
      {SCAN_TABS.map(({ id, label, icon }) => {
        const current = id === active;

        return (
          <Link
            key={id}
            href={`/scan?tab=${id}`}
            /*
             * 명시가 필요하다 — `/scan` 은 `searchParams` 를 읽어 동적 라우트이고,
             * 이 레포에는 `loading.tsx` 가 없어 기본값(`auto`)이면 프리페치를 통째로 건너뛴다.
             * (프로덕션에서만 도는 최적화라 `npm run dev` 로는 체감되지 않는다.)
             */
            prefetch
            className={
              current ? `${styles.item} ${styles.active}` : styles.item
            }
            aria-current={current ? "page" : undefined}
          >
            <Icon name={icon} filled={current} size="sm" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
