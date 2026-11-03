/**
 * POST /api/ai/ingredients — 제품 성분 추출.
 *
 * 이미지는 base64 로 모델에 넘기지 않는다. **임시 파일로 저장하고 경로를 프롬프트에 넣어
 * `--allowedTools Read` 로 읽게** 한다(설계 Q3·Q8). 그래서 두 가지 정리가 필수다:
 *  1. 임시 파일 삭제 — `finally` 에서.
 *  2. 세션 트랜스크립트 삭제 — 러너의 `cleanupSession` 기본값(true)이 처리한다.
 *     Read 로 읽힌 **제품 사진 사본이 트랜스크립트에 남는다**(실측 확인).
 *
 * 응답: `{ product_name, category, ingredients, source, brand? }` — `source` 는 서버가 붙인다
 * (`catalog` 카탈로그 히트 · `brand` 공식몰 · `photo` 사진 판독 · `web` 웹 추정). `brand` 는 catalog 일 때만.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { isStringArray, parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import {
  LIMITS,
  optionalText,
  readJsonObject,
  text,
  textArray,
} from "@/lib/db/input";
import { selectRows } from "@/lib/db/pool";
import {
  findIngredientsFromBrandSite,
  looksLikeIngredients,
} from "@/lib/ingredients/brandSites";
import { buildIngredientsPrompt } from "@/lib/prompts/ingredients";

// 자식 프로세스를 띄우므로 Edge 런타임에서는 동작하지 않는다.
export const runtime = "nodejs";

/** 이미지 인식은 텍스트만 다루는 호출보다 오래 걸린다(WatchList 기준 300초). */
const TIMEOUT_MS = 300_000;

/** 웹 경로에서 이 개수 이상이면 첫 성분이 물이 아니어도 전성분으로 본다(부분 목록 실측 2~9종). */
const FULL_LIST_MIN = 15;

/**
 * 등록(`POST /api/products`)의 성분 상한과 같다 — 다르면 추출은 되고 저장에서 400 이 나는데
 * 모달 안에서 고칠 수단이 없다(4라운드 m10).
 */
const INGREDIENT_LIMITS = { maxItems: 300, maxLength: 200 };

/** 이미지 data URL 이 실려 다른 두 AI 엔드포인트보다 훨씬 크다. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** 용량은 저장하지 않는 프롬프트 힌트다. 상한은 프롬프트 비대화 방지용("50ml" 류면 충분). */
const MAX_CAPACITY = 100;

/**
 * data URL 을 확장자와 바이트로 가른다. 형식이 아니면 null.
 *
 * 확장자는 선언된 MIME 이 아니라 **매직 바이트**로 정한다 — `data:image/png;base64,` 뒤에
 * 이미지가 아닌 바이트가 와도 통과해 claude 까지 띄우던 경로가 있었다(3라운드 m17).
 */
function decodeDataUrl(
  value: string,
): { extension: string; bytes: Buffer } | null {
  const match = /^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i.exec(value);
  if (!match) return null;

  const bytes = Buffer.from(match[1], "base64");
  const extension = sniffImage(bytes);
  return extension ? { extension, bytes } : null;
}

