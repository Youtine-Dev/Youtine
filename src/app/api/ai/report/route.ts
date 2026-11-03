/**
 * POST /api/ai/report — 선반 전체의 성분 상호작용 분석 (시너지·충돌·타입별 주의·추가 추천).
 *
 * **선반은 서버가 직접 읽는다**(클라이언트 body 없음). 캐시 키(지문)를 만드는 곳과
 * AI 입력을 만드는 곳이 같아야 어긋나지 않는다.
 *
 * 캐시: `shelf_reports` (사용자당 1행). 지문이 같으면 AI 를 태우지 않는다 —
 * 호출 1회가 1~2분 + 구독 차감이라 캐시가 곧 기능이다(계획서 Q2-A).
 *
 * **도구를 주지 않는다** — 성분 상호작용은 잘 알려진 지식으로 답하는 것이 규칙이고
 * (프롬프트 규칙 2), concern 실측에서 모델이 웹 도구를 호출하지 않는 것을 확인했다.
 */

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { readJsonObject } from "@/lib/db/input";
import { execute, selectRows } from "@/lib/db/pool";
import { canonicalIngredient, sameIngredient } from "@/lib/ingredientNames";
import {
  buildInteractionsPrompt,
  MAX_CONFLICTS,
  MAX_SUGGESTIONS,
  MAX_SYNERGIES,
  MAX_TYPE_CAUTIONS,
  SKIN_TYPES,
} from "@/lib/prompts/interactions";
import { shelfFingerprint } from "@/lib/shelfFingerprint";

export const runtime = "nodejs";

/** 도구 없는 텍스트 호출이지만 선반 전체를 보므로 concern 보다 길다(예상 1~2분). */
const TIMEOUT_MS = 300_000;

type SkinType = (typeof SKIN_TYPES)[number];

type TypeCaution = {
  skin_type: SkinType;
  ingredient: string;
  products: string[];
  caution: string;
};
type Pair = { ingredients: string[]; products: string[]; description: string };
type Suggestion = { ingredient: string; reason: string };

/** 응답이자 캐시(`shelf_reports.result`)에 저장되는 모양. 전부 snake_case(프롬프트 출력 그대로). */
type ShelfReport = {
  skin_type_cautions: TypeCaution[];
  conflicts: Pair[];
  synergies: Pair[];
  suggestions: Suggestion[];
};

