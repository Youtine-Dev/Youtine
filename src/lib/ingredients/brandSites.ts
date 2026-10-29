/**
 * 브랜드 공식몰에서 **전성분**을 읽어 온다 — 서버 전용.
 *
 * 왜 이 경로가 필요한가(2026-08-20 실측):
 * 성분 출처가 "카탈로그(DB) → AI 모델 기억" 둘뿐이라, 카탈로그에 없고 모델도 모르는 제품은
 * 성분이 **빈 배열**로 저장된다. 실제로 등록된 제품의 절반이 그랬다. 성분이 없으면 이 앱의
 * 핵심(성분 충돌·시너지 리포트, 루틴 안전 검증)이 통째로 무의미해진다.
 *
 * 왜 하필 브랜드 공식몰인가 — 다른 후보를 전부 실측하고 남은 유일한 경로다:
 *  - 화해 상세(`/goods/{id}`): **403 WAF**. 의도적으로 보호되는 자산이라 우회하지 않는다.
 *  - 네이버 쇼핑·쿠팡: robots 가 `Disallow: /` (네이버는 "AI 크롤링 금지" 명시). 배제.
 *  - 올리브영: robots 는 ClaudeBot 을 허용하지만 WAF 가 서버 fetch 를 403 으로 막는다.
 *  - 무신사: robots 허용·SSR 200 이지만 **전성분이 HTML 에 없다**(CSR 별도 API).
 *  - Open Beauty Facts: 무료 API 지만 한국 제품 커버리지가 사실상 0.
 *  → 공식몰은 **제조사가 화장품법상 표시 의무**로 게시하는 정보이고, robots 도 상품 상세를
 *    막지 않는다. 근거로서도 가장 권위 있다(2차 유통 표기보다 정확).
 *
 * ⚠️ 한계(알고 쓰는 것): **브랜드 하나 = 어댑터 하나**라 확장이 선형이다. 그래서 여기에
 *    전부를 넣지 않는다 — 카탈로그 상위 브랜드만 넣고, 나머지는 기존 AI 경로가 받는다.
 *    에스네이처처럼 **전성분을 이미지로만** 싣는 몰은 이 경로로 풀 수 없다(OCR 영역).
 */

/** 성분표는 사용자를 기다리게 하는 경로가 아니다 — 짧게 끊고 다음 단계로 넘긴다. */
const FETCH_TIMEOUT_MS = 5_000;

/** 봇이 아니라 일반 브라우저로 보이게 하는 최소한의 헤더. 위조·회피 목적의 지문 조작은 하지 않는다. */
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "accept-language": "ko-KR,ko;q=0.9",
};

/**
 * 전성분 문자열 → 배열.
 * 화장품 전성분은 쉼표로 나열되고 함량 순이라 **순서를 보존**한다.
 * 괄호 안 함량 표기(예: `소듐하이알루로네이트(1,000ppm)`)는 성분명의 일부라 지우지 않는다 —
 * 다만 괄호 안 쉼표로 잘리면 안 되므로 괄호 깊이를 세며 자른다.
 */
