/**
 * 네비게이션 단일 출처.
 *
 * `BottomNav`(모바일)와 `SideNav`(데스크톱)가 **같은 배열을 공유**한다.
 * 탭 정의가 두 벌이 되면 반드시 어긋난다 — 한쪽에만 탭을 추가하고 잊는 식으로.
 */

import type { Route } from "next";

export type NavTab = {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  label: string;
  href: Route;
};

/**
 * ⚠️ 순서가 곧 사용 흐름이다 — 고민에서 출발해 루틴으로 끝난다(2026-08-19 재배치).
 * 예전에는 `루틴 → 프로필` 이었는데, 프로필이 "내 고민"이 되면서 **루틴보다 앞**으로 왔다.
 * 고민을 정해야 성분·제품이 정해지고, 그 제품으로 루틴을 만들기 때문이다.
 */
export const NAV_TABS: readonly NavTab[] = [
  { icon: "home", label: "홈", href: "/" },
  { icon: "center_focus_strong", label: "스캔", href: "/scan" },
  { icon: "psychology", label: "내 고민", href: "/concern" },
  { icon: "event_repeat", label: "루틴", href: "/routine" },
];

/**
 * 탭 활성 판정 — 하위 경로(`/routine/new`)에서도 그 탭이 켜져 있어야 "지금 어디인지"가 보인다
 * (3라운드 I13). `/` 는 모든 경로의 접두사라 정확히 일치할 때만.
 * `/` 를 붙여 비교해야 `/routines` 같은 형제 경로가 `/routine` 탭을 켜지 않는다.
 */
export function isActiveTab(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 루틴 수행 화면(`/routine/<루틴id>/1` …)은 한 가지 일에 집중시키는 화면이라
 * 네비게이션을 감춘다. 빠져나가는 길은 헤더의 닫기 버튼이다.
 *
 * **모바일·데스크톱 양쪽에 같이 적용해야 한다** — 사이드바만 남으면 몰입이 깨진다.
 */
export const IMMERSIVE_PATH = /^\/routine\/[^/]+\//;

export function isImmersive(pathname: string): boolean {
  return IMMERSIVE_PATH.test(pathname);
}