/** 허용 형식(JPEG·PNG·WebP)의 시그니처. 아니면 null. */
function sniffImage(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (bytes.toString("latin1", 0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * 카탈로그에서 성분을 찾는다 — **AI 를 태우기 전의 DB 우선 경로**(사용자 지시 2026-08-20).
 *
 * 같은 제품을 누군가 이미 등록했다면 성분이 카탈로그(`products.ingredients`)에 있다.
 * 그건 실제 성분표 사진에서 추출된 값이라, 이름만으로 모델 지식에 묻는 것보다 **더 정확**하고
 * 20~50초와 구독 비용이 0이 된다.
 *
 * 매칭 규칙:
 *  - 회사가 오면 (name, brand) 정확 일치 — 저장 시 brand 는 trim·빈 문자열 정규화이므로
 *    같은 규칙으로 맞춘다(products POST 와 동일).
 *  - 회사가 없으면 이름만으로 찾되 **정확히 1건일 때만** 쓴다 — 동명 타사 제품 오매칭 방지.
 *  - 성분이 비어 있으면(아직 추출 전) 캐시로 치지 않는다.
 */
async function readCatalog(
  productName: string,
  productCompany: string | undefined,
): Promise<{
  name: string;
  brand: string;
  category: string;
  ingredients: string[];
} | null> {
  const brand = productCompany?.trim() ?? "";
  const rows = await selectRows(
    brand
      ? `SELECT name, brand, category, ingredients FROM products
          WHERE name = ? AND brand = ? AND JSON_LENGTH(ingredients) > 0`
      : `SELECT name, brand, category, ingredients FROM products
          WHERE name = ? AND JSON_LENGTH(ingredients) > 0`,
    brand ? [productName, brand] : [productName],
  );
  if (rows.length !== 1) return null;

  const row = rows[0];
  if (typeof row !== "object" || row === null) return null;
  const item: Record<string, unknown> = { ...row };
  // mysql2 는 JSON 컬럼을 파싱해 주기도, 문자열로 주기도 한다.
  const raw =
    typeof item.ingredients === "string"
      ? (JSON.parse(item.ingredients) as unknown)
      : item.ingredients;
  if (!isStringArray(raw) || raw.length === 0) return null;

  return {
    name: typeof item.name === "string" ? item.name : productName,
    brand: typeof item.brand === "string" ? item.brand : brand,
    category: typeof item.category === "string" ? item.category : "미분류",
    ingredients: raw,
  };
}

export async function POST(request: Request) {
  const userId = await currentUserId();

  // content-length 가 없는 요청(예: 청크 전송)은 검사 없이 통과시킨다 —
  // 상한을 강제하지 못하는 유일한 경로이지만, 흔치 않고 다른 방어(가드·타임아웃)가 남아 있다.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return Response.json(
      { message: "요청 본문이 너무 큽니다(최대 8MB)." },
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

  // 입력 상한은 claude 를 띄우기 **전에** 본다 — 301자 이름에도 실행되던 경로(3라운드 m17).
  const productName = text(body.productName, LIMITS.productName);
  if (!productName) {
    return Response.json(
      {
        message: `productName 은 필수이고 ${LIMITS.productName}자 이하여야 합니다.`,
      },
      { status: 400 },
    );
  }

  // 회사는 products POST 와 같은 규칙 — 빈 문자열은 "브랜드 미상"이라 유효하다.
  const company =
    typeof body.productCompany === "string" ? body.productCompany.trim() : "";
  if (company.length > LIMITS.brand) {
    return Response.json(
      { message: `브랜드는 ${LIMITS.brand}자 이하여야 합니다.` },
      { status: 400 },
    );
  }
  const productCompany = company || undefined;

  const capacity = optionalText(body.capacity, MAX_CAPACITY);
  if (capacity === null) {
    return Response.json(
      { message: `capacity 는 ${MAX_CAPACITY}자 이하 문자열이어야 합니다.` },
      { status: 400 },
    );
  }

  // 사진도 가드보다 먼저 검증한다 — 이미지가 아닌 입력에 AI 슬롯을 잡을 이유가 없다.
  const image =
    typeof body.productImg === "string" && body.productImg.length > 0
      ? decodeDataUrl(body.productImg)
      : undefined;
  if (image === null) {
    return Response.json(
      { message: "productImg 는 JPEG·PNG·WebP 이미지 data URL 이어야 합니다." },
      { status: 400 },
    );
  }

  /*
   * 카탈로그 우선 — **성분표 사진이 없을 때만.** 사진이 왔다는 것은 사용자가 자기 제품의
   * 성분표를 근거로 내밀었다는 뜻이다(리뉴얼 제품 등 카탈로그와 다를 수 있다) —
   * 그때는 사진을 읽는다. 가드보다 먼저 본다: AI 를 태우지 않는 요청을 429 로 막을
   * 이유가 없다(concern·report 와 같은 순서). 조회 실패는 AI 경로로 계속 간다.
   */
  if (!image) {
    try {
      const catalog = await readCatalog(productName, productCompany);
      if (catalog) {
        /*
         * 응답 계약은 AI 경로와 동일(snake_case) + 출처(`source`).
         * 저장된 brand 도 준다 — 회사 없이 이름만으로 찾은 경우 클라이언트가 그대로 등록하면
         * brand='' 인 중복 행이 생겼다.
         */
        return Response.json({
          product_name: catalog.name,
          brand: catalog.brand,
          category: catalog.category,
          ingredients: catalog.ingredients,
          source: "catalog",
        });
      }
    } catch (error: unknown) {
      console.warn(
        "[api/ai/ingredients] 카탈로그 조회 실패, AI 로 진행:",
        error,
      );
    }

    /*
     * 2단계 — 브랜드 공식몰의 **전성분 표기**(화장품법상 표시 의무 정보).
     * 카탈로그에 없고 사진도 없을 때만 본다. 모델 기억보다 근거가 확실하고
     * 수 초면 끝난다(AI 는 20~50초). 실패는 조용히 다음 단계로 넘어간다.
     *
     * 카테고리는 이 경로로 알 수 없으므로 AI 를 태우지 않고 "미분류"로 둔다 —
     * 성분만으로도 충돌·시너지 분석이라는 핵심 가치가 성립한다.
     */
    const fromBrand = await findIngredientsFromBrandSite(
      productName,
      productCompany,
    );
    if (fromBrand) {
      console.info(
        `[api/ai/ingredients] 공식몰에서 전성분 ${fromBrand.length}개 확보 — AI 생략`,
      );
      return Response.json({
        product_name: productName,
        category: "미분류",
        ingredients: fromBrand,
        source: "brand",
      });
    }
  }

  // 사용자당 동시 1건 + 전역 상한. claude 프로세스 1개가 뜨는 비용이라 중복 실행을 막는다.
  const busy = acquireOrBusy(userId);
  if (busy) return busy;

  try {
    let workdir: string | null = null;
    let imagePath: string | undefined;

    try {
      if (image) {
        workdir = await mkdtemp(join(tmpdir(), "al-ocr-"));
        imagePath = join(workdir, `label.${image.extension}`);
        await writeFile(imagePath, image.bytes);
      }

      const prompt = buildIngredientsPrompt({
        productName,
        capacity,
        productCompany,
        imagePath,
      });

      const raw = await runClaude(prompt, {
        /*
         * 사진이 있으면 `Read` 하나로 충분하다 — 성분표 이미지가 최우선 근거이고,
         * 웹까지 열면 모델이 사진 대신 검색 결과를 섞을 수 있다.
         *
         * ⭐ 사진이 **없을 때는 웹 도구를 연다.** 예전에는 빈 배열이라 모델이 **기억에만**
         *   의존해 전성분 수십 종을 답해야 했고, 프롬프트 규칙 2("확신 없으면 빈 배열")에
         *   따라 정직하게 포기했다 — 그게 "성분 정보를 찾지 못했어요"가 자주 뜨던 원인이다.
         *   사용자 다수가 사진을 찍지 않고 **이름으로 검색**하므로 이 경로가 주 경로다.
         *
         *   A/B 실측(2026-08-21, 같은 프롬프트로 도구만 다르게):
         *     아누아 어성초 77 토너   실패(41초)  → 21종(106초)
         *     라네즈 크림 스킨 토너    0종(21초)   → 15종(56초)
         *     이니스프리 그린티 씨드   2종(26초)   → 31종(98초)
         *   도구 없이는 3건 다 쓸 수 없었고, 웹을 열자 3건 다 실제 전성분에 가까워졌다.
         *   ⚠️ 다만 "부분 목록이 사라졌다"는 표본이 작았다 — 3라운드 M4 실측에서 같은 입력
         *   9회 중 7회가 2~9종이었다. 그래서 아래에 완전성 관문을 둔다.
         *
         * 대가는 2~4배 지연이다. 다만 이 경로는 카탈로그(0초)·공식몰(0.4초)이 **둘 다
         * 실패했을 때만** 탄다 — 40초 기다려 빈손인 것보다 90초 기다려 성분을 받는 게 낫다.
         */
        allowedTools: imagePath ? ["Read"] : ["WebSearch", "WebFetch"],
        timeoutMs: TIMEOUT_MS,
        // 새로고침·탭 닫기면 자식을 죽여 가드를 바로 푼다(3라운드 m3).
        signal: request.signal,
        // cleanupSession 은 러너 기본값(true)에 맡긴다.
        // 예전엔 `Boolean(imagePath)` 라 **사진 없는 경로만** 트랜스크립트를 남겼다.
      });

      const parsed = parseJsonObject(raw) as Record<string, unknown>;

      // LLM 은 스키마를 보장하지 않는다. 프론트로 내보내기 전에 서버에서 좁힌다.
      if (!isStringArray(parsed.ingredients)) {
        // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다(공개 서비스에 내부 응답을 노출하지 않는다).
        console.error(
          "[api/ai/ingredients] ingredients 배열 없음:",
          raw.slice(0, 500),
        );
        return Response.json(
          { message: "AI 응답에 ingredients 배열이 없습니다." },
          { status: 502 },
        );
      }

      /*
       * 완전성 관문 — **웹 경로(사진 없음)에만**(3라운드 M4, 사용자 결정 Q2).
       * 부분 목록은 완전한 목록으로 저장돼 충돌 검사가 빠진 성분을 만든다 → 빈 배열로 강등해
       * 화면이 "성분표 촬영하기"로 이어지게 한다. 사진 판독은 사용자가 내민 근거라 걸지 않는다.
       *
       * 개수 기준을 함께 둔다 — 첫 성분이 물이 아닌 제품(어성초 77% 토너·오일 등)의 완전한 목록이
       * "물로 시작하지 않는다"는 이유만으로 버려졌다(실측: 아누아 24종 → []). 실측 분포상 부분 목록은
       * 2~9종, 웹에서 찾은 전성분은 21~63종이라 15종에서 갈린다.
       */
      // 저장과 같은 상한으로 좁힌다(공백 항목 제거·trim 포함). 넘치면 못 찾은 것과 같게 [] — 촬영 안내로 이어진다.
      let ingredients = textArray(parsed.ingredients, INGREDIENT_LIMITS);
      if (ingredients === null) {
        console.warn(
          `[api/ai/ingredients] 성분 ${parsed.ingredients.length}개 중 저장 상한(개수 ${INGREDIENT_LIMITS.maxItems}·길이 ${INGREDIENT_LIMITS.maxLength}) 초과 — 버림`,
        );
        ingredients = [];
      }
      if (
        !image &&
        ingredients.length > 0 &&
        ingredients.length < FULL_LIST_MIN &&
        !looksLikeIngredients(ingredients)
      ) {
        console.warn(
          `[api/ai/ingredients] 웹 결과 ${ingredients.length}개가 전성분으로 보이지 않아 버림(첫 항목 "${ingredients[0]}")`,
        );
        ingredients = [];
      }

      // 이름도 저장 상한으로 — 넘치거나 비면 사용자가 입력한(이미 상한을 통과한) 이름을 쓴다.
      const extractedName = text(parsed.product_name, LIMITS.productName);
      if (extractedName === null && typeof parsed.product_name === "string") {
        console.warn(
          `[api/ai/ingredients] product_name ${parsed.product_name.length}자 — 입력 이름으로 대체`,
        );
      }

      // ⚠️ 빈 배열은 실패가 아니라 정상 응답이다(프롬프트 규칙 2: 확신 없으면 []).
      //    여기서 에러로 바꾸면 "성분을 지어내지 않는다"는 설계를 정면으로 위배한다.
      return Response.json({
        product_name: extractedName ?? productName,
        // LLM 카테고리는 길이를 보장하지 않는다 — 상한을 넘기면 등록(POST /api/products)이 400 이 된다.
        category: text(parsed.category, LIMITS.category) ?? "미분류",
        ingredients,
        source: image ? "photo" : "web",
      });
    } catch (error: unknown) {
      // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
      console.error("[api/ai/ingredients]", error);
      return Response.json(
        { message: "성분 추출에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    } finally {
      // 성분표 사진이 서버에 남지 않게 한다. 실패해도 본 응답을 막지 않는다.
      if (workdir)
        await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
    release(userId);
  }
}