export function splitIngredients(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let buffer = "";

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);

    // 숫자 사이의 쉼표는 구분자가 아니라 **성분명의 일부**다: `1,2-헥산다이올`,
    // `1,3-부틸렌글라이콜`, `1,000ppm`. 실측(리더스)에서 `1` 과 `2-헥산다이올` 로 쪼개졌다.
    const isDecimalComma =
      /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "");

    /*
     * 줄바꿈도 구분자로 본다. 고시 표기·JSON-LD 설명은 목록이 끝난 뒤 **줄을 바꿔**
     * 홍보 문구를 붙인다(`…향료\n순한 사용감의 크림.`). 공백으로만 합치면 마지막 성분이
     * 그 문구와 한 항목이 되어 아래 오염 필터에 **함께** 걸린다 — 전성분 말미의
     * 향료·보존제(대표적 민감 유발 성분)가 조용히 사라지는데, 남은 목록은 여전히
     * `looksLikeIngredients` 를 통과해 **완전한 목록 행세**를 한다(m14).
     */
    const isLineBreak = char === "\n" || char === "\r";

    if (depth === 0 && (isLineBreak || (char === "," && !isDecimalComma))) {
      items.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  items.push(buffer);

  return (
    items
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter((item) => item.length > 0 && item.length <= 60)
      // `[유화]` 같은 공정 구분 머리표나 안내 문구가 섞이면 성분이 오염된다 — 성분명에는
      // 대괄호·콜론·문장 마침표가 오지 않는다(실측: 한 페이지에 여러 제품 표기가 이어져 있었다).
      // ⚠️ 숫자 사이 마침표는 **함량 소수점**이라 거르지 않는다: `레티놀(0.1%)` 처럼 함량을
      // 적는 건 바로 활성 성분이다. 빠지면 충돌 검사가 조용히 사라진다(M3).
      .filter(
        (item) => !/[[\]:·。]|(?<!\d)\.|\.(?!\d)|입니다|사용법|제조/.test(item),
      )
  );
}

/**
 * 전성분으로 보이는가 — **오탐이 성분 오염으로 이어지므로 보수적으로 본다.**
 * 화장품 전성분은 거의 예외 없이 정제수/워터로 시작하고 항목이 여럿이다.
 */
export function looksLikeIngredients(items: string[]): boolean {
  // 상한: 화장품 전성분은 많아야 80종대다. 그보다 많으면 **여러 제품이 이어붙은 것**이라
  // 통째로 버린다(실측: 183개가 나온 적이 있다 — 검색 결과 페이지를 긁은 경우).
  if (items.length < 5 || items.length > 90) return false;
  const head = items[0];
  // 영문 INCI 는 "Aqua/Water" 로 시작하는 표기가 흔하다(3라운드 — 웹 경로 관문의 미탐 방지).
  return /^(정제수|물|워터|water|aqua|아쿠아)/i.test(head);
}

/**
 * ⚠️ `response.text()` 를 쓰지 않는다. Cafe24 계열 몰은 Content-Type 헤더에 EUC-KR 을
 * 선언하면서 본문은 UTF-8 로 보내는 경우가 있어, 그대로 디코딩하면 한글이 통째로 깨진다
 * (실측 2026-08-20: `정제수` → `ì ì ì`). 바이트로 받아 **본문의 meta charset 을 보고**
 * 직접 디코딩한다.
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    // 앞부분만 아스키로 훑어 선언된 charset 을 찾는다(meta 는 head 안에 있다).
    const head = buffer.subarray(0, 4_096).toString("latin1");
    const declared = /charset=["']?\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();

    const utf8 = buffer.toString("utf8");
    // UTF-8 로 읽어 한글이 멀쩡하면 그게 정답이다(헤더 선언이 틀린 경우가 있다).
    if (/[가-힣]/.test(utf8)) return utf8;

    if (declared && declared !== "utf-8" && declared !== "utf8") {
      try {
        return new TextDecoder(declared).decode(buffer);
      } catch {
        // 지원하지 않는 인코딩 — utf8 결과를 그대로 쓴다.
      }
    }
    return utf8;
  } catch {
    // 타임아웃·네트워크 오류 — 다음 단계(AI)가 받는다. 여기서 던지지 않는다.
    return null;
  }
}

const JSON_LD_BLOCK =
  /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Cafe24 계열 몰(웰라쥬 등)은 JSON-LD `Product.description` 에 전성분을 통째로 넣는다.
 * HTML 파싱보다 안정적이라 이걸 먼저 본다.
 */
function fromJsonLd(html: string): string[] | null {
  for (const block of html.matchAll(JSON_LD_BLOCK)) {
    const raw = block[1];
    if (!raw.includes("정제수")) continue;
    for (const description of descriptionsOf(raw)) {
      if (!description.includes("정제수")) continue;
      const items = splitIngredients(description);
      if (looksLikeIngredients(items)) return items;
    }
  }
  return null;
}

