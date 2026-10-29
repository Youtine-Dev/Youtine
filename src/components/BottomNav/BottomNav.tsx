"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";
import { NAV_TABS, isActiveTab, isImmersive } from "@/components/nav/tabs";

import styles from "./BottomNav.module.css";

/** 모바일·태블릿 세로용 하단 탭바. lg 이상에서는 `SideNav` 가 대신한다(CSS 로 전환). */
export function BottomNav() {
  const pathname = usePathname();

  if (isImmersive(pathname)) return null;

  return (
    <nav className={styles.nav} aria-label="주요 메뉴">
      {NAV_TABS.map((tab) => {
        const active = isActiveTab(pathname, tab.href);

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`${styles.item} ${active ? styles.active : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={tab.icon} filled={active} />
            <span className={styles.label}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
