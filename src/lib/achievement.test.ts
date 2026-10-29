import { describe, expect, it } from "vitest";

import { weeklyAchievement } from "./achievement";
import type { Routine, RoutineRun } from "@/types/skincare";

/**
 * 이 파일이 지키는 것은 "계산이 맞는가"보다 **과거에 실제로 났던 사고가 다시 나지 않는가**다.
 * 각 테스트 이름 뒤의 괄호가 그 사고 번호다.
 */

/** 단계 n개짜리 루틴 하나. 분모(예정 단계 수) 계산의 입력이다. 기본은 기본 세트다. */
function routine(id: string, stepCount: number, condition = ""): Routine {
  return {
    id,
    name: `${id} 루틴`,
    condition,
    time: "am",
    summary: "",
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `${id}-s${i}`,
      routineName: `단계 ${i}`,
      estimatedTime: 60,
      usingProduct: [],
      howToUse: [],
      tips: [],
      warning: [],
    })),
  };
}

function run(routineId: string, finishedAt: Date, steps: number): RoutineRun {
  return {
    id: `run-${finishedAt.getTime()}-${routineId}`,
    routineId,
    startedAt: finishedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    completedStepIds: Array.from(
      { length: steps },
      (_, i) => `${routineId}-s${i}`,
    ),
  };
}

// 2026-08-19 는 수요일 — 주(월요일 시작)의 3일째다.
const WEDNESDAY = new Date(2026, 7, 19, 21, 0, 0);
const MONDAY = new Date(2026, 7, 17, 8, 0, 0);
const TUESDAY = new Date(2026, 7, 18, 8, 0, 0);