/**
 * JSON-LD 블록에서 `description` 문자열을 전부 꺼낸다.
 *
 * ⚠️ **정규식으로 값만 뜯지 않는다.** 예전에 `"description"\s*:\s*"([^"]*정제수[^"]*)"` 로
 * 뜯었는데, JSON 이스케이프가 살아 있어 세 가지가 깨졌다(m14):
 *  - `\"` 를 만나면 `[^"]*` 가 거기서 멈춰 **목록이 중간에서 잘리는데**, 잘린 목록도
 *    `looksLikeIngredients` 를 통과해 완전한 목록 행세를 했다.
 *  - `\/`(PHP·Cafe24 기본 이스케이프)의 백슬래시가 성분명에 그대로 남아 화면에 노출됐다.
 *  - `\r\n` 이 실제 줄바꿈이 아니라 두 글자라 정규화에 안 걸렸다.
 * JSON 은 JSON 파서로 읽는다 — 이스케이프 규칙을 손으로 다시 구현하지 않는다.
 */
function descriptionsOf(raw: string): string[] {
  const found: string[] = [];
  try {
    collectDescriptions(JSON.parse(raw), found);
  } catch {
    /*
     * 유효하지 않은 JSON-LD 를 싣는 몰이 있다(후행 쉼표·이스케이프 안 된 줄바꿈).
     * 그때만 정규식으로 떨어지되, `(?:[^"\\]|\\.)*` 로 **이스케이프된 따옴표를 건너뛰어**
     * 잘림을 막고 값은 직접 되돌린다.
     */
    const match = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
    if (match) found.push(unescapeJson(match[1]));
  }
  return found;
}

/** `description` 은 최상위에 없을 수도 있다(`@graph`·배열 형태). 재귀로 훑는다. */
function collectDescriptions(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectDescriptions(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "description" && typeof value === "string") out.push(value);
    else collectDescriptions(value, out);
  }
}

/** 따옴표를 다시 씌워 JSON 파서에 맡긴다. 그래도 안 되면 흔한 이스케이프만 되돌린다. */
function unescapeJson(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\[rn]/g, " ").replace(/\\(.)/g, "$1");
  }
}

/**
 * 상품정보제공고시 블록. 화장품법이 문구를 정해 두어 라벨 텍스트가 안정적이다:
 * "화장품법에 따라 기재·표시하여야 하는 모든 성분".
 *
 * ⚠️ 라벨을 넓힌 이유(2026-08-21 실측): 고시 표를 직접 만든 몰은 법정 문구를 그대로 쓰지
 * 않는다 — 리더스는 `<strong>전성분</strong>` 한 단어, 몽디에스는 `｢화장품법｣에 따라` 처럼
 * 전각 괄호에 태그까지 끼어 있어 앞부분이 안 잡히고 꼬리 `모든 성분` 만 성립한다.
 * 라벨이 느슨해진 만큼 오탐 방어는 아래 `looksLikeIngredients` 에 그대로 맡긴다 —
 * **그쪽을 약화시키면 안 된다.**
 *
 * 첫 매치만 보지 않고 **모든 매치를 순회**한다. `전성분` 은 짧은 단어라 상단 배너·탭 이름에
 * 먼저 등장할 수 있는데, 그때 첫 매치만 보면 진짜 표를 놓친다.
 */
