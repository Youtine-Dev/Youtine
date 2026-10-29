/**
 * GET /api/products/popular — 많이 담긴 순으로 공유 카탈로그를 준다.
 *
 * `products` 는 전체 공유 카탈로그이고 `shelf_items` 가 "누가 담았는지"다.
 * 담긴 횟수를 세면 인기 제품이 나온다 — 순위를 따로 관리할 필요가 없다.
 * 쓸수록 좋아지는 카탈로그를 만들자던 서버 저장소 결정의 실제 쓸모다.
 *
 * `?q=` 가 있으면 **카탈로그 전체**를 검색한다(3라운드 m26) — 인기 상위 12개만 거르면
 * 방금 담은 제품도 "검색 결과가 없습니다"가 된다. AI 는 태우지 않는다(DB 한 번).
 *
 * ⛔ **`shelf_items.thumbnail` 을 절대 가져오지 않는다.** 그건 사용자가 직접 찍은 사진이라
 *    남에게 보이면 안 된다. 공유해도 되는 이미지는 `products.image` 하나뿐이다
 *    (`db/migrations/002_product_image.sql` 에 근거가 있다).
 */

import { dbErrorResponse, selectRows } from "@/lib/db/pool";
import { toProduct } from "@/lib/db/rows";
import { shrinkLargeImages } from "@/lib/images";

export const runtime = "nodejs";

/** 화면이 그리드로 보여 주는 양. 더 필요하면 검색을 쓰는 게 맞다. */
const LIMIT = 12;
/** 검색 결과 상한 — 이보다 많으면 검색어를 늘리는 게 낫다. */
const SEARCH_LIMIT = 20;
/** 사람이 입력할 검색어 길이(`/api/ai/search` 와 같은 값). */
const MAX_QUERY_LENGTH = 100;

/*
 * ⚠️ 여기서 고르는 컬럼에 개인 데이터가 섞이면 안 된다. `s.thumbnail` 이 없는 것이 의도다.
 * `LIMIT` 은 상수로 박는다 — 바인딩 파라미터로 넘기면 드라이버에 따라 문자열로 인용된다.
 */
const POPULAR_SQL = `
  SELECT p.id, p.name, p.brand, p.category, p.ingredients, p.warnings, p.image,
         COUNT(s.id) AS shelf_count
    FROM products p
    JOIN shelf_items s ON s.product_id = p.id
   GROUP BY p.id, p.name, p.brand, p.category, p.ingredients, p.warnings,
            p.image, p.updated_at
   ORDER BY shelf_count DESC, p.updated_at DESC
   LIMIT ${LIMIT}
`;

/**
 * 토큰마다 AND — 화면의 시드 검색(`searchProducts`)과 **같은 규칙**이다(이름·브랜드·카테고리
 * 부분 일치). 판정이 어긋나면 같은 질의에 한쪽 목록만 걸린다.
 * 모두가 선반에서 뺀 제품도 카탈로그에는 남아 있으므로 LEFT JOIN 이다.
 */
function searchSql(tokenCount: number): string {
  const match = `CONCAT_WS(' ', p.name, p.brand, p.category) LIKE ? ESCAPE '\\\\'`;
  return `
  SELECT p.id, p.name, p.brand, p.category, p.ingredients, p.warnings, p.image,
         COUNT(s.id) AS shelf_count
    FROM products p
    LEFT JOIN shelf_items s ON s.product_id = p.id
   WHERE ${Array(tokenCount).fill(match).join(" AND ")}
   GROUP BY p.id, p.name, p.brand, p.category, p.ingredients, p.warnings,
            p.image, p.updated_at
   ORDER BY shelf_count DESC, p.updated_at DESC
   LIMIT ${SEARCH_LIMIT}
`;
}

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { message: `검색어는 ${MAX_QUERY_LENGTH}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  try {
    if (query) {
      // `%`·`_` 를 그대로 두면 `?q=%` 한 글자에 카탈로그 전체가 걸린다(m18 과 같은 함정).
      const patterns = query
        .split(/\s+/)
        .map((token) => `%${token.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const rows = await selectRows(searchSql(patterns.length), patterns);
      const products = rows.map(toProduct).filter((p) => p !== null);
      shrinkLargeImages(products);
      return Response.json(products);
    }

    const rows = await selectRows(POPULAR_SQL);

    /*
     * ⭐ 빈 배열이 정상이다. 아무도 아직 담지 않았으면 인기 제품이 없다 —
     *    화면은 시드 카탈로그를 대신 보여 준다(계획서 Q2 결정).
     */
    const products = rows.map(toProduct).filter((p) => p !== null);
    shrinkLargeImages(products);
    return Response.json(products);
  } catch (error) {
    return dbErrorResponse("api/products/popular GET", error);
  }
}
