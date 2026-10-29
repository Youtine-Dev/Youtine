import { describe, expect, it } from "vitest";

import { candidateKey, matchesQuery } from "./searchMatch";

/** 아래 후보 텍스트는 전부 2026-10-29 화해 검색 실측 결과다(원문 브랜드 + 제품명). */

describe("candidateKey", () => {
  it("카탈로그의 브랜드 접두 이름과 화해 이름이 같은 키다 (m20 실측)", () => {
    expect(
      candidateKey({
        product_name: "라운드랩 1025 독도 토너",
        brand: "라운드랩",
      }),
    ).toBe(candidateKey({ product_name: "1025 독도 토너", brand: "라운드랩" }));
  });

  it("브랜드가 없으면 이름 그대로다", () => {
    expect(candidateKey({ product_name: "1025 독도 토너", brand: null })).toBe(
      "1025독도토너",
    );
  });

  it("이름이 브랜드뿐이면 빈 키로 만들지 않는다", () => {
    expect(candidateKey({ product_name: "선크림", brand: "선크림" })).toBe(
      "선크림",
    );
  });
});

describe("matchesQuery", () => {
  it.each([
    ["!!@@##", "시드물 (SIDMOOL) 데일리 마일드 클렌징 패드"],
    ["!!@@##", "안나홀츠 (ANNAHOLTZ) 바이오 셀 에센스 세럼"],
    ["zzqx유령 absent-7731 세럼", "셀리맥스 (celimax) BFT 진정 세럼"],
    [
      "zzqx유령 absent-7731 세럼",
      "바니스뉴욕뷰티 (BARNEYSNEWYORKBEAUTY) 글로셀라 리페어 세럼쿠션 [SPF50+/PA+++] [23호]",
    ],
  ])("무의미한 검색어 %s 의 퍼지 매칭 후보는 버린다 (m29 실측)", (q, text) => {
    expect(matchesQuery(q, text)).toBe(false);
  });

  it.each([
    ["독도 토너", "라운드랩 (ROUNDLAB) 1025 독도 토너"],
    ["독도 토너", "라운드랩 (ROUNDLAB) 1025 독도 패드"],
    ["이니스프리 레티놀 시카", "이니스프리 (INNISFREE) 레티놀 시카 흔적 패드"],
    ["다이브인세럼", "토리든 (Torriden) 다이브인 저분자 히알루론산 세럼"],
    ["라운드랩독도토너", "라운드랩 (ROUNDLAB) 1025 독도 토너"],
    ["cosrx", "코스알엑스 (COSRX) 더 레티놀 0.1 크림"],
    ["roundlab 독도", "라운드랩 (ROUNDLAB) 1025 독도 클렌저"],
    ["수분크림", "웰라쥬 (WELLAGE) 리얼 히알루로닉 수딩 크림"],
    ["닥터지 선크림", "닥터지 (Dr.G) 그린 마일드 업 선 플러스 [SPF50+/PA++++]"],
    ["세럼", "아비브 (Abib) 히알루로닉 붐 세럼 워터 드롭"],
  ])("정상 검색어 %s 의 후보는 남긴다", (q, text) => {
    expect(matchesQuery(q, text)).toBe(true);
  });
});
