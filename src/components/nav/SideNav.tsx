"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";
import { YoutineIcon } from "@/components/YoutineIcon";

import { NAV_TABS, isActiveTab, isImmersive } from "./tabs";
import styles from "./SideNav.module.css";

/**
 * lg(1024px) 이상에서 쓰는 좌측 고정 네비게이션.
 *
 * 이게 없던 동안 **≥768px 에서는 홈·스캔·루틴·프로필을 오갈 방법이 없었다** —
 * `BottomNav` 가 768px 부터 `display:none` 인데 대체 네비가 없었고,
 * `TopAppBar` 에는 링크가 하나도 없다(단방향 CTA 링크만 흩어져 있었다).
 *
 * 표시/숨김은 **CSS 로만** 전환한다. JS 로 뷰포트를 분기하면 SSR/하이드레이션이 어긋난다.
 */
export function SideNav() {
  const pathname = usePathname();

  // 루틴 수행 화면은 데스크톱에서도 몰입 화면이다 — BottomNav 와 같은 규칙을 공유한다.
  if (isImmersive(pathname)) return null;

  return (
    <nav className={styles.nav} aria-label="주요 메뉴">
      <span className={styles.brand}>
        {/* 브랜드 아이콘 — 파비콘(src/app/icon.svg)과 같은 아트워크 */}
        <YoutineIcon size={30} className={styles.brandIcon} />
        <span className={styles.brandName}>유틴</span>
      </span>

      <ul className={styles.list}>
        {NAV_TABS.map((tab) => {
          const active = isActiveTab(pathname, tab.href);

          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                className={`${styles.item} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={tab.icon} filled={active} />
                <span className={styles.label}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
