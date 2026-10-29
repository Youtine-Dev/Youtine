/**
 * POST /api/ai/search — 검색어로 제품 후보를 찾는다.
 *
 * `/api/ai/*` 중 **유일하게 웹 도구를 쓴다**(`WebSearch`·`WebFetch`).
 * 성분 추출과 달리 모델의 기억이 아니라 화해 검색 결과를 근거로 삼기 위해서다.
 *
 * ⚠️ 웹 도구를 여는 엔드포인트라 러너의 도구 제한이 실제로 걸리는지가 중요하다.
 * `--allowedTools` 만으로는 제한되지 않는다는 것을 실측으로 확인하고 `--tools` 로 고쳤다
 * (커밋 `674d254`). 되돌리지 말 것.
 */

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { readJsonObject } from "@/lib/db/input";
import { selectRows } from "@/lib/db/pool";
import { isAllowedImageUrl } from "@/lib/images";
import {
  buildProductSearchPrompt,
  MAX_CANDIDATES,
} from "@/lib/prompts/productSearch";
import { candidateKey, matchesQuery } from "@/lib/searchMatch";

export const runtime = "nodejs";

/** 실측 18~37초. 검색 결과 페이지가 무거울 때를 감안해 여유를 둔다. */
const TIMEOUT_MS = 180_000;

/** 검색어 한 줄뿐이라 아주 작다. */
const MAX_BODY_BYTES = 64 * 1024;

/** 사람이 입력할 수 있는 검색어 길이. 넘으면 프롬프트만 커지고 결과는 나빠진다. */
const MAX_QUERY_LENGTH = 100;

type Candidate = {
  product_name: string;
  brand: string | null;
  volume: string | null;
  /** 화이트리스트 호스트로 확인된 것만 남는다. 아니면 null. */
  image_url: string | null;
};

/* ── 화해 직접 파싱 (사용자 승인 2026-08-20 Q4) ──────────────────────
 * 검색 결과 페이지는 SSR 이라 `__NEXT_DATA__` JSON 에 후보가 통째로 박혀 온다
 * (실측: 0.5~2초, 첫 5개 = MAX_CANDIDATES, 판촉 문구 없는 정식 명칭).
 * LLM 경로(18~37초)의 10~40배 빠르므로 **직파싱을 먼저** 시도하고,
 * 구조 실패(비 200·키 경로 부재·파싱 실패)일 때만 기존 AI 경로로 폴백한다.
 *
 * ⚠️ 폴백 진입은 반드시 warn 로그를 남긴다 — 화해가 App Router 로 이관하는 순간
 *    전 요청이 조용히 18~37초로 회귀하는데, 로그가 없으면 영영 모른다.
 * ⚠️ EC2(데이터센터 IP)에서의 WAF 차단 여부는 미확인(가정용 IP 실측만 있음) —
 *    차단돼도 폴백이 받치지만, 배포 후 서버 로그에서 직파싱 성공을 1회 확인할 것.
 */

const HWAHAE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** 중첩 키 경로를 unknown 안전하게 내려간다 — `as` 캐스팅 없이 좁히기 위한 헬퍼. */
function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * 화해 항목 1개 → 우리 Candidate. 이름이 없으면 버린다(AI 경로의 narrowCandidate 와 같은 규율).
 * 검색어와 겹치지 않는 항목도 버린다(m29) — 화해는 무의미한 검색어에도 퍼지 매칭으로 아무 제품이나 준다.
 */