function fromNoticeBlock(html: string): string[] | null {
  // 값이 같은 목록은 한 건으로 본다 — PC/모바일 마크업이 같은 표를 두 번 싣는 몰이 있다.
  const found = new Map<string, string[]>();

  for (const label of html.matchAll(
    /화장품법에\s*따라\s*기재|모든\s*성분|전성분/g,
  )) {
    // 라벨 뒤 3KB 안에서 정제수로 시작하는 줄을 찾는다(고시 표는 라벨 바로 다음 칸이 값이다).
    const segment = html.slice(label.index, label.index + 3_000);
    for (const raw of segment.replace(/<[^>]+>/g, "\n").split("\n")) {
      if (!raw.includes("정제수")) continue;
      /*
       * 성분 구분자를 `,&nbsp;` 로 쓰는 몰이 있다(몽디에스). 엔티티를 그대로 두면
       * 성분명이 `&nbsp;글리세린` 이 되어 화면에 그대로 나간다 — 먼저 실제 문자로 되돌린다.
       */
      const line = raw.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
      /*
       * 값 앞에 제품명이 붙는 몰이 있다: `아토크림 : 정제수, 글리세린…`.
       * `splitIngredients` 는 콜론이 든 항목을 통째로 버리므로 **첫 성분이 사라지고**
       * 정제수로 시작하는지 보는 검사도 무너진다. 자르는 건 콜론 앞 짧은 머리표뿐이다.
       */
      const items = splitIngredients(line.replace(/^[^:：]{1,40}[:：]\s*/, ""));
      if (looksLikeIngredients(items)) found.set(items.join(","), items);
    }
  }

  /*
   * 서로 다른 목록이 둘 이상이면 **세트·기획 상품**이라 어느 쪽이 요청한 제품인지 알 수 없다.
   * 실측(리더스 `product_no=1453`): "밀크 스폰지 마스크 & 프로 하이드라 마스크" 세트 페이지에
   * 전성분 표가 두 벌 있었고, 앞의 것만 집어 **엉뚱한 제품의 성분 22개**를 사실처럼 돌려줬다.
   * 이 파일의 원칙대로 **틀린 성분보다 빈 성분이 낫다** — 고르지 말고 포기한다.
   */
  if (found.size !== 1) return null;
  return [...found.values()][0];
}

/*
 * ⛔ "페이지 어디서든 정제수로 시작하는 줄을 찾는" 느슨한 폴백은 **두지 않는다.**
 *    실측에서 그 방식이 여러 제품의 성분표를 이어붙여 183개를 만들었다. 성분은 화면에
 *    사실로 표시되고 충돌 분석의 입력이 되므로, **틀린 성분보다 빈 성분이 낫다.**
 *    근거가 분명한 두 위치(JSON-LD·고시 블록)에서만 읽는다.
 */
function parseIngredients(html: string): string[] | null {
  return fromJsonLd(html) ?? fromNoticeBlock(html);
}

/**
 * 브랜드별 어댑터 — 제품명으로 상세 URL 후보를 찾는다.
 * `search` 는 검색 결과 HTML 에서 상세 경로를 뽑는다. robots 가 검색을 막는 몰
 * (에스네이처의 `/search.html?*`)은 여기 넣지 않는다.
 */
