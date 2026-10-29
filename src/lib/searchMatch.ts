/**
 * 제품 후보 검색(`/api/ai/search`)의 순수 판정 로직 — 병합 키와 검색어 일치 판정.
 */

/** 공백 제거 + 소문자. "1025 독도 토너" 와 "1025독도토너" 를 같게 본다. */
function squash(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/**
 * 같은 제품 판정 키(m20).
 * 카탈로그는 "라운드랩 1025 독도 토너", 화해는 "1025 독도 토너"(브랜드 라운드랩)처럼
 * 브랜드 접두 유무가 달라 같은 제품이 두 번 나왔다 — 후보 자신의 brand 로 접두를 뗀다.
 */
export function candidateKey(candidate: {
  product_name: string;
  brand: string | null;
}): string {
  const name = squash(candidate.product_name);
  const brand = candidate.brand ? squash(candidate.brand) : "";
  // 이름이 브랜드뿐이면 떼지 않는다 — 빈 키로 서로 다른 제품이 합쳐진다.
  if (!brand || name === brand || !name.startsWith(brand)) return name;
  return name.slice(brand.length);
}

/** 2글자 조각. 한 글자 단어는 그 글자 자체. */
function bigrams(word: string): string[] {
  const chars = [...word];
  if (chars.length < 2) return chars;
  return chars.slice(1).map((char, i) => chars[i] + char);
}

/**
 * 후보가 검색어와 관련 있다고 볼 최소 비율.
 * 실측(2026-10-29 화해): 정상 검색은 0.33~1("수분크림"→"수딩 크림" 1/3, "닥터지 선크림"→"선 플러스" 2/4),
 * 무의미한 검색어는 0("!!@@##")~0.07("zzqx유령 absent-7731 세럼"→세럼들 1/15).
 */
const MIN_COVERAGE = 1 / 3;

/**
 * 후보 텍스트(브랜드 + 이름)가 검색어와 최소한 겹치는가(m29).
 *
 * 화해는 무의미한 검색어에도 퍼지 매칭으로 무관한 제품 5개를 준다. 단어 단위 포함은
 * 띄어쓰기 없는 검색("다이브인세럼", "라운드랩독도토너")을 놓쳐서, 검색어 단어들의
 * 2글자 조각 중 후보에 들어 있는 비율로 본다. 문자·숫자가 하나도 없으면 무관이다.
 *
 * ponytail: 글자 겹침만 본다 — 영문 검색어가 화해의 한글 음차로만 맞는 경우("snail"→"스네일")는
 * 버려진다. 그런 검색이 실제로 잦으면 음차·동의어 사전을 붙인다. 영문 브랜드는 화해 원문
 * 브랜드("코스알엑스 (COSRX)")를 넘기면 맞는다.
 */
export function matchesQuery(query: string, text: string): boolean {
  const pieces = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap(bigrams);
  if (pieces.length === 0) return false;

  const haystack = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const hits = pieces.filter((piece) => haystack.includes(piece)).length;
  return hits / pieces.length >= MIN_COVERAGE;
}
