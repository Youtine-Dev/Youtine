/**
 * GET /api/knowledge/ingredient?name=레티놀 — 성분 하나의 공유 지식.
 *
 * `ingredient_pairs`(시너지·충돌)와 `ingredient_effects`(고민별 도움·타입별 주의)를
 * 성분명 정규화(`sameIngredient`)로 매칭해 모아 준다. **AI 를 부르지 않는다** —
 * 시드 + 리포트 수확으로 쌓인 DB 지식만 읽으므로 수백 ms 에 답한다.
 *
 * 매칭은 앱 코드에서 한다: 지식 테이블은 수백 행 규모라 전부 읽어 거르는 쪽이
 * SQL LIKE 조합보다 단순하고, 별칭 확장("비타민씨(아스코빅애씨드)")을 SQL 로는
 * 표현하기 어렵다. ponytail: 수천 행이 되면 정규화 컬럼 + 인덱스로 올린다.
 */

import { dbErrorResponse, selectRows } from "@/lib/db/pool";
import { sameIngredient } from "@/lib/ingredientNames";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 100; // ingredient 컬럼(VARCHAR(100))과 맞춘다

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const name = str(new URL(request.url).searchParams.get("name"));
  if (!name || name.length > MAX_NAME_LENGTH) {
    return Response.json(
      { message: `name 은 필수이고 ${MAX_NAME_LENGTH}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  try {
    const [pairRows, effectRows] = await Promise.all([
      selectRows(
        `SELECT ingredient_a, ingredient_b, kind, description FROM ingredient_pairs`,
        [],
      ),
      selectRows(
        `SELECT scenario_kind, scenario, ingredient, relation, description, caution
           FROM ingredient_effects`,
        [],
      ),
    ]);

    const synergies: { partner: string; description: string }[] = [];
    const conflicts: { partner: string; description: string }[] = [];
    for (const row of pairRows) {
      if (typeof row !== "object" || row === null) continue;
      const item: Record<string, unknown> = { ...row };
      const a = str(item.ingredient_a);
      const b = str(item.ingredient_b);
      const description = str(item.description);
      if (!a || !b || !description) continue;

      // 요청 성분이 쌍의 어느 쪽인지 찾고, 반대쪽을 파트너로 준다.
      const partner = sameIngredient(name, a)
        ? b
        : sameIngredient(name, b)
          ? a
          : null;
      if (!partner) continue;

      (item.kind === "synergy" ? synergies : conflicts).push({
        partner,
        description,
      });
    }

    /*
     * 같은 파트너는 한 번만, 시너지·충돌 양쪽에 있으면 **충돌만**(3라운드 M7 — 안전 우선).
     * 수확이 막아도 예전에 쌓인 행·표기만 다른 행("Glycolic Acid"/"글라이콜릭애씨드")이 남아 있다.
     */
    const uniqueByPartner = (list: typeof conflicts) =>
      list.filter(
        (item, index) =>
          list.findIndex((other) =>
            sameIngredient(other.partner, item.partner),
          ) === index,
      );
    const safeConflicts = uniqueByPartner(conflicts);
    const safeSynergies = uniqueByPartner(synergies).filter(
      (item) =>
        !safeConflicts.some((conflict) =>
          sameIngredient(conflict.partner, item.partner),
        ),
    );

    const helps: {
      scenario: string;
      description: string;
      caution: string | null;
    }[] = [];
    const typeCautions: { skinType: string; description: string }[] = [];
    for (const row of effectRows) {
      if (typeof row !== "object" || row === null) continue;
      const item: Record<string, unknown> = { ...row };
      const ingredient = str(item.ingredient);
      const scenario = str(item.scenario);
      const description = str(item.description);
      if (!ingredient || !scenario || !description) continue;
      if (!sameIngredient(name, ingredient)) continue;

      if (item.scenario_kind === "concern" && item.relation === "helps") {
        const caution = str(item.caution);
        helps.push({ scenario, description, caution: caution || null });
      } else if (
        item.scenario_kind === "skin_type" &&
        item.relation === "caution"
      ) {
        typeCautions.push({ skinType: scenario, description });
      }
    }

    /*
     * ⭐ 전부 비어 있어도 200 이다 — "아직 이 성분에 대한 지식이 없다"는 정상 상태다.
     *    지식 베이스는 시드 + 리포트 수확으로 자라므로 화면이 그렇게 안내한다.
     */
    return Response.json({
      name,
      helps,
      typeCautions,
      synergies: safeSynergies,
      conflicts: safeConflicts,
    });
  } catch (error) {
    return dbErrorResponse("api/knowledge/ingredient GET", error);
  }
}