type BrandAdapter = {
  /** 매칭할 브랜드 표기들(정규화 후 비교) */
  aliases: readonly string[];
  /** 제품명 → 상세 URL 후보(최대 3개) */
  findDetailUrls: (productName: string) => Promise<string[]>;
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/**
 * 용량·수량 표기. 제품을 특정하지 못하므로 매칭에서 뺀다 —
 * `100ml` 하나로 전혀 다른 제품이 후보가 됐다(M3 실측).
 */
const CAPACITY_TOKEN = /^\d+(\.\d+)?(ml|g|kg|l|mg|매|개|호|p|ea)?$/i;

/**
 * 제품명 → 매칭 토큰. **`normalize` 를 쓰지 않는다** — 공백을 먼저 지우면 한글 이름이
 * 통째로 토큰 1개가 되어 토큰 매칭 자체가 성립하지 않는다(M3 의 원인).
 *
 * `aliases`(브랜드 표기)와 같은 토큰은 뺀다 — 그 몰의 모든 페이지 제목에 브랜드가 붙어 있어
 * `웰라쥬 수딩 크림` 이 아무 웰라쥬 제품에나 한 표를 공짜로 얻는다.
 */
export function nameTokens(
  productName: string,
  aliases: readonly string[] = [],
): string[] {
  const brands = new Set(aliases.map(normalize));
  return productName
    .toLowerCase()
    .split(/[^가-힣a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 2 && !CAPACITY_TOKEN.test(token) && !brands.has(token),
    );
}

/** JSON-LD 의 `Product` 노드 이름. 브랜드·판매자·빵부스러기의 `name` 은 제품명이 아니라 뺀다. */
function collectProductNames(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectProductNames(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (
    [record["@type"]].flat().includes("Product") &&
    typeof record.name === "string"
  ) {
    out.push(record.name);
  }
  for (const value of Object.values(record)) collectProductNames(value, out);
}

/** 상세 페이지가 스스로 밝힌 제품명 후보 — `og:title` → `<title>` → JSON-LD `name` 순. */
function pageTitles(html: string): string[] {
  const titles: string[] = [];
  const og =
    /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1];
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
  if (og) titles.push(og);
  if (title) titles.push(title);
  for (const block of html.matchAll(JSON_LD_BLOCK)) {
    try {
      collectProductNames(JSON.parse(block[1]), titles);
    } catch {
      // 유효하지 않은 JSON-LD — 이름 후보에서만 빠진다.
    }
  }
  return titles;
}

/**
 * 받아 온 상세 페이지가 **요청한 그 제품인지** 확인한다.
 *
 * 성분은 화면에 사실로 표시되고 충돌 분석의 입력이 되며, 등록되면 공용 카탈로그를 통해
 * 다른 사용자에게도 나간다. 그래서 **틀린 성분은 빈 성분보다 나쁘다** — 확인이 안 되면 버린다.
 * 후보 선정이 느슨한 어댑터(사이트맵 기반)를 위한 마지막 관문이자, 검색 랭킹을 믿는
 * Cafe24 경로에도 같이 거는 방어다.
 *
 * 제목 출처를 차례로 본다. 제품 토큰이 **하나도 안 맞는** 출처는 사이트명 같은 무의미한
 * 제목이라 건너뛴다 — 웰라쥬 상세의 `og:title` 은 `웰라쥬` 뿐이라, 그것만 보던 시절엔
 * 모든 웰라쥬 제품이 공식몰 경로에서 탈락했다(M5).
 *
 * **과반(절반 초과)** 일치를 요구한다: 전부 일치는 사용자가 적은 이름과 공식 표기가 조금만
 * 달라도 깨지고, 절반이면 2토큰 이름이 `크림` 같은 흔한 단어 하나로 통과한다(I15).
 * 오탐(남의 성분)이 미탐(AI 경로로 넘어감)보다 나쁘다.
 */
export function titleMatches(
  html: string,
  productName: string,
  aliases: readonly string[] = [],
): boolean {
  const tokens = nameTokens(productName, aliases);
  if (tokens.length === 0) return false;

  for (const title of pageTitles(html)) {
    const haystack = normalize(title);
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    if (hits === 0) continue;
    return hits * 2 > tokens.length;
  }
  return false;
}

/**
 * 세트·기획 상품 슬러그. Cafe24 SEO 링크는 경로에 한글 상품명이 그대로 들어가서
 * **상세를 받기 전에** 걸러낼 수 있다(쿼리형 `detail.html?product_no=` 링크는 이름이 없어
 * 못 거른다 — 그쪽은 `fromNoticeBlock` 의 "성분표 2벌이면 포기" 가 받는다).
 */
const SET_PRODUCT = /세트|기획|키트|구성|증정|패키지|리필|더블기획/;

/**
 * Cafe24 공통 — `/product/search.html?keyword=` 결과에서 상세 경로를 긁는다.
 *
 * 상세 링크 표기가 몰마다 **두 가지**다(실측): 웰라쥬·라운드랩은 SEO 형태
 * `/product/{한글슬러그}/{번호}/...`, 리더스·몽디에스는 구형 쿼리 형태
 * `/product/detail.html?product_no={번호}...`. 한쪽만 받으면 후자 계열이 통째로 0건이 된다.
 */
function cafe24Adapter(
  origin: string,
  aliases: readonly string[],
): BrandAdapter {
  return {
    aliases,
    findDetailUrls: async (productName) => {
      const html = await fetchHtml(
        `${origin}/product/search.html?keyword=${encodeURIComponent(productName)}`,
      );
      if (!html) return [];
      /*
       * 검색 결과 영역부터 자른다. 자르지 않으면 페이지 **상단 추천·베스트 배너**의 상품
       * 링크가 먼저 잡힌다 — 실측(리더스 검색 HTML): 결과 영역은 68,011번째 바이트에서
       * 시작하는데 무관한 상품 링크가 61,950번째에 있어 후보 1순위를 차지했다.
       * 성분은 화면에 사실로 표시되므로 **엉뚱한 제품의 성분은 빈 성분보다 나쁘다.**
       * 마커가 없는 몰은 전체를 그대로 본다(폴백이 없으면 기존 몰이 통째로 죽는다).
       */
      const marker = html.indexOf("xans-search-result");
      const scope = marker < 0 ? html : html.slice(marker);
      const seen = new Set<string>();
      for (const m of scope.matchAll(
        /href="(\/product\/(?:[^"?#]+\/\d+\/[^"]*|detail\.html\?product_no=\d+[^"]*))"/g,
      )) {
        // 세트·기획 상품은 성분표가 여러 벌이라 어느 쪽이 요청한 제품인지 알 수 없다.
        // 후보 3개를 세트가 다 차지하면 단품이 밀려난다(실측: 웰라쥬 검색 상위 7건이 세트).
        if (SET_PRODUCT.test(m[1])) continue;
        // 쿼리형 링크는 HTML 엔티티로 나오는 몰이 있다 — 그대로 fetch 하면 파라미터가 깨진다.
        seen.add(origin + m[1].replace(/&amp;/g, "&"));
        if (seen.size >= 3) break;
      }
      return [...seen];
    },
  };
}

/*
 * ⛔ 조사했으나 **넣지 않은** 브랜드 — 재조사 방지용 기록(2026-08-21 실측).
 *    전부 robots 는 통과했다. 막힌 건 robots 가 아니라 **전성분이 HTML 에 없다**는 점이다.
 *    (아래 몰들의 성분표는 상세 이미지 안에 있다 → OCR 영역이지 이 파일의 문제가 아니다.)
 *
 *  - 라운드랩 `roundlab.co.kr` — Cafe24. 검색·상세 200 이지만 상세가 지연 로딩
 *    (`#prdDetailContentLazy`)이고 고시 표 자체가 없다. `1025 독도 수분 크림`(상품번호 227)
 *    상세 HTML 에 `정제수` 0회, JSON-LD `description` 은 빈 문자열.
 *  - 믹순 `mixsoon.co.kr` — Cafe24. 고시 표는 **있는데 성분 행을 안 채웠다**(제품명·용량·
 *    제조업자·사용기한만). `비피다 수분 크림`(304) 상세에 `정제수` 0회.
 *  - 아누아 `anua.kr` — Cafe24. 검색은 잘 되고 상세도 200 인데 `정제수`·`전성분` 0회.
 *    `어성초 77 토너`(496) 확인. 성분이 이미지로만 실려 있다.
 *  - 비플레인 `beplain.co.kr` — Cafe24 가 아니라 **MakeShop**. `/product/search.html` 은
 *    204(빈 응답), 그 밖의 경로는 403 을 준다. 붙이려면 MakeShop 전용 어댑터가 따로 필요하다.
 *  - 에스네이처 `snature.kr` — 기존 기록대로 robots 가 검색을 막고 성분도 이미지다.
 *  - 딥티크·풀리·식물나라 — 조사하지 않았다. 앞의 결과로 보아 **개별 확인 없이는 추가 금지**.
 *    (딥티크는 해외 몰이라 표기가 INCI 영문이고, 식물나라는 자사몰 없이 유통몰로만 판다.)
 */
const ADAPTERS: readonly BrandAdapter[] = [
  cafe24Adapter("https://www.wellage.co.kr", ["웰라쥬", "wellage"]),
  cafe24Adapter("https://leaderscosmetics.com", ["리더스", "leaders"]),
  cafe24Adapter("https://mongdies.com", ["몽디에스", "mongdies"]),
  {
    // 토니모리는 자체몰. 사이트맵(102KB)에 제품 351건이 있어 검색 없이 슬러그를 찾는다.
    // ⚠️ www 호스트는 인증서 이름 불일치라 apex 를 쓴다(실측).
    aliases: ["토니모리", "tonymoly"],
    findDetailUrls: async (productName) => {
      const xml = await fetchHtml("https://tonymoly.com/sitemap/sitemap.xml");
      if (!xml) return [];
      const tokens = nameTokens(productName);
      if (tokens.length === 0) return [];

      const urls: string[] = [];
      for (const m of xml.matchAll(/<loc>([^<]*\/products\/[^<]*)<\/loc>/g)) {
        const url = m[1];
        /*
         * 사이트맵은 **관련도 순서가 없다** — 검색엔진 랭킹이 있는 Cafe24 경로와 달리
         * 여기서 느슨하게 고르면 문서 순서상 앞의 것이 그대로 후보가 된다.
         *
         * ⚠️ 예전에는 URL 전체를 normalize 한 뒤 `some(...includes)` 로 봤는데 두 가지가 틀렸다(M3):
         *  - `normalize` 가 **토큰화 전에 공백을 지워** 한글 이름이 통째로 토큰 1개가 됐다.
         *    주석이 말하던 "토큰으로 느슨히 본다"가 실제로는 일어나지 않아 어댑터가 사실상 죽어 있었다.
         *  - 구두점으로 파편이 생기면(`… - 100ml`) 그 파편 하나가 **아무 제품에나** 걸렸다.
         *    실측: `100ml` 이 `master-lab-hyaluronic-acid-100ml` 에 매치.
         * 이제 슬러그만 보고 **모든 토큰이 들어 있을 때만** 후보로 삼는다. 한글 이름은
         * 영문 슬러그와 맞지 않아 후보가 안 나오는데, 그게 정직한 결과다(AI 경로가 받는다).
         */
        const slug = decodeURIComponent(url).split("/products/")[1] ?? "";
        if (!slug) continue;
        const haystack = slug.toLowerCase();
        if (tokens.every((token) => haystack.includes(token))) {
          urls.push(url);
          if (urls.length >= 3) break;
        }
      }
      return urls;
    },
  },
];

/**
 * 브랜드 공식몰에서 전성분을 찾는다. **못 찾으면 null** — 호출부는 조용히 다음 단계로 간다.
 * 어떤 예외도 밖으로 던지지 않는다(성분 보강은 부가 기능이라 등록 자체를 막으면 안 된다).
 */
export async function findIngredientsFromBrandSite(
  productName: string,
  productCompany: string | undefined,
): Promise<string[] | null> {
  const brand = productCompany?.trim();
  if (!brand || !productName.trim()) return null;

  const key = normalize(brand);
  const adapter = ADAPTERS.find((item) =>
    item.aliases.some((alias) => key.includes(normalize(alias))),
  );
  if (!adapter) return null;

  try {
    const urls = await adapter.findDetailUrls(productName);
    for (const url of urls) {
      const html = await fetchHtml(url);
      if (!html) continue;
      // 성분을 뽑기 **전에** 그 제품이 맞는지 본다 — 뽑고 나면 버리기 아까워진다(M3).
      if (!titleMatches(html, productName, adapter.aliases)) continue;
      const items = parseIngredients(html);
      if (items) return items;
    }
    // 어댑터가 죽어도 결과는 "AI 경로로 넘어감"뿐이라 아무도 모른다 — 웰라쥬(M5)·토니모리(m21)가
    // 그렇게 조용히 0건이었다. 후보 수로 "검색 0건"과 "후보는 있었는데 전부 탈락"을 가른다.
    console.warn(
      `[brandSites] ${adapter.aliases[0]} 공식몰에서 못 찾음(후보 ${urls.length}건) — AI 경로로 진행: ${productName}`,
    );
  } catch (error: unknown) {
    console.warn("[brandSites] 조회 실패 — AI 경로로 진행:", error);
  }
  return null;
}
