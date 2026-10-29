"use client";

import { useEffect } from "react";

/**
 * 모달이 떠 있는 동안 배경 스크롤을 잠근다(사용자 요청 2026-08-20 —
 * 모달 뒤 화면이 스크롤되면 안 된다).
 *
 * **참조 카운트**로 잠근다 — 잠근 모달이 하나라도 있으면 `hidden`, 0 이 되면 해제.
 *
 * ⚠️ 예전엔 "마운트 때 이전 값을 저장 → 언마운트 때 복원"이었다. 자식 모달만 닫힐 때는
 * 맞지만, 탭 전환으로 성분 모달과 그 안의 제품 모달이 **한 서브트리로 함께 삭제**되면
 * React 가 부모 cleanup 을 먼저 돌려 부모가 `''` 로 복원한 뒤 자식이 저장해 둔
 * `'hidden'` 으로 덮었다 — 새로고침 전까지 페이지 전체가 잠겼다(3라운드 M13, 실측).
 * 카운트는 cleanup 순서와 무관하다.
 */
const globalForLock = globalThis as typeof globalThis & {
  __alScrollLocks?: number;
};

export function useBodyScrollLock(): void {
  useEffect(() => {
    globalForLock.__alScrollLocks = (globalForLock.__alScrollLocks ?? 0) + 1;
    document.body.style.overflow = "hidden";
    return () => {
      globalForLock.__alScrollLocks = Math.max(
        0,
        (globalForLock.__alScrollLocks ?? 1) - 1,
      );
      if (globalForLock.__alScrollLocks === 0) {
        document.body.style.overflow = "";
      }
    };
  }, []);
}
