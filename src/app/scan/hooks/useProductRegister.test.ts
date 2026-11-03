import { describe, expect, it } from "vitest";

import type { Product } from "@/types/skincare";

import { findOnShelf } from "./useProductRegister";

const item = (productName: string, productCompany?: string): Product => ({
  id: `${productName}/${productCompany ?? ""}`,
  productName,
  productCompany,
  category: "토너",
  ingredients: [],
  createdAt: "2026-11-02T00:00:00.000Z",
});

// 서버 UPSERT 키 (이름, 브랜드) 와 같은 판정이어야 "이미 선반에 있어요"가 맞는다(4라운드 m15).
describe("findOnShelf", () => {
  const shelf = [item("어성초 77 수딩 토너", "아누아"), item("시카 크림")];

  it("이름·브랜드가 같으면 찾는다 — 앞뒤 공백·대소문자는 서버처럼 무시", () => {
    expect(
      findOnShelf(shelf, {
        productName: " 어성초 77 수딩 토너 ",
        productCompany: "아누아",
      }),
    ).toBe(shelf[0]);
    expect(
      findOnShelf([item("Low pH Cleanser", "COSRX")], {
        productName: "low ph cleanser",
        productCompany: "cosrx",
      }),
    ).toBeDefined();
  });

  it("브랜드 미상은 빈 문자열과 같다", () => {
    expect(
      findOnShelf(shelf, { productName: "시카 크림", productCompany: "" }),
    ).toBe(shelf[1]);
    expect(findOnShelf(shelf, { productName: "시카 크림" })).toBe(shelf[1]);
  });

  it("브랜드가 다르면 다른 제품이다", () => {
    expect(
      findOnShelf(shelf, { productName: "어성초 77 수딩 토너" }),
    ).toBeUndefined();
    expect(
      findOnShelf(shelf, {
        productName: "시카 크림",
        productCompany: "아누아",
      }),
    ).toBeUndefined();
  });
});
