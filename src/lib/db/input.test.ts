import { describe, expect, it } from "vitest";

import {
  intInRange,
  isoDate,
  optionalText,
  readJsonObject,
  text,
  textArray,
} from "./input";

/**
 * 여기는 **신뢰 경계**다. 이 함수들이 통과시킨 값이 그대로 DB 로 간다.
 * 상한을 넘겨 MariaDB 가 에러를 내면 503("잠시 후 다시 시도")으로 나가서
 * 사용자 입력이 원인인데 서버 장애처럼 보인다 — 그래서 400 으로 먼저 막는다.
 */

describe("text", () => {
  it("앞뒤 공백을 제거한다", () => {
    expect(text("  세럼  ", 10)).toBe("세럼");
  });

  it("공백뿐이면 거부한다", () => {
    expect(text("   ", 10)).toBeNull();
  });

  it("상한을 넘으면 자르지 않고 거부한다", () => {
    // 조용히 자르면 사용자는 자기가 쓴 것과 다른 게 저장된 걸 모른다.
    expect(text("a".repeat(11), 10)).toBeNull();
    expect(text("a".repeat(10), 10)).toBe("a".repeat(10));
  });

  it("문자열이 아니면 거부한다", () => {
    expect(text(123, 10)).toBeNull();
    expect(text(null, 10)).toBeNull();
  });
});

describe("optionalText", () => {
  it("없는 값과 거부된 값을 구분한다", () => {
    // undefined = "안 보냈음"(정상), null = "보냈는데 규격 위반"(400).
    expect(optionalText(undefined, 10)).toBeUndefined();
    expect(optionalText("", 10)).toBeUndefined();
    expect(optionalText("a".repeat(11), 10)).toBeNull();
  });
});

describe("textArray", () => {
  it("빈 배열은 정상 응답이다", () => {
    // 프롬프트 규칙이 "확신 없으면 []" 를 요구한다 — 실패로 처리하면 설계를 위배한다.
    expect(textArray([], { maxItems: 5, maxLength: 10 })).toEqual([]);
  });

  it("개수 상한을 넘으면 배열 전체를 거부한다", () => {
    expect(
      textArray(["a", "b", "c"], { maxItems: 2, maxLength: 10 }),
    ).toBeNull();
  });

  it("원소 하나가 길면 배열 전체를 거부한다", () => {
    expect(
      textArray(["ok", "a".repeat(11)], { maxItems: 5, maxLength: 10 }),
    ).toBeNull();
  });

  it("문자열이 아닌 원소는 건너뛴다", () => {
    expect(textArray(["a", 1, null], { maxItems: 5, maxLength: 10 })).toEqual([
      "a",
    ]);
  });
});

describe("intInRange", () => {
  it("소수점은 버리고 정수로 받는다", () => {
    expect(intInRange(3.9, 0, 10)).toBe(3);
  });

  it("범위를 벗어나면 거부한다", () => {
    expect(intInRange(11, 0, 10)).toBeNull();
    expect(intInRange(-1, 0, 10)).toBeNull();
  });

  it("숫자로 보이는 문자열과 NaN·Infinity 를 거부한다", () => {
    expect(intInRange("5", 0, 10)).toBeNull();
    expect(intInRange(Number.NaN, 0, 10)).toBeNull();
    expect(intInRange(Number.POSITIVE_INFINITY, 0, 10)).toBeNull();
  });
});

describe("isoDate", () => {
  it("정상 ISO 문자열을 통과시킨다", () => {
    expect(isoDate("2026-08-19T12:00:00.000Z")).toBeInstanceOf(Date);
  });

  it("터무니없는 연도를 막는다", () => {
    // 이 값이 통과하면 주간 달성률 계산이 조용히 망가진다.
    expect(isoDate("1999-01-01T00:00:00.000Z")).toBeNull();
  });

  it("먼 미래는 막되 기기 시계가 조금 빠른 정도는 받아 준다", () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const farFuture = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect(isoDate(soon)).toBeInstanceOf(Date);
    expect(isoDate(farFuture)).toBeNull();
  });

  it("날짜가 아닌 문자열을 막는다", () => {
    expect(isoDate("언젠가")).toBeNull();
    expect(isoDate(20260819)).toBeNull();
  });
});

describe("textArray 공백 항목", () => {
  it("공백뿐인 항목은 버리고 나머지는 trim 한다", () => {
    // `[" "]` 가 "성분을 가져왔다"로 통과해 공유 카탈로그를 덮던 경로(3라운드 M2).
    expect(
      textArray([" ", " 정제수 "], { maxItems: 5, maxLength: 10 }),
    ).toEqual(["정제수"]);
  });
});

describe("readJsonObject", () => {
  const req = (body: string) =>
    new Request("http://local/api", { method: "POST", body });

  it("JSON 객체만 받는다", async () => {
    expect(await readJsonObject(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it("null·배열·원시값·깨진 JSON 은 null — 500 대신 400 으로 가게 한다", async () => {
    // 3라운드 m1: `null` 본문이 `as Body` 를 통과해 라우트 12곳이 500 을 냈다.
    for (const body of ["null", "[1]", "3", '"x"', "{"]) {
      expect(await readJsonObject(req(body))).toBeNull();
    }
  });
});