function hwahaeItemToCandidate(
  value: unknown,
  query: string,
): Candidate | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;

  const productName =
    typeof item.productName === "string" ? item.productName.trim() : "";
  if (!productName) return null;

  // 브랜드는 "토리든 (Torriden)" 형태다 — 화면·병합 키는 한글 표기만 쓴다.
  const rawBrand = typeof item.brand === "string" ? item.brand.trim() : "";
  // 검색어 판정만은 영문 표기가 남은 원문으로 한다 — "cosrx" 가 "코스알엑스 (COSRX)" 에 맞도록.
  if (!matchesQuery(query, `${rawBrand} ${productName}`)) return null;
  const brand = rawBrand ? rawBrand.replace(/\s*\([^)]*\)\s*$/, "") : null;

  // "50ml / 1.69 fl. oz." → "50ml". 형식이 흔들려도 첫 세그먼트만 취한다.
  const rawCapacity =
    typeof item.product_capacity === "string" ? item.product_capacity : "";
  const volume = rawCapacity
    ? (rawCapacity.split("/")[0]?.trim() ?? null)
    : null;

  const rawImage =
    typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
  const imageUrl = rawImage && isAllowedImageUrl(rawImage) ? rawImage : null;

  return {
    product_name: productName,
    brand,
    volume: volume || null,
    image_url: imageUrl,
  };
}

/**
 * 직파싱 결과.
 *  - `ok`         : 파싱 성공. **빈 배열도 정상 결과다**(화해에 그 제품이 없음).
 *  - `unavailable`: 화해가 5xx/네트워크 오류. **일시적**이라 AI 폴백도 같은 주소·같은
 *                   IP 로 나가 똑같이 실패한다 → 폴백하지 않고 사용자에게 알린다.
 *  - `changed`    : 200 인데 우리가 아는 구조가 아님(화해 개편 의심) → AI 폴백이 의미 있다.
 */
type DirectResult =
  | { status: "ok"; candidates: Candidate[] }
  | { status: "unavailable" }
  | { status: "changed" };

/** 성공 결과 캐시 — 같은 검색어로 외부를 반복해서 치지 않는다(레이트 리밋 회피). */
const SEARCH_CACHE_MS = 10 * 60_000;
/**
 * 엔트리 개수 상한. 후보의 `image_url` 이 data URL 일 수 있어 엔트리 하나가 수 KB~수 MB 다 —
 * 검색어는 자유 문자열이라 상한이 없으면 프로세스 메모리가 단조 증가한다(m5).
 */
const SEARCH_CACHE_MAX = 500;
type CacheEntry = { at: number; candidates: Candidate[] };
const globalForSearch = globalThis as typeof globalThis & {
  __alSearchCache?: Map<string, CacheEntry>;
};

async function fetchHwahae(query: string): Promise<Response> {
  return fetch(
    `https://www.hwahae.co.kr/search?q=${encodeURIComponent(query)}`,
    {
      headers: { "user-agent": HWAHAE_UA },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
}

/**
 * **우리 카탈로그에서 먼저 찾는다** — 외부(화해)에 의존하지 않는 경로.
 *
 * 왜 필요한가(2026-08-20 실측): 화해 오리진이 죽자 후보 검색이 통째로 막혔다. 그런데
 * 이미 누군가 등록한 제품은 우리 DB 에 성분·이미지까지 다 있다 — **외부가 죽어도 고를 수
 * 있는 후보**다. 게다가 카탈로그 히트는 성분 추출도 0초라(카탈로그 우선 조회) 화해보다
 * 결과가 낫다. 그래서 화해가 살아 있어도 이쪽을 먼저 보고, 부족한 만큼만 화해로 채운다.
 *
 * 정렬은 **담긴 수(shelf_count) 내림차순** — 많이 담긴 제품이 대개 사용자가 찾던 것이다.
 */
async function searchCatalog(query: string): Promise<Candidate[]> {
  const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await selectRows(
    `SELECT p.name, p.brand, p.image,
            (SELECT COUNT(*) FROM shelf_items s WHERE s.product_id = p.id) AS shelf_count
       FROM products p
      WHERE p.name LIKE ? ESCAPE '\\\\' OR p.brand LIKE ? ESCAPE '\\\\'
      ORDER BY shelf_count DESC, p.created_at DESC
      LIMIT ?`,
    [like, like, MAX_CANDIDATES],
  );

  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const item: Record<string, unknown> = { ...row };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return [];
    return [
      {
        product_name: name,
        brand: typeof item.brand === "string" && item.brand ? item.brand : null,
        // 용량은 저장하지 않는다(컬럼 없음) — 화면은 없으면 그냥 뺀다.
        volume: null,
        // 카탈로그 이미지는 서버가 이미 검증해 임베딩한 data URL 이다.
        image_url: typeof item.image === "string" ? item.image : null,
      },
    ];
  });
}

