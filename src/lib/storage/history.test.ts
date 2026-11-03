// @vitest-environment jsdom
// markRunStep 이 localStorage 를 쓴다 — 저장소가 window 없이는 아무것도 저장하지 않는다.
import { beforeEach, describe, expect, it } from "vitest";

import { load } from "./local";
import {
  consumeRunStart,
  liveRunStart,
  markRunStep,
  RUN_START_KEY,
  type RunStart,
} from "./history";

const now = Date.parse("2026-11-02T09:00:00Z");
const start: RunStart = {
  routineId: "r1",
  startedAt: "2026-11-02T08:50:00Z",
  skippedStepIds: ["s1", "s2"],
};

describe("liveRunStart", () => {
  it("만료 전 표시는 진행 중이다", () => {
    expect(liveRunStart(start, now)).toBe(start);
  });

  it("TTL(6시간)이 지나면 진행 중이 아니다", () => {
    expect(liveRunStart(start, now + 6 * 60 * 60 * 1000)).toBeNull();
  });

  // 전부 건너뛴 수행(Q2) — 남아 있어도 이어서 하기·단계 기록에 다시 잡히면 안 된다.
  it("소비된 표시는 만료 전이어도 진행 중이 아니다", () => {
    expect(liveRunStart({ ...start, consumed: true }, now)).toBeNull();
  });
});

describe("markRunStep — 소비 표시", () => {
  const stored = () => load<RunStart | null>(RUN_START_KEY, null);

  beforeEach(() => {
    localStorage.clear();
    consumeRunStart({ ...start, startedAt: new Date().toISOString() });
  });

  // 남기면 중간 단계로 들어와 마친 수행이 옛 '건너뜀' 완료 화면에 가려 기록할 길이 없다(4라운드 2차 리뷰).
  it("중간 단계로 다시 들어오면 지운다", () => {
    markRunStep("r1", 2);
    expect(stored()).toBeNull();
  });

  it("첫 단계로 다시 들어오면 새 시작 표시로 덮는다", () => {
    markRunStep("r1", 1);
    expect(stored()).toMatchObject({ routineId: "r1", step: 1 });
    expect(stored()?.consumed).toBeUndefined();
  });
});
