import { describe, expect, it } from "vitest";

import { nameTokens, splitIngredients, titleMatches } from "./brandSites";

/**
 * 전성분 문자열을 쪼개는 단 하나의 지점이다. 여기서 성분 하나가 잘못 갈라지면
 * 그 이름으로는 지식 테이블을 못 찾아 **충돌 경고가 조용히 사라진다** —
 * 화면에는 "안전합니다"만 남는다. 아래는 전부 실측에서 나왔던 입력이다.
 */

describe("splitIngredients", () => {
  it("괄호 안의 쉼표로는 자르지 않는다", () => {
    expect(
      splitIngredients("정제수, 나이아신아마이드(2%, 미백기능성), 글리세린"),
    ).toEqual(["정제수", "나이아신아마이드(2%, 미백기능성)", "글리세린"]);
  });

  it("숫자 사이 쉼표는 성분명의 일부다 (실측: 리더스에서 1 과 2-헥산다이올 로 쪼개짐)", () => {
    expect(
      splitIngredients("정제수, 1,2-헥산다이올, 1,3-부틸렌글라이콜"),
    ).toEqual(["정제수", "1,2-헥산다이올", "1,3-부틸렌글라이콜"]);
  });

  it("대괄호 안의 쉼표도 보호한다", () => {
    expect(
      splitIngredients("정제수, 향료[리모넨, 리날룰], 부틸렌글라이콜"),
    ).toEqual(["정제수", "부틸렌글라이콜"]);
    // ⚠️ 위 결과에 `향료[...]` 가 없는 것은 의도다 — 대괄호가 든 항목은 공정 머리표·
    //    안내 문구일 때가 많아 통째로 버린다. 쉼표로 쪼개져 파편이 남는 것보다 낫다.
  });

  it("괄호가 닫히지 않아도 뒤엣것을 통째로 삼키지 않는다", () => {
    // depth 가 음수로 내려가지 않게 잡아 둔 덕분에 복구된다.
    const result = splitIngredients("정제수, 글리세린), 판테놀");
    expect(result).toContain("판테놀");
  });

  it("안내 문구가 섞여 들어오면 성분으로 세지 않는다", () => {
    const result = splitIngredients(
      "정제수, 글리세린, 사용법: 적당량을 덜어 바릅니다, 판테놀",
    );
    expect(result).toEqual(["정제수", "글리세린", "판테놀"]);
  });

  it("빈 항목과 연속 쉼표를 흘리지 않는다", () => {
    expect(splitIngredients("정제수, , 글리세린,")).toEqual([
      "정제수",
      "글리세린",
    ]);
  });

  it("줄바꿈과 중복 공백을 한 칸으로 정리한다", () => {
    expect(splitIngredients("정제수,\n  소듐\t하이알루로네이트")).toEqual([
      "정제수",
      "소듐 하이알루로네이트",
    ]);
  });

  it("목록 뒤에 줄바꿈으로 붙은 홍보 문구가 마지막 성분을 데려가지 않는다 (m14)", () => {
    // 실측 형태: `…향료\r\n순한 사용감의 크림.`
    // 줄바꿈을 공백으로만 합치면 `향료 순한 사용감의 크림.` 한 항목이 되어
    // 마침표 오염 필터에 **향료까지 함께** 걸린다. 전성분 말미의 향료·보존제는
    // 대표적 민감 유발 성분이라 조용히 사라지면 경고가 발화하지 않는다.
    expect(
      splitIngredients(
        "정제수, 글리세린, 부틸렌글라이콜, 판테놀, 알란토인, 향료\r\n순한 사용감의 크림.",
      ),
    ).toEqual([
      "정제수",
      "글리세린",
      "부틸렌글라이콜",
      "판테놀",
      "알란토인",
      "향료",
    ]);
  });

  it("소수점 함량이 붙은 활성 성분을 버리지 않는다 (M3)", () => {
    // 마침표 필터가 `0.1` 의 소수점까지 걸러 레티놀이 빠지면 레티놀×AHA 충돌이 검사되지 않는다.
    expect(
      splitIngredients(
        "정제수, 레티놀(0.1%), 살리실릭애씨드 0.5%, 아데노신(0.04%), 나이아신아마이드(2%)",
      ),
    ).toEqual([
      "정제수",
      "레티놀(0.1%)",
      "살리실릭애씨드 0.5%",
      "아데노신(0.04%)",
      "나이아신아마이드(2%)",
    ]);
  });

  it("소수점이 든 홍보 문구라도 문장 마침표가 있으면 계속 거른다", () => {
    expect(
      splitIngredients("정제수, 글리세린, 보습력 2.5배 개선된 크림."),
    ).toEqual(["정제수", "글리세린"]);
  });
});