/** 같은 제품이 카탈로그·화해 양쪽에서 나오면 한 번만 보여 준다. */
function mergeCandidates(
  primary: Candidate[],
  extra: Candidate[],
): Candidate[] {
  const seen = new Set(primary.map(candidateKey));
  const merged = [...primary];
  for (const candidate of extra) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
    if (merged.length >= MAX_CANDIDATES) break;
  }
  return merged;
}

/**
 * 직파싱 본체.
 *
 * ⚠️ 화해는 **요청이 몰리면 5xx 를 돌려준다**(2026-08-20 실측: 같은 검색어가 한 번은
 * 200, 연달아 치면 500). 일시적이므로 짧게 **1회만 재시도**하고, 그래도 안 되면
 * `unavailable` 로 끝낸다 — 여기서 AI 폴백을 태우면 같은 주소를 한 번 더 치는 셈이라
 * 레이트 리밋을 악화시키고 결과도 같다(프롬프트 규칙 3 → 빈 배열).
 */
async function searchHwahaeDirect(query: string): Promise<DirectResult> {
  let response = await fetchHwahae(query);

  if (response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    response = await fetchHwahae(query);
  }

  if (!response.ok) {
    console.warn(
      `[api/ai/search] 화해 응답 HTTP ${response.status} — 일시 실패로 처리(폴백 안 함)`,
    );
    return { status: "unavailable" };
  }

  const html = await response.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s,
  );
  if (!match) {
    console.warn(
      "[api/ai/search] __NEXT_DATA__ 없음 — AI 폴백(화해 구조 변경?)",
    );
    return { status: "changed" };
  }

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    console.warn("[api/ai/search] __NEXT_DATA__ 파싱 실패 — AI 폴백");
    return { status: "changed" };
  }

  // 키 경로 실측(2026-08-20): props.pageProps.products.products[]
  const list = dig(data, "props", "pageProps", "products", "products");
  if (!Array.isArray(list)) {
    console.warn("[api/ai/search] products 키 경로 부재 — AI 폴백");
    return { status: "changed" };
  }

  return {
    status: "ok",
    candidates: list
      .map((item) => hwahaeItemToCandidate(item, query))
      .filter((item): item is Candidate => item !== null)
      .slice(0, MAX_CANDIDATES),
  };
}

/**
 * LLM 은 스키마를 보장하지 않는다. 프론트로 내보내기 전에 서버에서 좁힌다.
 * 이름이 없는 항목은 화면에 그릴 수 없으므로 **버린다**(전체를 실패로 만들지 않는다).
 */
function narrowCandidate(value: unknown): Candidate | null {
  if (typeof value !== "object" || value === null) return null;
  const item: Record<string, unknown> = { ...value };

  const productName =
    typeof item.product_name === "string" ? item.product_name.trim() : "";
  if (!productName) return null;

  const text = (raw: unknown): string | null => {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    // 모델이 "null"·"미상" 같은 문자열을 넣기도 한다. 값이 없다는 뜻이면 null 로 통일한다.
    if (!trimmed || trimmed === "null" || trimmed === "미상") return null;
    return trimmed;
  };

  /*
   * ⛔ **이미지 주소는 LLM 이 만든 값이다.** 그대로 내보내면 브라우저가 임의 주소를 요청하고,
   *    나중에 서버가 그걸 받아 저장하는 경로에서는 SSRF 가 된다.
   *    허용 호스트인지 여기서 한 번 거르고, 저장 시 `fetchImageAsDataUrl` 이 다시 확인한다.
   */
  const rawImage = text(item.image_url);
  const imageUrl = rawImage && isAllowedImageUrl(rawImage) ? rawImage : null;

  return {
    product_name: productName,
    brand: text(item.brand),
    volume: text(item.volume),
    image_url: imageUrl,
  };
}

