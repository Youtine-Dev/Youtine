/**
 * POST /api/ai/concern — 피부 고민에 도움이 되는 성분을 추천한다.
 *
 * **도구를 주지 않는다**(`allowedTools` 기본값 = 빈 배열 → `--tools ""`).
 * 성분-효능은 모델 지식으로 답하는 쪽이 빠르고 안정적이라는 결정이다(concern-flow Q3).
 * 웹 검색을 켜도 모델이 도구를 호출하지 않는다는 실측이 근거다.
 */

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { readJsonObject } from "@/lib/db/input";
import { execute, selectRows } from "@/lib/db/pool";
import {
  buildConcernIngredientsPrompt,
  MAX_CONCERN_INGREDIENTS,
} from "@/lib/prompts/concernIngredients";

export const runtime = "nodejs";

/** 도구 없는 텍스트 호출이라 짧다(실측 10~30초). 여유를 둬도 이 정도면 충분하다. */
const TIMEOUT_MS = 120_000;

/** 고민 한 문단뿐이라 작다. */
const MAX_BODY_BYTES = 64 * 1024;

/** `skin_profiles.wonder` 상한과 맞춘다 — 더 길면 저장도 안 된다. */
const MAX_WONDER_LENGTH = 2_000;

type ConcernIngredient = {
  name: string;
  effect: string;
  caution: string | null;
};

/**
 * LLM 은 스키마를 보장하지 않는다. 이름 없는 항목은 화면에 그릴 수 없어 **버린다**
 * (전체를 실패로 만들지 않는다).
 */
function narrowIngredient(value: unknown): ConcernIngredient | null {
  if (typeof value !== "object" || value === null) return null;
  const item: Record<string, unknown> = { ...value };

  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return null;

  const caution =
    typeof item.caution === "string" && item.caution.trim() !== "null"
      ? item.caution.trim()
      : "";

  return {
    name,
    effect: typeof item.effect === "string" ? item.effect.trim() : "",
    // 모델이 문자열 "null" 을 넣기도 한다. 값이 없다는 뜻이면 null 로 통일한다.
    caution: caution || null,
  };
}

/**
 * 프로필에 캐시된 성분 추천을 읽는다. 없으면(NULL·다른 wonder) null.
 *
 * `wonder = ?` 조건이 무효화의 핵심이다 — 프로필의 wonder 가 바뀌면 이 조회가
 * 비고(profile PUT 이 NULL 리셋도 하지만, 이 조건만으로도 낡은 답은 안 나간다).
 * `'[]'` 도 유효한 캐시다(규칙 7: 고를 수 없으면 빈 배열) — 같은 고민에 같은
 * "못 고름"을 다시 사지 않는다.
 */
async function readCache(
  userId: string,
  wonder: string,
): Promise<ConcernIngredient[] | null> {
  const rows = await selectRows(
    `SELECT concern_ingredients FROM skin_profiles
      WHERE user_id = ? AND wonder = ? AND concern_ingredients IS NOT NULL`,
    [userId, wonder],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const raw =
    typeof row === "object" && row !== null && "concern_ingredients" in row
      ? row.concern_ingredients
      : null;
  // mysql2 는 JSON 컬럼을 파싱해 주기도, 문자열로 주기도 한다 — 둘 다 받는다.
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed)) return null;

  // 저장 시점에 좁힌 값이지만, 손으로 고친 DB 값일 수도 있어 한 번 더 좁힌다.
  return parsed
    .map(narrowIngredient)
    .filter((item) => item !== null)
    .slice(0, MAX_CONCERN_INGREDIENTS);
}

export async function POST(request: Request) {
  const userId = await currentUserId();

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

  const wonder = typeof body.wonder === "string" ? body.wonder.trim() : "";
  if (!wonder) {
    return Response.json(
      { message: "피부 고민을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (wonder.length > MAX_WONDER_LENGTH) {
    return Response.json(
      { message: `고민은 ${MAX_WONDER_LENGTH}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  /*
   * 캐시는 **가드보다 먼저** 본다. 가드 뒤에 두면 탭 두 개가 캐시된 답을 동시에
   * 요청했을 때 두 번째가 429 를 받는다 — AI 를 태우지도 않는데 막을 이유가 없다.
   */
  try {
    const cached = await readCache(userId, wonder);
    if (cached !== null) return Response.json({ ingredients: cached });
  } catch (error: unknown) {
    // 캐시 실패는 기능 실패가 아니다 — AI 경로로 계속 간다.
    console.warn("[api/ai/concern] 캐시 조회 실패, AI 로 진행:", error);
  }

  // 사용자당 동시 1건 + 전역 상한. 호출마다 claude 프로세스가 뜬다.
  const busy = acquireOrBusy(userId);
  if (busy) return busy;

  try {
    try {
      const raw = await runClaude(buildConcernIngredientsPrompt({ wonder }), {
        // 도구를 주지 않는다(Q3). 빈 배열이면 러너가 `--tools ""` 로 전부 끈다.
        timeoutMs: TIMEOUT_MS,
        // 사용자가 떠나면(새로고침·탭 닫기) 자식을 죽여 가드를 바로 푼다(3라운드 m3).
        signal: request.signal,
      });

      const parsed = parseJsonObject(raw) as Record<string, unknown>;

      if (!Array.isArray(parsed.ingredients)) {
        // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다.
        console.error(
          "[api/ai/concern] ingredients 배열 없음:",
          raw.slice(0, 500),
        );
        return Response.json(
          { message: "AI 응답에 ingredients 배열이 없습니다." },
          { status: 502 },
        );
      }

      if (parsed.ingredients.length > MAX_CONCERN_INGREDIENTS) {
        console.warn(
          `[api/ai/concern] 규칙 3 위반 — ${parsed.ingredients.length}개 반환(최대 ${MAX_CONCERN_INGREDIENTS})`,
        );
      }

      const ingredients = parsed.ingredients
        .map(narrowIngredient)
        .filter((item) => item !== null)
        .slice(0, MAX_CONCERN_INGREDIENTS);

      /*
       * 캐시 저장. `wonder = ?` 조건이 중요하다 — 30초 걸리는 동안 사용자가 고민을
       * 고쳤으면 **낡은 답을 새 고민의 캐시로 저장하면 안 된다**(0행 갱신으로 끝난다).
       * 프로필이 아직 없으면(임의 wonder 로 직접 호출) 캐시 없이 답만 나간다.
       * 저장 실패는 응답을 막지 않는다 — 캐시는 최적화지 기능이 아니다.
       */
      try {
        await execute(
          `UPDATE skin_profiles SET concern_ingredients = ?
            WHERE user_id = ? AND wonder = ?`,
          [JSON.stringify(ingredients), userId, wonder],
        );
      } catch (error: unknown) {
        console.warn("[api/ai/concern] 캐시 저장 실패:", error);
      }

      /*
       * ⭐ 빈 배열은 실패가 아니라 정상 응답이다(규칙 7: 고를 수 없으면 []).
       *    화면은 "성분을 고르지 못했어요 — 고민을 조금 더 구체적으로" 로 이어 간다.
       */
      return Response.json({ ingredients });
    } catch (error: unknown) {
      // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
      console.error("[api/ai/concern]", error);
      return Response.json(
        { message: "성분을 추천하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }
  } finally {
    // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
    release(userId);
  }
}