const EMPTY_REPORT: ShelfReport = {
  skin_type_cautions: [],
  conflicts: [],
  synergies: [],
  suggestions: [],
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 제품명 대조용. LLM 이 공백·대소문자를 미묘하게 바꿔 쓰므로 지우고 본다. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

function isSkinType(value: string): value is SkinType {
  return (SKIN_TYPES as readonly string[]).includes(value);
}

/**
 * LLM 은 스키마를 보장하지 않는다 — 항목별로 좁혀 불량 항목만 버린다(전체 실패 금지).
 * `owned` 는 보유 성분 집합: 규칙 1(입력에 있는 성분만)·규칙 5(suggestions 는 없는 성분만)
 * 위반을 여기서 걸러낸다. 위반은 경고 로그 — 조용히 넘어가면 프롬프트 품질 저하를 영영 모른다.
 */
function narrowReport(
  parsed: Record<string, unknown>,
  owned: ReadonlySet<string>,
  ownedNames: ReadonlySet<string>,
): ShelfReport {
  /**
   * 규칙 1 은 `products` 에도 걸린다("입력에 실제로 존재하는 … 제품명만").
   * 예전에는 `strArray` 로 통과만 시켜, 지어낸 제품명이 리포트에 그대로 표시됐다(m12).
   * 표기가 흔들릴 수 있어 공백·대소문자를 지우고 비교한다.
   */
  const ownedProducts = (names: string[]) =>
    names.filter((name) => ownedNames.has(normalizeName(name)));

  const cautions = (
    Array.isArray(parsed.skin_type_cautions) ? parsed.skin_type_cautions : []
  )
    .map((value): TypeCaution | null => {
      if (typeof value !== "object" || value === null) return null;
      const item: Record<string, unknown> = { ...value };
      const skinType = str(item.skin_type);
      const ingredient = str(item.ingredient);
      const caution = str(item.caution);
      if (!isSkinType(skinType) || !ingredient || !caution) return null;
      /*
       * 규칙 4 위반 — "보유 성분 중 그 타입이 주의할 것"만 와야 한다(m12).
       * 규칙 1·5 는 `owned` 로 강제하면서 여기만 빠져 있었다. 보유하지도 않은 성분의 주의가
       * '내 선반 분석'으로 사실처럼 표시된다.
       */
      if (!owned.has(ingredient)) {
        console.warn(
          "[api/ai/report] 규칙 4 위반 — 보유하지 않은 성분의 주의 버림:",
          ingredient,
        );
        return null;
      }
      return {
        skin_type: skinType,
        ingredient,
        // 규칙 1 대상이다 — 입력에 없는 제품명은 지어낸 것이라 뺀다.
        products: ownedProducts(strArray(item.products)),
        caution,
      };
    })
    .filter((item) => item !== null)
    .slice(0, MAX_TYPE_CAUTIONS);

  const pair = (value: unknown): Pair | null => {
    if (typeof value !== "object" || value === null) return null;
    const item: Record<string, unknown> = { ...value };
    const ingredients = strArray(item.ingredients);
    const description = str(item.description);
    if (ingredients.length < 2 || !description) return null;
    /*
     * 규칙 1 위반 — 보유하지 않은 성분이 낀 조합은 버린다. "내 선반에 없는 성분"의
     * 충돌 경고는 사용자를 혼란시키고, 지어낸 조합일 가능성이 높다.
     */
    if (!ingredients.every((name) => owned.has(name))) {
      console.warn(
        "[api/ai/report] 규칙 1 위반 — 보유하지 않은 성분 조합 버림:",
        ingredients.join("+"),
      );
      return null;
    }
    return {
      ingredients,
      products: ownedProducts(strArray(item.products)),
      description,
    };
  };

  const conflicts = (Array.isArray(parsed.conflicts) ? parsed.conflicts : [])
    .map(pair)
    .filter((item) => item !== null)
    .slice(0, MAX_CONFLICTS);

  const synergies = (Array.isArray(parsed.synergies) ? parsed.synergies : [])
    .map(pair)
    .filter((item) => item !== null)
    .slice(0, MAX_SYNERGIES);

  const suggestions = (
    Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  )
    .map((value): Suggestion | null => {
      if (typeof value !== "object" || value === null) return null;
      const item: Record<string, unknown> = { ...value };
      const ingredient = str(item.ingredient);
      const reason = str(item.reason);
      if (!ingredient || !reason) return null;
      // 규칙 5 위반 — 이미 보유한 성분을 "추가하라"고 하면 버린다.
      if (owned.has(ingredient)) {
        console.warn(
          "[api/ai/report] 규칙 5 위반 — 보유 성분을 제안해 버림:",
          ingredient,
        );
        return null;
      }
      return { ingredient, reason };
    })
    .filter((item) => item !== null)
    .slice(0, MAX_SUGGESTIONS);

  return { skin_type_cautions: cautions, conflicts, synergies, suggestions };
}

/**
 * 새로 생성된 분석에서 **공유 지식**을 수확한다(사용자 지시 2026-08-20).
 *
 * 같은 지식(레티놀×비타민C 충돌 등)을 사용자마다 AI 로 다시 사지 않도록,
 * 사용자와 무관한 **성분 쌍(시너지·충돌)만** `ingredient_pairs` 에 쌓는다.
 *
 * - 피부 타입별 주의는 수확하지 않는다(3라운드 m12) — "이 제품의 고농도 …" 같은
 *   **제품 고유 맥락** 문장이라 공유 지식으로 영구 저장하면 다른 제품에도 사실처럼 붙는다.
 * - 같은 쌍에 **다른 kind 가 이미 있으면 넣지 않는다**(3라운드 M7). 유니크 키가 (a, b, kind) 라
 *   시드가 '충돌'인 쌍에 LLM 이 '시너지'라 답하면 둘 다 쌓였다. 충돌을 먼저 넣으므로
 *   한 리포트 안에서 양쪽에 나오면 충돌이 이긴다(안전 우선).
 * - 성분명은 별칭 표의 대표명으로 모은다 — 라벨 표기("Glycolic Acid")별로 쪼개 쌓이지 않게.
 * - a < b 정렬은 **DB 가** 한다(3라운드 m11). JS `localeCompare` 는 `CHECK (a < b)` 의
 *   `utf8mb4_unicode_ci` 와 순서가 달라 라틴↔한글 혼합 쌍이 INSERT IGNORE 로 조용히 버려졌다.
 * - 캐시 히트 경로에서는 부르지 않는다(처음 생성될 때 이미 수확했다).
 * - 쌍은 정확히 2개짜리만(스키마가 이진 관계다). 3개 조합은 건너뛴다.
 * - 실패해도 응답을 막지 않는다 — 지식 축적은 부산물이지 기능이 아니다.
 */
async function harvestKnowledge(report: ShelfReport): Promise<void> {
  const pairRows = [...report.conflicts, ...report.synergies].flatMap(
    (item) => {
      if (item.ingredients.length !== 2) return [];
      const kind = report.conflicts.includes(item) ? "conflict" : "synergy";
      const a = canonicalIngredient(item.ingredients[0]);
      const b = canonicalIngredient(item.ingredients[1]);
      if (!a || !b || sameIngredient(a, b)) return [];
      return [{ a, b, kind, description: item.description }];
    },
  );

  for (const row of pairRows) {
    await execute(
      `INSERT IGNORE INTO ingredient_pairs
         (id, ingredient_a, ingredient_b, kind, description, source)
       SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), ?, ?, 'shelf_report'
         FROM (SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
                      CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
        WHERE t.x <> t.y
          AND NOT EXISTS (
                SELECT 1 FROM ingredient_pairs p
                 WHERE p.ingredient_a = LEAST(t.x, t.y)
                   AND p.ingredient_b = GREATEST(t.x, t.y))`,
      [row.kind, row.description, row.a, row.b],
    );
  }
}

type ShelfItem = {
  id: string;
  name: string;
  category: string;
  ingredients: string[];
};

async function readShelf(userId: string): Promise<ShelfItem[]> {
  const rows = await selectRows(
    `SELECT p.id, p.name, p.category, p.ingredients
       FROM shelf_items s
       JOIN products p ON p.id = s.product_id
      WHERE s.user_id = ?`,
    [userId],
  );

  return rows
    .map((row): ShelfItem | null => {
      if (typeof row !== "object" || row === null) return null;
      const item: Record<string, unknown> = { ...row };
      const id = str(item.id);
      if (!id) return null;
      // mysql2 는 JSON 컬럼을 파싱해 주기도, 문자열로 주기도 한다.
      const raw =
        typeof item.ingredients === "string"
          ? (JSON.parse(item.ingredients) as unknown)
          : item.ingredients;
      return {
        id,
        name: str(item.name),
        category: str(item.category),
        ingredients: strArray(raw),
      };
    })
    .filter((item) => item !== null);
}

export async function POST(request: Request) {
  const userId = await currentUserId();

  /*
   * `generate: true` 일 때만 AI 를 태운다(사용자 결정 2026-08-20 — 분석은 명시적
   * "분석하기" 버튼으로만). 기본은 **캐시 전용**: 지문이 맞는 캐시가 있으면 주고,
   * 없으면 `null` 을 준다 — 화면은 그걸 보고 버튼을 띄운다.
   */
  // 본문 없음·객체 아님 = 캐시 전용. 형식 오류로 400 을 줄 만큼 중요한 입력이 아니다.
  const generate = (await readJsonObject(request))?.generate === true;

  let shelf: ShelfItem[];
  try {
    shelf = await readShelf(userId);
  } catch (error) {
    console.error("[api/ai/report] 선반 조회 실패:", error);
    return Response.json(
      { message: "선반을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  /*
   * ⭐ 빈 선반은 실패가 아니다 — 분석할 것이 없다는 정상 응답(빈 리포트)이다.
   *    AI 를 태우지 않고, 캐시에도 저장하지 않는다(제품이 담기면 지문이 생긴다).
   */
  if (shelf.length === 0) return Response.json(EMPTY_REPORT);

  const fingerprint = shelfFingerprint(shelf);
  const owned = new Set(shelf.flatMap((item) => item.ingredients));
  const ownedNames = new Set(shelf.map((item) => normalizeName(item.name)));

  // 캐시는 가드보다 먼저 — AI 를 태우지 않는 요청을 429 로 막을 이유가 없다(concern 과 동일).
  try {
    const rows = await selectRows(
      `SELECT result FROM shelf_reports WHERE user_id = ? AND fingerprint = ?`,
      [userId, fingerprint],
    );
    if (rows.length > 0) {
      const row = rows[0];
      const raw =
        typeof row === "object" && row !== null && "result" in row
          ? row.result
          : null;
      const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof parsed === "object" && parsed !== null) {
        return Response.json(
          narrowReport(parsed as Record<string, unknown>, owned, ownedNames),
        );
      }
    }
  } catch (error) {
    console.warn("[api/ai/report] 캐시 조회 실패, AI 로 진행:", error);
  }

  /*
   * 캐시 미스 + 캐시 전용 요청 → `null`. "아직 분석 전"이라는 정상 응답이다.
   * (선반이 바뀌어 지문이 어긋난 경우도 여기로 온다 — 화면에 분석하기 버튼이 다시 뜬다.)
   */
  if (!generate) return Response.json(null);

  /*
   * 보유 성분이 하나도 없으면(이름만 등록한 제품뿐) AI 를 태우지 않는다(4라운드 m20) — 1~2분 돌려도
   * 결과는 늘 빈 리포트였다. 빈 선반과 같게 캐시하지 않는다(성분이 채워지면 지문이 바뀐다).
   */
  if (owned.size === 0) return Response.json(EMPTY_REPORT);

  // 사용자당 동시 1건 + 전역 상한. 호출마다 claude 프로세스가 뜬다.
  const busy = acquireOrBusy(userId);
  if (busy) return busy;

  try {
    const raw = await runClaude(
      buildInteractionsPrompt({
        products: shelf.map((item) => ({
          productName: item.name,
          category: item.category,
          ingredients: item.ingredients,
        })),
      }),
      // 도구를 주지 않는다(빈 배열이면 러너가 `--tools ""` 로 전부 끈다).
      // 사용자가 떠나면(새로고침·탭 닫기) 자식을 죽여 가드를 푼다(3라운드 m3).
      { timeoutMs: TIMEOUT_MS, signal: request.signal },
    );

    const parsed = parseJsonObject(raw) as Record<string, unknown>;

    // 네 배열 중 하나라도 있으면 계약을 지킨 응답으로 본다. 전부 없으면 형식 실패다.
    const hasAny = [
      "skin_type_cautions",
      "conflicts",
      "synergies",
      "suggestions",
    ].some((key) => Array.isArray(parsed[key]));
    if (!hasAny) {
      // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다.
      console.error("[api/ai/report] 출력 배열 없음:", raw.slice(0, 500));
      return Response.json(
        { message: "AI 응답 형식이 올바르지 않습니다." },
        { status: 502 },
      );
    }

    const report = narrowReport(parsed, owned, ownedNames);

    /*
     * 캐시 저장 — 좁힌 결과를 저장하므로 읽기는 한 번 더 좁히기만 하면 된다.
     * 저장 실패는 응답을 막지 않는다(캐시는 최적화다).
     * `VALUES()` 를 함수 인자로 쓰지 않는 단순 할당이라 MariaDB 이슈가 없다.
     */
    try {
      await execute(
        `INSERT INTO shelf_reports (user_id, fingerprint, result)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           fingerprint = VALUES(fingerprint),
           result      = VALUES(result),
           created_at  = CURRENT_TIMESTAMP`,
        [userId, fingerprint, JSON.stringify(report)],
      );
    } catch (error) {
      console.warn("[api/ai/report] 캐시 저장 실패:", error);
    }

    // 공유 지식 수확 — 실패는 로그만(부산물이지 기능이 아니다).
    try {
      await harvestKnowledge(report);
    } catch (error) {
      console.warn("[api/ai/report] 지식 수확 실패:", error);
    }

    return Response.json(report);
  } catch (error: unknown) {
    // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
    console.error("[api/ai/report]", error);
    return Response.json(
      { message: "분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  } finally {
    // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
    release(userId);
  }
}