describe("weeklyAchievement", () => {
  it("분모는 주 전체가 아니라 경과 일수로 센다 (m7: 주 초 허위 하락)", () => {
    // 수요일이므로 월·화·수 3일치만 예정으로 잡혀야 한다. 7일치로 잡으면
    // 아직 오지 않은 목~일을 미완료로 세어 주 초마다 달성률이 거짓으로 낮아진다.
    const result = weeklyAchievement(
      [run("r1", MONDAY, 4)],
      [routine("r1", 4)],
      WEDNESDAY,
    );
    expect(result.planned).toBe(12); // 4단계 × 3일
    expect(result.percent).toBe(33); // 4/12
  });

  it("지난주 기록이 없으면 delta 를 0 이 아니라 null 로 둔다", () => {
    // 0 으로 채우면 "변화 없음"이라는 거짓말이 된다 — 화면이 '기록 없음'과 구분해야 한다.
    const result = weeklyAchievement(
      [run("r1", MONDAY, 4)],
      [routine("r1", 4)],
      WEDNESDAY,
    );
    expect(result.delta).toBeNull();
  });

  it("지난주 기록이 있으면 %p 차이를 낸다", () => {
    const lastWeek = new Date(2026, 7, 12, 9, 0, 0); // 지난주 수요일
    const lastThursday = new Date(2026, 7, 13, 9, 0, 0);
    // 1회분은 단계 수(4)를 넘지 않으므로 지난주 7단계는 이틀에 나눠 둔다.
    const result = weeklyAchievement(
      [
        run("r1", MONDAY, 3),
        run("r1", lastWeek, 4),
        run("r1", lastThursday, 3),
      ],
      [routine("r1", 4)],
      WEDNESDAY,
    );
    // 이번주 3/12 = 25%, 지난주는 분모가 7일 전체라 7/28 = 25%
    expect(result.percent).toBe(25);
    expect(result.delta).toBe(0);
  });

  it("삭제된 루틴의 고아 기록은 분자에서 뺀다 (N3: 안 한 루틴이 100% 로 보이던 문제)", () => {
    // '기타' 루틴만 수행하고 그 루틴을 지우면, 남은 '기본' 루틴 기준으로
    // 100% 가 되던 사고. 분모가 현재 루틴 기준이므로 분자도 현재 루틴만 센다.
    const result = weeklyAchievement(
      [run("삭제된-루틴", MONDAY, 4)],
      [routine("남은-루틴", 4)],
      WEDNESDAY,
    );
    expect(result.done).toBe(0);
    expect(result.hasRuns).toBe(false);
  });

  it("기타 세트 수행이 분자에 더해져도 100% 를 넘지 않는다 (Q1)", () => {
    // 기본 4단계를 월~수 매일 + 기타 4단계도 매일 → 분자 24 / 분모 12(기본만).
    const days = [MONDAY, TUESDAY, WEDNESDAY];
    const result = weeklyAchievement(
      days.flatMap((day) => [run("r1", day, 4), run("f1", day, 4)]),
      [routine("r1", 4), routine("f1", 4, "고민 집중")],
      WEDNESDAY,
    );
    expect(result.planned).toBe(12);
    expect(result.percent).toBe(100);
  });

  it("기타 세트가 있어도 기본 루틴을 매일 다 하면 100% 다 (M8: 약 50% 에서 멈추던 문제)", () => {
    // 프로브 실측 재현: 기본 아침·저녁 + 기타 아침·저녁, 기본만 매일 수행.
    // 예전에는 기타 세트까지 매일 예정으로 쳐서 18/36 = 50% 였다.
    const days = [MONDAY, TUESDAY, WEDNESDAY];
    const result = weeklyAchievement(
      days.flatMap((day) => [run("am", day, 3), run("pm", day, 3)]),
      [
        routine("am", 3),
        routine("pm", 3),
        routine("f-am", 3, "고민 집중"),
        routine("f-pm", 3, "고민 집중"),
      ],
      WEDNESDAY,
    );
    expect(result.planned).toBe(18); // 기본 6단계 × 3일
    expect(result.percent).toBe(100);
  });

  it("같은 루틴을 하루 두 번 해도 1회분만 센다 (M8: 안 한 날을 메우던 문제)", () => {
    // 월요일에 두 번, 화·수는 안 함 → 4/12 = 33%. 예전에는 8/12 = 67% 였다.
    const result = weeklyAchievement(
      [run("r1", MONDAY, 4), run("r1", new Date(2026, 7, 17, 21, 0, 0), 4)],
      [routine("r1", 4)],
      WEDNESDAY,
    );
    expect(result.done).toBe(4);
    expect(result.percent).toBe(33);
  });

  it("1회분은 루틴의 현재 단계 수를 넘지 않는다", () => {
    const result = weeklyAchievement(
      [run("r1", MONDAY, 40)],
      [routine("r1", 4)],
      WEDNESDAY,
    );
    expect(result.done).toBe(4);
  });

  it("지난주 델타도 같은 규칙(기본 세트 분모·하루 1회분)으로 센다", () => {
    const lastMonday = new Date(2026, 7, 10, 8, 0, 0);
    const result = weeklyAchievement(
      [
        run("r1", MONDAY, 4),
        // 지난주 월요일에 기본 두 번 + 기타 한 번 → 기본 4 + 기타 4 = 8 / 28
        run("r1", lastMonday, 4),
        run("r1", new Date(2026, 7, 10, 21, 0, 0), 4),
        run("f1", lastMonday, 4),
      ],
      [routine("r1", 4), routine("f1", 4, "고민 집중")],
      WEDNESDAY,
    );
    expect(result.percent).toBe(33); // 4/12
    expect(result.delta).toBe(33 - 29); // 지난주 8/28 = 29%
  });

  it("기본 세트가 없으면 있는 세트로 분모를 센다 (분모 0 → '루틴 없음' 거짓 안내 방지)", () => {
    const result = weeklyAchievement(
      [run("f1", MONDAY, 4)],
      [routine("f1", 4, "고민 집중")],
      WEDNESDAY,
    );
    expect(result.planned).toBe(12);
    expect(result.percent).toBe(33);
  });

  it("루틴이 하나도 없으면 percent 는 0 이 아니라 null 이다", () => {
    // 분모 0 은 "0% 달성"이 아니라 "계산 불가"다. 근거 없는 숫자를 띄우지 않는다.
    const result = weeklyAchievement([], [], WEDNESDAY);
    expect(result.percent).toBeNull();
    expect(result.delta).toBeNull();
  });

  it("finishedAt 이 깨진 기록은 세지 않는다", () => {
    const broken: RoutineRun = {
      ...run("r1", MONDAY, 4),
      finishedAt: "언젠가",
    };
    const result = weeklyAchievement([broken], [routine("r1", 4)], WEDNESDAY);
    expect(result.done).toBe(0);
  });
});
