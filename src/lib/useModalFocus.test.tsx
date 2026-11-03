import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { useModalFocus } from "./useModalFocus";

function Modal({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button type="button" onClick={onDone}>
        완료
      </button>
    </div>
  );
}

/** 선반 섹션 — 모달의 '완료'가 트리거 항목을 목록에서 빼는지(선반에서 빼기) 고를 수 있다. */
function Shelf({ removeOnDone }: { removeOnDone: boolean }) {
  const [items, setItems] = useState(["제품"]);
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h2>내 선반</h2>
      {items.map((item) => (
        <button key={item} type="button" onClick={() => setOpen(true)}>
          {item}
        </button>
      ))}
      {open && (
        <Modal
          onDone={() => {
            if (removeOnDone) setItems([]);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function openAndFinish() {
  const trigger = screen.getByRole("button", { name: "제품" });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "완료" }));
  return trigger;
}

describe("useModalFocus — 닫힐 때 포커스 복귀", () => {
  it("트리거가 남아 있으면 트리거로 돌아간다", () => {
    render(<Shelf removeOnDone={false} />);
    const trigger = openAndFinish();
    expect(document.activeElement).toBe(trigger);
  });

  it("트리거가 사라졌으면 그 섹션 제목으로 간다(4라운드 m4)", () => {
    render(<Shelf removeOnDone />);
    openAndFinish();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "내 선반" }),
    );
  });
});
