/**
 * 성분명 정규화 — 지식 테이블과 제품 성분을 잇는 다리.
 *
 * 시드·수확된 지식에는 "비타민씨(아스코빅애씨드)", "클레이(카올린·벤토나이트)" 같은
 * **복합 표기**가 들어 있고, 제품의 `ingredients` 에는 "아스코빅애씨드"·"Glycolic Acid"·
 * "레티놀(0.1%)" 같은 라벨 표기가 들어 있다. 문자열이 달라도 같은 성분이면 이어 줘야 지식이 쓰인다.
 *
 * ⛔ **부분 문자열 포함으로 잇지 않는다**(3라운드 M6). "펩타이드" ⊂ "카퍼트라이펩타이드-1",
 *    "글리세린" ⊂ "에틸헥실글리세린", "우레아" ⊂ "이미다졸리디닐우레아" 처럼 **다른 성분의 안전 정보**가
 *    붙었다. 표기 흔들림은 아래 `SYNONYMS` 에 명시해서 잇는다 — 틀린 지식이 빈 지식보다 나쁘다.
 */

/**
 * 같은 성분의 표기 묶음. **첫 항목이 대표명**이다 — 지식 수확(`/api/ai/report`)이 이 이름으로 저장한다.
 * 시드(`db/seeds/001_ingredient_knowledge.sql` + 007 마이그레이션)의 성분명을 대표명으로 두고
 * 영문 INCI 와 라벨에서 실제로 흔들리는 표기를 붙였다. 비교는 대소문자·공백을 무시한다.
 *
 * - 알부틴/알파-알부틴은 엄밀히 이성질체지만 미백·병용 지식이 같아 묶었다(예전 포함 매칭도 둘을 이었다).
 * - 세라마이드엔피 등은 시드의 "세라마이드"(장벽 지질 일반 진술)가 그대로 맞아 묶었다.
 * - "펩타이드"는 일부러 개별 펩타이드와 묶지 않았다 — 카퍼트라이펩타이드-1 전용 충돌이 새던 경로다.
 * ponytail: 수작업 표다. 지식이 수천 행이 되면 정규화 컬럼(canonical name)으로 올린다.
 */
const SYNONYMS: readonly (readonly string[])[] = [
  ["아스코빅애씨드", "Ascorbic Acid", "L-Ascorbic Acid"],
  ["토코페롤", "Tocopherol"],
  ["페룰릭애씨드", "Ferulic Acid"],
  ["나이아신아마이드", "Niacinamide"],
  [
    "히알루론산(소듐하이알루로네이트)",
    "히알루론산",
    "하이알루로닉애씨드",
    "소듐하이알루로네이트",
    "Hyaluronic Acid",
    "Sodium Hyaluronate",
  ],
  ["레티놀", "Retinol"],
  [
    "세라마이드",
    "세라마이드엔피",
    "세라마이드에이피",
    "세라마이드이오피",
    "세라마이드엔지",
    "Ceramide NP",
    "Ceramide AP",
    "Ceramide EOP",
    "Ceramide NG",
  ],
  ["살리실릭애씨드", "Salicylic Acid"],
  // "글리콜릭애씨드" 표기도 카탈로그에 있다(실측 2개 제품) — 없으면 같은 성분이 두 키로 갈라졌다.
  ["글라이콜릭애씨드", "Glycolic Acid", "글리콜릭애씨드"],
  ["콜레스테롤", "Cholesterol"],
  ["스쿠알란", "Squalane"],
  ["마데카소사이드", "Madecassoside"],
  ["판테놀", "디판테놀", "Panthenol", "D-Panthenol", "Dexpanthenol"],
  ["센텔라아시아티카추출물", "병풀추출물", "Centella Asiatica Extract"],
  ["트라넥사믹애씨드", "Tranexamic Acid"],
  ["아젤라익애씨드", "Azelaic Acid"],
  ["알파-알부틴", "알파알부틴", "알부틴", "Alpha-Arbutin", "Arbutin"],
  ["우레아", "Urea"],
  ["글리세린", "Glycerin"],
  ["징크피씨에이", "Zinc PCA"],
  ["알란토인", "Allantoin"],
  ["락틱애씨드", "Lactic Acid"],
  ["벤조일퍼옥사이드", "Benzoyl Peroxide"],
  [
    "티트리오일(티트리잎오일)",
    "티트리오일",
    "티트리잎오일",
    "Tea Tree Oil",
    "Melaleuca Alternifolia (Tea Tree) Leaf Oil",
  ],
  ["유황", "Sulfur"],
  ["카퍼트라이펩타이드-1", "Copper Tripeptide-1"],
  ["카올린", "Kaolin"],
  ["벤토나이트", "Bentonite"],
  ["징크옥사이드", "Zinc Oxide"],
  ["티타늄디옥사이드", "Titanium Dioxide"],
  ["바쿠치올", "Bakuchiol"],
  ["글루코노락톤", "Gluconolactone"],
  ["변성알코올", "Alcohol Denat."],
  ["소듐라우릴설페이트", "Sodium Lauryl Sulfate"],
  ["코코넛오일", "코코스너시페라(코코넛)오일", "Cocos Nucifera (Coconut) Oil"],
  ["아이소프로필미리스테이트", "Isopropyl Myristate"],
  ["코코아버터", "Theobroma Cacao (Cocoa) Seed Butter"],
  ["페트롤라툼", "Petrolatum"],
  ["시어버터", "Butyrospermum Parkii (Shea) Butter", "Shea Butter"],
  ["향료", "Fragrance", "Parfum"],
  ["리모넨", "Limonene"],
  ["멘톨", "Menthol"],
  ["메틸아이소치아졸리논", "Methylisothiazolinone"],
];

