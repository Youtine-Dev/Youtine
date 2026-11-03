"use client";

import { useEffect, type RefObject } from "react";

/** Tab 으로 닿는 요소 — `tabindex="-1"`(roving tabindex 등)은 빼야 트랩의 처음·끝 계산이 맞다. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(", ");

/**
 * 모달 포커스 규율 — 열릴 때 안으로 옮기고, Tab 을 안에 가두고, 닫히면 트리거로 돌려준다.
 *
 * `aria-modal="true"` 인데 Tab 이 배경으로 빠지거나(설정·삭제 확인·성분 상세), 아예 포커스가
 * 모달로 안 옮겨져 키보드로 닫기 버튼에 닿지 못하는 모달(인기·검색)이 있었다(3라운드 m31).
 *
 * 중첩: 컨테이너 **안쪽**에 다른 `role="dialog"` 가 떠 있으면 이 모달은 Tab 을 건드리지 않는다
 * — 최상단 모달만 가둔다(Esc 가드 m9 와 같은 판별).
 *
 * @param initialFocusRef 처음 포커스를 줄 요소. 없으면 컨테이너의 첫 포커스 가능 요소.
 */
export function useModalFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const trigger = document.activeElement;
    // 트리거가 닫힐 때 사라질 수 있다('선반에서 빼기' — 4라운드 m4). 그때 돌아갈 자리로
    // 트리거가 속한 섹션의 제목을 지금(트리거가 있을 때) 기억해 둔다. 트리거가 바깥 모달 안이면
    // 그 모달 안에서 찾는다 — 섹션을 찾아 모달 밖으로 나가면 바깥 모달의 가둠을 깬다.
    const fallback = trigger
      ?.closest('section, [role="dialog"]')
      ?.querySelector<HTMLElement>("h1, h2, h3");
    const container = containerRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE);
    (initialFocusRef?.current ?? first)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const root = containerRef.current;
      if (!root || root.querySelector('[role="dialog"]')) return;

      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      const head = items[0];
      const tail = items[items.length - 1];
      const outside = !(active instanceof Node) || !root.contains(active);
      if (event.shiftKey && (active === head || outside)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (active === tail || outside)) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
        return;
      }
      // 섹션째 사라졌으면(탭 전환) body 로 둔다. 포커스가 이미 다른 곳(중첩 모달의 바깥 트리거
      // 등)에 갔으면 빼앗지 않는다.
      const lost =
        document.activeElement === null ||
        document.activeElement === document.body;
      if (!fallback?.isConnected || !lost) return;
      // 제목은 원래 포커스를 못 받는다 — Tab 순서엔 넣지 않고(-1) 여기서만 받게 한다.
      if (!fallback.hasAttribute("tabindex")) fallback.tabIndex = -1;
      fallback.focus();
    };
    // ref 객체는 렌더마다 같다 — 마운트 1회만 돈다.
  }, [containerRef, initialFocusRef]);
}