/** 웰라쥬 어댑터의 브랜드 표기 — 실제 `ADAPTERS` 값과 같다. */
const WELLAGE = ["웰라쥬", "wellage"];

const page = (head: string) => `<html><head>${head}</head><body></body></html>`;

describe("nameTokens", () => {
  it("용량·한 글자 토큰을 빼고 순서를 유지한다", () => {
    expect(nameTokens("리얼 히알루로닉 블루 100 앰플 50ml")).toEqual([
      "리얼",
      "히알루로닉",
      "블루",
      "앰플",
    ]);
  });

  it("브랜드 표기 토큰을 뺀다 — 그 몰의 모든 제목에 있어 제품을 가리지 못한다", () => {
    expect(nameTokens("웰라쥬 리얼 히알루로닉 앰플", WELLAGE)).toEqual([
      "리얼",
      "히알루로닉",
      "앰플",
    ]);
  });
});

describe("titleMatches", () => {
  it("og:title 이 사이트명뿐이면 <title> 로 대조한다 (M5 — 웰라쥬 실측 형태)", () => {
    const html = page(
      '<meta property="og:title" content="웰라쥬">' +
        "<title>리얼 히알루로닉 스킨케어 세트(토너+앰플+수딩크림 구성) - 웰라쥬</title>",
    );
    expect(titleMatches(html, "리얼 히알루로닉 스킨케어 세트", WELLAGE)).toBe(
      true,
    );
  });

  it("og:title·<title> 이 모두 사이트명이면 JSON-LD Product name 으로 대조한다", () => {
    const html = page(
      '<meta property="og:title" content="웰라쥬"><title>웰라쥬</title>' +
        '<script type="application/ld+json">' +
        JSON.stringify({
          "@type": "Product",
          name: "리얼 히알루로닉 블루 100 앰플",
          brand: { "@type": "Brand", name: "웰라쥬" },
        }) +
        "</script>",
    );
    expect(titleMatches(html, "리얼 히알루로닉 앰플", WELLAGE)).toBe(true);
  });

  it("다른 제품 페이지는 출처를 바꿔 봐도 통과하지 않는다", () => {
    const html = page(
      '<meta property="og:title" content="콜라겐 탄력 크림">' +
        "<title>콜라겐 탄력 크림 - 웰라쥬</title>",
    );
    expect(titleMatches(html, "히알루로닉 앰플", WELLAGE)).toBe(false);
  });

  it("브랜드명은 표를 주지 않는다 — 수딩 젤 페이지가 '웰라쥬 수딩 크림' 으로 통과하면 안 된다", () => {
    // 브랜드 토큰을 세면 웰라쥬+수딩 2/3 로 통과해 젤의 성분이 크림에 붙는다.
    const html = page("<title>리얼 히알루로닉 수딩 젤 - 웰라쥬</title>");
    expect(titleMatches(html, "웰라쥬 수딩 크림", WELLAGE)).toBe(false);
  });

  it("2토큰 이름은 둘 다 맞아야 한다 — 절반(흔한 단어 하나)으로는 통과하지 않는다 (I15)", () => {
    const html = page("<title>히알루로닉 크림</title>");
    expect(titleMatches(html, "수분 크림")).toBe(false);
    expect(titleMatches(html, "히알루로닉 크림")).toBe(true);
  });

  it("과반이면 표기 차이를 허용하고, 정확히 절반이면 거절한다", () => {
    const html = page("<title>리얼 히알루로닉 블루 100 앰플</title>");
    // 3토큰 중 2 — 과반
    expect(titleMatches(html, "히알루로닉 수분 앰플")).toBe(true);
    // 4토큰 중 2 — 절반
    expect(titleMatches(html, "히알루로닉 수분 앰플 대용량")).toBe(false);
  });

  it("브랜드만 적은 이름은 제품을 특정하지 못해 거절한다", () => {
    const html = page("<title>웰라쥬</title>");
    expect(titleMatches(html, "웰라쥬", WELLAGE)).toBe(false);
  });
});