/**
 * 비교 키 — 영문 대소문자·공백 차이("Glycolic  acid")는 같은 표기로 본다.
 * 성분 역할 캐시(`ingredient_roles.name_key`)도 이 키로 저장한다 — 재구현 금지.
 */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

const GROUP_BY_KEY = new Map<string, readonly string[]>(
  SYNONYMS.flatMap((group) =>
    group.map((name): [string, readonly string[]] => [nameKey(name), group]),
  ),
);

/**
 * 끝에 붙은 함량·기능성 표기 — "레티놀(0.1%)", "나이아신아마이드(미백기능성)", "살리실릭애씨드 0.5%".
 * 성분의 다른 이름이 아니라 **그 제품의 배합 정보**라 별칭으로 쓰면 무관한 성분끼리 이어진다
 * ("레티놀(0.1%)" ≡ "살리실릭애씨드(0.1%)" — 별칭 "0.1%" 공유, 3라운드 M6).
 */
const AMOUNT_SUFFIX =
  /\s*(?:[(（][^)）]*(?:%|ppm|기능성)[^)）]*[)）]|\d+(?:\.\d+)?\s*(?:%|ppm))$/i;

function stripAmount(name: string): string {
  return name.trim().replace(AMOUNT_SUFFIX, "").trim();
}

/**
 * 별칭 확장: "비타민씨(아스코빅애씨드)" → ["비타민씨(아스코빅애씨드)", "비타민씨", "아스코빅애씨드", "Ascorbic Acid", …]
 * 괄호 안이 `·`, `,`, `/` 로 나뉘어 있으면 각각을 별칭으로 본다
 * ("클레이(카올린·벤토나이트)" → 클레이, 카올린, 벤토나이트).
 * 함량·기능성 괄호는 별칭이 아니라 떼어낸다. 그다음 `SYNONYMS` 의 같은 묶음을 붙인다.
 */
export function ingredientAliases(name: string): string[] {
  const out = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed) return [];
  out.add(trimmed);

  const bare = stripAmount(trimmed);
  if (bare) out.add(bare);

  const match = bare.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
  if (match) {
    out.add(match[1].trim());
    for (const part of match[2].split(/[·,/]/)) {
      const alias = part.trim();
      if (alias) out.add(alias);
    }
  }

  for (const alias of [...out]) {
    for (const synonym of GROUP_BY_KEY.get(nameKey(alias)) ?? []) {
      out.add(synonym);
    }
  }
  return [...out];
}

/** 두 표기가 같은 성분을 가리키는가 — 별칭끼리 **정확 일치**(대소문자·공백 무시)만 본다. */
export function sameIngredient(a: string, b: string): boolean {
  const keysA = new Set(ingredientAliases(a).map(nameKey));
  return ingredientAliases(b).some((alias) => keysA.has(nameKey(alias)));
}

/**
 * 저장용 대표명. `SYNONYMS` 에 있으면 그 묶음의 첫 항목, 없으면 함량 표기만 뗀 원문.
 * 같은 지식이 라벨 표기별로 쪼개 쌓이지 않게 수확 전에 거친다(3라운드 M7).
 */
export function canonicalIngredient(name: string): string {
  for (const alias of ingredientAliases(name)) {
    const group = GROUP_BY_KEY.get(nameKey(alias));
    if (group) return group[0];
  }
  return stripAmount(name);
}
