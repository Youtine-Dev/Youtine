import { describe, expect, it } from "vitest";

import type { RunStart } from "@/lib/storage/history";
import type { Routine, RoutineRun, RoutineTime } from "@/types/skincare";

import { pickSuggestion } from "./NextStepCard";

/** 괄호 안은 이 케이스가 고정하는 발견 번호다(docs/plans/2026-10-28-stabilize-r3). */

function routine(id: string, time: RoutineTime, condition = "평소"): Routine {
  return {
    id,
    name: `${id} 루틴`,
    condition,
    time,
    summary: "",
    steps: [1, 2, 3].map((n) => ({
      id: `${id}-s${n}`,
      routineName: `단계 ${n}`,
      estimatedTime: 60,
      usingProduct: [],
      howToUse: [],
      tips: [],
      warning: [],
    })),
  };
}

function run(routineId: string, finishedAt: Date): RoutineRun {
  const iso = finishedAt.toISOString();
  return {
    id: `r-${routineId}`,
    routineId,
    startedAt: iso,
    finishedAt: iso,
    completedStepIds: [],
  };
}

const AM = routine("am", "am");
const PM = routine("pm", "pm");
const FOCUS_AM = routine("focus", "am", "고민 집중");
/** 로컬 오전 9시 — 시간대 선호는 아침이다. */
const MORNING = new Date(2026, 9, 29, 9, 0, 0);
const HOUR = 60 * 60 * 1000;

function startAt(routineId: string, at: Date, step?: number): RunStart {
  return { routineId, startedAt: at.toISOString(), step };
}

describe("pickSuggestion", () => {
  it("오늘 이미 한 루틴은 건너뛰고 다음 후보를 준다 (m24①)", () => {
    const result = pickSuggestion(
      [AM, PM],
      [run("am", MORNING)],
      null,
      MORNING,
    );
    expect(result).toEqual({ kind: "suggested", routine: PM });
  });

  it("오늘 다 했으면 완료 상태다 (m24①)", () => {
    const runs = [run("am", MORNING), run("pm", MORNING)];
    expect(pickSuggestion([AM, PM], runs, null, MORNING)).toEqual({
      kind: "all-done",
    });
  });

  it("기본 루틴을 다 했으면 기타 루틴을 다음 할 일로 밀지 않는다 (Q1)", () => {
    const runs = [run("am", MORNING), run("pm", MORNING)];
    expect(pickSuggestion([FOCUS_AM, AM, PM], runs, null, MORNING).kind).toBe(
      "all-done",
    );
  });

  it("기타 루틴만 있으면 그것을 제안한다", () => {
    expect(pickSuggestion([FOCUS_AM], [], null, MORNING)).toEqual({
      kind: "suggested",
      routine: FOCUS_AM,
    });
  });

  it("진행 중이면 저장된 단계로 이어서 한다 (m14)", () => {
    const start = startAt("pm", new Date(MORNING.getTime() - HOUR), 2);
    expect(pickSuggestion([AM, PM], [], start, MORNING)).toEqual({
      kind: "in-progress",
      routine: PM,
      step: 2,
    });
  });

  it("6시간 지난 시작 표시는 진행 중이 아니다 (m14)", () => {
    const start = startAt("pm", new Date(MORNING.getTime() - 6 * HOUR), 2);
    expect(pickSuggestion([AM, PM], [], start, MORNING).kind).toBe("suggested");
  });

  it("시작 뒤에 완료 기록이 있으면(카드 '완료') 진행 중이 아니다 (m14)", () => {
    const start = startAt("am", new Date(MORNING.getTime() - HOUR), 2);
    const runs = [run("am", new Date(MORNING.getTime() - HOUR / 2))];
    expect(pickSuggestion([AM, PM], runs, start, MORNING)).toEqual({
      kind: "suggested",
      routine: PM,
    });
  });

  it("범위를 벗어난 단계(편집으로 줄어듦)는 처음부터다", () => {
    const start = startAt("am", new Date(MORNING.getTime() - HOUR), 9);
    const result = pickSuggestion([AM], [], start, MORNING);
    expect(result).toEqual({ kind: "in-progress", routine: AM, step: 1 });
  });
});
