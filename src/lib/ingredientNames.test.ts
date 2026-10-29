import { describe, expect, it } from "vitest";

import {
  canonicalIngredient,
  ingredientAliases,
  sameIngredient,
} from "./ingredientNames";

/**
 * 지식 테이블("비타민씨(아스코빅애씨드)")과 제품 성분("아스코빅애씨드")을 잇는 다리다.
 * 여기서 못 이으면 상성 경고가 조용히 안 뜬다 — 화면에는 아무 오류도 안 보인다.
 * 반대로 **잘못 이으면 다른 성분의 안전 정보가 붙는다**(3라운드 M6) — 둘 다 핀으로 고정한다.
 */

describe("ingredientAliases", () => {
  it("괄호 안 표기를 별칭으로 펼친다", () => {
    expect(ingredientAliases("비타민씨(아스코빅애씨드)")).toEqual([
      "비타민씨(아스코빅애씨드)",
      "비타민씨",
      "아스코빅애씨드",
      // 명시 별칭 표(SYNONYMS)의 같은 묶음
      "Ascorbic Acid",
      "L-Ascorbic Acid",
    ]);
  });

  it("괄호 안이 여러 개면 각각 별칭이다", () => {
    expect(ingredientAliases("클레이(카올린·벤토나이트)")).toContain(
      "벤토나이트",
    );
  });

  it("빈 문자열은 별칭이 없다", () => {
    expect(ingredientAliases("   ")).toEqual([]);
  });

  it("함량·기능성 괄호는 별칭이 아니라 떼어낸다", () => {
    expect(ingredientAliases("레티놀(0.1%)")).not.toContain("0.1%");
    expect(ingredientAliases("레티놀(0.1%)")).toContain("레티놀");
    expect(ingredientAliases("나이아신아마이드(미백기능성)")).not.toContain(
      "미백기능성",
    );
    expect(ingredientAliases("살리실릭애씨드 0.5%")).toContain(
      "살리실릭애씨드",
    );
  });
});

describe("sameIngredient", () => {
  it("표기가 흔들려도 같은 성분으로 본다", () => {
    expect(sameIngredient("센텔라아시아티카(병풀추출물)", "병풀추출물")).toBe(
      true,
    );
    expect(sameIngredient("판테놀", "디판테놀")).toBe(true);
    expect(sameIngredient("알부틴", "알파-알부틴")).toBe(true);
    expect(sameIngredient("센텔라아시아티카추출물", "병풀추출물")).toBe(true);
    expect(
      sameIngredient("히알루론산(소듐하이알루로네이트)", "히알루론산"),
    ).toBe(true);
  });

  it("영문 INCI 표기도 한글 지식과 잇는다(대소문자·공백 무시)", () => {
    expect(sameIngredient("Glycolic Acid", "글라이콜릭애씨드")).toBe(true);
    expect(sameIngredient("glycolic  acid", "아하(글라이콜릭애씨드)")).toBe(
      true,
    );
    expect(sameIngredient("Sodium Hyaluronate", "히알루론산")).toBe(true);
  });

  it("함량 표기를 떼고 같은 성분이면 같다", () => {
    expect(sameIngredient("레티놀(0.1%)", "레티놀")).toBe(true);
    expect(sameIngredient("살리실릭애씨드 0.5%", "살리실릭애씨드")).toBe(true);
  });

  it("다른 성분을 같다고 하지 않는다", () => {
    expect(sameIngredient("레티놀", "나이아신아마이드")).toBe(false);
  });

  it("한 글자 겹침만으로는 같다고 하지 않는다", () => {
    expect(sameIngredient("수", "정제수")).toBe(false);
  });

  it("부분 문자열 포함만으로는 같다고 하지 않는다(3라운드 M6)", () => {
    // 펩타이드 상세에 카퍼트라이펩타이드-1 전용 충돌이 붙었다(시드 데이터로 재현).
    expect(sameIngredient("펩타이드", "카퍼트라이펩타이드-1")).toBe(false);
    // 방부제가 각질 개선·보습 지식을 받았다(실제 성분 405종 대조).
    expect(sameIngredient("우레아", "이미다졸리디닐우레아")).toBe(false);
    expect(sameIngredient("에틸헥실글리세린", "글리세린")).toBe(false);
  });

  it("함량·기능성 괄호가 같다고 같은 성분이 아니다(3라운드 M6)", () => {
    expect(sameIngredient("레티놀(0.1%)", "살리실릭애씨드(0.1%)")).toBe(false);
    expect(
      sameIngredient("나이아신아마이드(미백기능성)", "알부틴(미백기능성)"),
    ).toBe(false);
  });
});

describe("canonicalIngredient", () => {
  it("별칭 표의 대표명(시드 표기)으로 모은다", () => {
    expect(canonicalIngredient("Glycolic Acid")).toBe("글라이콜릭애씨드");
    expect(canonicalIngredient("디판테놀")).toBe("판테놀");
    expect(canonicalIngredient("소듐하이알루로네이트")).toBe(
      "히알루론산(소듐하이알루로네이트)",
    );
    expect(canonicalIngredient("레티놀(0.1%)")).toBe("레티놀");
  });

  it("표에 없으면 함량 표기만 뗀다", () => {
    expect(canonicalIngredient("아데노신(0.04%)")).toBe("아데노신");
    expect(canonicalIngredient("정제수")).toBe("정제수");
  });
});