/**
 * 캐시에 넣기 전 정리(m5).
 *
 * 예전에는 `set` 만 하고 `delete`·상한이 없어 **엔트리가 영구 잔류**했다. TTL 은 읽을 때
 * 신선도만 봤을 뿐이라 만료된 것도 그대로 남았고, 후보의 `image_url` 에 data URL 이 들어가
 * 엔트리 하나가 수 KB~수 MB 다. 재시작 없는 단일 서버라 서로 다른 검색어(최대 100자 자유
 * 문자열)가 들어올수록 프로세스 메모리가 단조 증가했다.
 *
 * ponytail: 만료 정리 + 개수 상한이면 충분하다. 진짜 LRU 가 필요해지면 그때 올린다.
 */
function pruneSearchCache(cache: Map<string, CacheEntry>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.at >= SEARCH_CACHE_MS) cache.delete(key);
  }
  // 전부 신선해도 상한은 지킨다. Map 은 삽입 순서를 지키므로 앞에서부터 = 가장 오래된 것부터.
  while (cache.size >= SEARCH_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export async function POST(request: Request) {
  /*
   * ⚠️ 동시 실행 가드(acquireOrBusy)는 **AI 폴백 직전**에만 건다(m4).
   *    캐시·카탈로그·화해 직파싱은 claude 프로세스를 띄우지 않고 0.5~2초에 끝나는데,
   *    예전에는 이것들까지 가드 뒤에 있어서 루틴 생성(90초)이 도는 동안
   *    제품 검색·등록 흐름 전체가 429 로 막혔다.
   *    concern·ingredients·report 라우트가 이미 "AI 를 안 태우는 경로는 가드보다 먼저"를
   *    원칙으로 삼는다 — 이 라우트만 빠져 있었다.
   */
  {
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return Response.json(
        { message: "요청 본문이 너무 큽니다." },
        { status: 413 },
      );
    }

    const body = await readJsonObject(request);
    if (!body) {
      return Response.json(
        { message: "JSON 객체 본문이 아닙니다." },
        { status: 400 },
      );
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return Response.json(
        { message: "검색어를 입력해 주세요." },
        { status: 400 },
      );
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return Response.json(
        { message: `검색어는 ${MAX_QUERY_LENGTH}자 이하여야 합니다.` },
        { status: 400 },
      );
    }

    // 0차: 캐시. 같은 검색어를 외부로 반복해 치지 않는다(화해 레이트 리밋 회피).
    globalForSearch.__alSearchCache ??= new Map();
    const cache = globalForSearch.__alSearchCache;
    const hit = cache.get(query);
    if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) {
      return Response.json({ candidates: hit.candidates });
    }

    /*
     * 1차: **우리 카탈로그**. 외부가 죽어도 항상 되는 경로이고, 히트하면 성분 추출까지
     * 0초다. 실패해도 아래 화해 경로가 있으므로 조용히 빈 배열로 넘긴다.
     */
    let local: Candidate[] = [];
    try {
      local = await searchCatalog(query);
    } catch (error: unknown) {
      console.warn("[api/ai/search] 카탈로그 검색 실패:", error);
    }

    // 2차: 화해 직파싱(0.5~2초). 빈 배열도 정상 결과다.
    let unavailable = false;
    try {
      const direct = await searchHwahaeDirect(query);
      if (direct.status === "ok") {
        const merged = mergeCandidates(local, direct.candidates);
        pruneSearchCache(cache);
        cache.set(query, { at: Date.now(), candidates: merged });
        return Response.json({ candidates: merged });
      }
      unavailable = direct.status === "unavailable";
    } catch (error: unknown) {
      // 타임아웃·네트워크 오류도 일시 실패다 — AI 로 같은 주소를 또 치지 않는다.
      console.warn("[api/ai/search] 직파싱 예외 — 일시 실패로 처리:", error);
      unavailable = true;
    }

    /*
     * 화해가 일시적으로 응답하지 않는 상태.
     *
     * ⭐ 카탈로그에 후보가 있으면 **그것만으로 서비스를 계속한다.** 외부 장애가 곧
     *   기능 정지가 되면 안 된다 — 이미 등록된 제품을 고르는 것은 오히려 더 빠르고 정확하다.
     *   화면에는 평소와 똑같이 후보 목록이 뜬다(사용자는 장애를 몰라도 된다).
     */
    if (unavailable && local.length > 0) {
      console.info(
        `[api/ai/search] 화해 일시 실패 — 카탈로그 후보 ${local.length}건으로 대체`,
      );
      // 외부가 죽은 동안의 결과라 캐시하지 않는다(복구되면 더 나은 결과를 줘야 한다).
      return Response.json({ candidates: local });
    }

    /*
     * 외부도 죽고 카탈로그에도 없다. AI 폴백은 **같은 주소를 같은 IP 로** 치므로
     * 결과가 같고(빈 배열) 레이트 리밋만 악화시킨다 — 90초를 쓰는 대신 바로 알린다.
     * ⚠️ "검색 결과가 없어요"로 뭉개면 사용자는 **제품이 없는 줄 알고 포기한다.**
     */
    if (unavailable) {
      return Response.json(
        {
          message:
            "제품 검색이 일시적으로 원활하지 않아요. 잠시 후 다시 시도하거나, 성분표 사진을 올려 바로 등록할 수 있어요.",
        },
        { status: 503 },
      );
    }

    // 여기서부터가 claude 프로세스를 띄우는 구간이다 — 사용자당 동시 1건 + 전역 상한.
    const userId = await currentUserId();
    const busy = acquireOrBusy(userId);
    if (busy) return busy;

    // 2차(폴백): 기존 헤드리스 Claude 경로. 프롬프트·검증 규율은 그대로다.
    try {
      const raw = await runClaude(buildProductSearchPrompt({ query }), {
        // 이 엔드포인트만 웹 도구를 연다. 다른 도구는 주지 않는다.
        allowedTools: ["WebSearch", "WebFetch"],
        timeoutMs: TIMEOUT_MS,
        // 사용자가 떠나면 자식을 죽여 가드를 바로 푼다(m3).
        signal: request.signal,
        /*
         * 검색어가 트랜스크립트에 남지만 러너 기본값(cleanupSession: true)이 지운다.
         * 2026-08-21 이전엔 여기만 명시적으로 true 였고 나머지 호출부는 안 지웠다 —
         * "다른 엔드포인트와 같은 정책"이라던 옛 주석의 전제가 그때는 거짓이었다.
         */
      });

      const parsed = parseJsonObject(raw) as Record<string, unknown>;

      if (!Array.isArray(parsed.candidates)) {
        // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다.
        console.error(
          "[api/ai/search] candidates 배열 없음:",
          raw.slice(0, 500),
        );
        return Response.json(
          { message: "AI 응답에 candidates 배열이 없습니다." },
          { status: 502 },
        );
      }

      const candidates = parsed.candidates
        .map(narrowCandidate)
        .filter((item) => item !== null);

      if (parsed.candidates.length > MAX_CANDIDATES) {
        console.warn(
          `[api/ai/search] 규칙 4 위반 — ${parsed.candidates.length}개 반환(최대 ${MAX_CANDIDATES})`,
        );
      }

      /*
       * ⭐ 빈 배열은 실패가 아니라 정상 응답이다(프롬프트 규칙 3: 화해에 없으면 빈 배열).
       *    화면은 "찾지 못했어요 — 직접 입력하기"로 이어 간다.
       */
      // 카탈로그 후보를 앞에 두고 AI 결과로 채운다(중복 제거).
      const narrowed = mergeCandidates(local, candidates);
      // 폴백 결과도 캐시한다 — 90초짜리 호출을 같은 검색어로 반복하지 않는다.
      pruneSearchCache(cache);
      cache.set(query, { at: Date.now(), candidates: narrowed });
      return Response.json({ candidates: narrowed });
    } catch (error: unknown) {
      // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
      console.error("[api/ai/search]", error);
      return Response.json(
        { message: "제품을 찾지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    } finally {
      // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
      release(userId);
    }
  }
}
