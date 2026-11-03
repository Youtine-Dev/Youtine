/**
 * GET /api/products/by-ingredient?name=판테놀 — 그 성분이 든 제품을 카탈로그에서 찾는다.
 *
 * **웹 검색을 쓰지 않는다**(concern-flow Q4, 2026-08-19 실측 근거).
 * 성분명으로 웹 검색을 시키면 모델이 도구를 호출하지 않고 기억으로 답하고,
 * 화해 검색 자체도 성분 필터가 아니라 제품명 텍스트 매치였다.
 * 여기 있는 `ingredients` 는 실제로 추출·저장된 값이라 **"관련 있어 보임"이 아니라 확정**이다.
 *
 * ⛔ `shelf_items.thumbnail`(개인 사진)을 가져오지 않는다 — 남의 사진이 노출된다.
 *    공유해도 되는 이미지는 `products.image` 뿐이다(002 마이그레이션).
 */

import { dbErrorResponse, selectRows } from "@/lib/db/pool";
import { toProduct } from "@/lib/db/rows";
import { shrinkLargeImages } from "@/lib/images";
import { containsIngredient, ingredientAliases } from "@/lib/ingredientNames";

export const runtime = "nodejs";

const LIMIT = 12;

/** 성분명 길이 상한. 컬럼 값이 아니라 검색어라 넉넉할 이유가 없다. */
const MAX_NAME_LENGTH = 60;

/*
 * `JSON_SEARCH` 로 **배열 원소 안에서** 찾는다. 단순 LIKE 로 컬럼 전체를 훑으면
 * 다른 필드(제품명 등)에 우연히 들어간 글자까지 걸린다.
 * **앞부분 일치**(`CONCAT(?, '%')`)인 이유는 표기가 흔들리기 때문이다 — "세라마이드엔피", "판테놀(비타민B5)".
 * 지식 매칭(`sameIngredient`, 정확 일치만)과 다르게 둔 것은 의도다 — 여기 결과는 안전 정보가 아니라
 * 제품 목록이고, "세라마이드가 든 제품"에 세라마이드엔피 제품이 나오는 것은 맞는 답이다.
 * ⛔ 양쪽 `%` 로 열지 않는다(4라운드 M2) — '우레아'에 방부제 '이미다졸리디닐우레아'만 든 제품이 나왔다.
 *    SQL 은 선필터이고, 응답 규칙은 아래에서 다시 거르는 `containsIngredient`(테스트 핀)다.
 *
 * ⭐ 별칭 확장(M9): 지식 조회(`/api/knowledge/ingredient`)는 `sameIngredient` 로 복합 표기
 * ("비타민씨(아스코빅애씨드)")를 잇는데, 이 라우트만 원시 검색이면 사전 → "이 성분이 든 내 제품"
 * 흐름이 항상 빈 결과가 된다. `ingredientAliases` 로 표기를 펼쳐 각각 OR 검색한다 —
 * 별칭 수만큼 `?` 를 늘릴 뿐, 값은 전부 바인딩이다(인젝션 없음).
 *
 * ⭐ 검색어의 `%`·`_`·`\` 는 이스케이프한다(3라운드 m18) — `?name=%` 하나로 카탈로그 전체가
 * "이 성분이 든 제품"으로 나왔다. 4번째 인자가 JSON_SEARCH 의 이스케이프 문자다(`ai/search` 의 ESCAPE 와 같은 `\`).
 *
 * 인덱스를 타지 못하지만 카탈로그 규모가 작아 문제되지 않는다.
 * ponytail: 느려지면 성분 전용 테이블로 정규화한다.
 */
const byIngredientSql = (aliasCount: number) => `
  SELECT p.id, p.name, p.brand, p.category, p.ingredients, p.warnings, p.image,
         COUNT(s.id) AS shelf_count
    FROM products p
    LEFT JOIN shelf_items s ON s.product_id = p.id
   WHERE ${Array.from(
     { length: aliasCount },
     () =>
       `JSON_SEARCH(p.ingredients, 'one', CONCAT(?, '%'), '\\\\') IS NOT NULL`,
   ).join("\n      OR ")}
   GROUP BY p.id, p.name, p.brand, p.category, p.ingredients, p.warnings,
            p.image, p.updated_at
   ORDER BY shelf_count DESC, p.updated_at DESC
   LIMIT ${LIMIT}
`;

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";

  if (!name) {
    return Response.json({ message: "성분명이 필요합니다." }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return Response.json(
      { message: `성분명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  try {
    // name 이 비어 있지 않으므로 별칭은 최소 1개다(원문 자신이 항상 포함된다).
    const aliases = ingredientAliases(name).map((alias) =>
      alias.replace(/[%_\\]/g, (c) => `\\${c}`),
    );
    const rows = await selectRows(byIngredientSql(aliases.length), aliases);

    /*
     * ⭐ 빈 배열이 정상이다. **카탈로그에 그 성분이 든 제품이 아직 없다는 뜻**이지
     *    그런 제품이 세상에 없다는 뜻이 아니다. 화면은 그 차이를 말해 줘야 한다
     *    ("아직 담긴 제품이 없어요 — 스캔에서 찾아 담아 보세요").
     */
    /*
     * SQL(앞부분 일치)과 같은 규칙이라 지금은 no-op 이다. 둘이 어긋나면 SQL 이 더 넓게 고른 행만
     * 빠지고 LIMIT 이 재필터보다 먼저라 목록이 12개보다 짧아질 수 있다 — 빈 목록이 아니라 짧은 목록.
     * 대소문자: JSON 컬럼은 utf8mb4_bin 이고 JSON_SEARCH 는 그 콜레이션으로 비교한다 → 양쪽 다 구분한다.
     */
    const products = rows
      .map(toProduct)
      .filter((p) => p !== null)
      .filter((p) => containsIngredient(p.ingredients, name));
    shrinkLargeImages(products);
    return Response.json(products);
  } catch (error) {
    return dbErrorResponse("api/products/by-ingredient GET", error);
  }
}
