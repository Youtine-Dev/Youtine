/**
 * POST /api/ai/ingredient-role — 성분 하나가 화장품에서 하는 역할(한두 문장).
 *
 * 제품 모달의 성분 칩에서 부른다(계획서 docs/plans/2026-11-02-ingredient-role).
 * 답은 **성분 단위 공유 캐시**(`ingredient_roles`)다 — 처음 누른 성분만 AI 를 태우고
 * 그 뒤로는 누구에게나 DB 에서 즉시 준다. 그래서 순서가 중요하다:
 *
 *   입력 검증 → 캐시(가드보다 먼저) → 문장처럼 생긴 이름 거르기 → 카탈로그에 있는 성분인가
 *   → 가드 → AI → 저장
 *
 * 도구는 주지 않는다(concern 과 같은 이유). 실측 10~30초.
 */

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { readJsonObject, text } from "@/lib/db/input";
import { execute, selectRows } from "@/lib/db/pool";
import { canonicalIngredient, nameKey } from "@/lib/ingredientNames";
import {
  buildIngredientRolePrompt,
  isPromptSafeName,
  MAX_ROLE_LENGTH,
  parseIngredientRole,
} from "@/lib/prompts/ingredientRole";

export const runtime = "nodejs";

/** 도구 없는 텍스트 호출이라 짧다(concern 과 같은 값). */
const TIMEOUT_MS = 120_000;

/** 성분명 하나뿐이다. */
const MAX_BODY_BYTES = 8 * 1024;

/** 칩 원문 상한 — 제품 저장 시 성분 항목 상한(200자)과 맞춘다. */
const MAX_RAW_LENGTH = 200;

/** `ingredient_roles.name_key`·`name` 이 VARCHAR(100) 이다. */
const MAX_KEY_LENGTH = 100;

/** `ingredient_roles.role` 이 VARCHAR(500) 이다 — 규칙 2(100자) 위반이 심해도 저장은 되게. */
const MAX_STORED_ROLE = 500;

type RoleRow = { found: true; role: string | null } | { found: false };

async function readCache(key: string): Promise<RoleRow> {
  const rows = await selectRows(
    `SELECT role FROM ingredient_roles WHERE name_key = ?`,
    [key],
  );
  const row = rows[0];
  if (typeof row !== "object" || row === null || !("role" in row)) {
    return { found: false };
  }
  return {
    found: true,
    role: typeof row.role === "string" && row.role ? row.role : null,
  };
}

/**
 * 공유 카탈로그의 어떤 제품에라도 실제로 들어 있는 성분인가 — **AI 를 태우기 전에만** 본다.
 * 임의 문자열로 AI 를 돌리고 그 답을 공유 테이블에 쌓는 공개 프록시가 되지 않게 하는 장치다.
 * ponytail: products 전체 JSON 스캔(지금 수백 행). 커지면 성분 정규화 테이블로 올린다.
 */
async function inCatalog(raw: string): Promise<boolean> {
  const rows = await selectRows(
    `SELECT 1 AS hit FROM products WHERE JSON_CONTAINS(ingredients, JSON_QUOTE(?)) LIMIT 1`,
    [raw],
  );
  return rows.length > 0;
}

export async function POST(request: Request) {
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

  const raw = text(body.name, MAX_RAW_LENGTH);
  if (!raw) {
    return Response.json(
      { message: `성분 이름은 1~${MAX_RAW_LENGTH}자여야 합니다.` },
      { status: 400 },
    );
  }

  /*
   * 대표명 = 프롬프트 입력, nameKey(대표명) = 저장 키. 라벨 원문이 아니라 대표명을 넘겨야
   * "레티놀(…아무 문장…)" 이 "레티놀" 로 접혀, 끼워 넣은 문장이 섞인 답이 모든 사용자의 "레티놀"
   * 설명으로 저장되지 않는다.
   * ⚠️ 다만 SYNONYMS 에 없는 이름은 함량 표기만 떼고 **원문 그대로** 대표명이 된다 — 그 원문은
   * 프롬프트에 들어간다. 그래서 아래 '문장처럼 생긴 이름' 관문과 프롬프트 규칙 6(데이터로만 다룸)을
   * 함께 둔다. 실측(QA 주입 시험): 주입 문구를 넣은 이름에 모델은 null 로 답했다.
   */
  const name = canonicalIngredient(raw);
  const key = nameKey(name);
  if (!key || name.length > MAX_KEY_LENGTH) {
    return Response.json(
      { message: "설명할 수 있는 성분 이름이 아닙니다." },
      { status: 400 },
    );
  }

  /*
   * 캐시는 **가드보다 먼저** 본다(concern 과 같은 이유) — 이미 있는 설명을 보려는데
   * 같은 사용자의 루틴 생성이 돌고 있다고 429 를 줄 이유가 없다.
   */
  try {
    const cached = await readCache(key);
    if (cached.found) return Response.json({ name, role: cached.role });
  } catch (error: unknown) {
    // 캐시 실패는 기능 실패가 아니다 — AI 경로로 계속 간다(저장도 실패하겠지만 답은 나간다).
    console.warn("[api/ai/ingredient-role] 캐시 조회 실패, AI 로 진행:", error);
  }

  /*
   * 코드 쪽 주입 관문 — 모델 규칙에만 기대지 않는다. 걸리면 AI 를 부르지도 저장하지도 않고
   * "확인 못 함"(null)으로 답한다. 사용자가 누른 칩은 화면에 그대로 있으니 오류가 아니다.
   */
  if (!isPromptSafeName(name)) {
    return Response.json({ name, role: null });
  }

  try {
    if (!(await inCatalog(raw))) {
      return Response.json(
        { message: "등록된 제품에 있는 성분만 설명할 수 있어요." },
        { status: 404 },
      );
    }
  } catch (error: unknown) {
    // 확인을 못 하면 AI 를 태우지 않는다 — 남용 방지 장치가 DB 장애로 꺼지면 안 된다.
    console.error("[api/ai/ingredient-role] 카탈로그 확인 실패:", error);
    return Response.json(
      {
        message:
          "지금은 성분 설명을 불러올 수 없어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 },
    );
  }

  // 사용자당 동시 1건 + 전역 상한. 호출마다 claude 프로세스가 뜬다.
  const userId = await currentUserId();
  const busy = acquireOrBusy(userId);
  if (busy) return busy;

  try {
    try {
      const output = await runClaude(buildIngredientRolePrompt({ name }), {
        timeoutMs: TIMEOUT_MS,
        // 사용자가 떠나면(새로고침·탭 닫기) 자식을 죽여 가드를 바로 푼다(3라운드 m3).
        signal: request.signal,
      });

      const role = parseIngredientRole(parseJsonObject(output));
      if (role === undefined) {
        // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다.
        console.error(
          "[api/ai/ingredient-role] role 필드 없음:",
          output.slice(0, 500),
        );
        return Response.json(
          { message: "AI 응답에 role 이 없습니다." },
          { status: 502 },
        );
      }

      // 규칙 위반은 경고 후 진행(스킬 ai-contract-check 4절) — 프롬프트 품질 저하를 알기 위해 남긴다.
      if (role !== null && role.length > MAX_ROLE_LENGTH) {
        console.warn(
          `[api/ai/ingredient-role] 규칙 2 위반 — ${role.length}자(최대 ${MAX_ROLE_LENGTH}): ${name}`,
        );
      }
      const stored = role?.slice(0, MAX_STORED_ROLE) ?? null;

      /*
       * 먼저 쓴 쪽이 이긴다 — 두 사용자가 같은 성분을 동시에 처음 열어 AI 가 두 번 돌아도
       * 행은 하나다(리포트 지식 수확과 같은 INSERT IGNORE). 저장 실패는 응답을 막지 않는다.
       */
      try {
        await execute(
          `INSERT IGNORE INTO ingredient_roles (name_key, name, role) VALUES (?, ?, ?)`,
          [key, name, stored],
        );
      } catch (error: unknown) {
        console.warn("[api/ai/ingredient-role] 저장 실패:", error);
      }

      // ⭐ role null 은 실패가 아니라 정상 응답이다(규칙 1·5: 확신이 없으면 null).
      return Response.json({ name, role: stored });
    } catch (error: unknown) {
      // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
      console.error("[api/ai/ingredient-role]", error);
      return Response.json(
        {
          message: "성분 설명을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 502 },
      );
    }
  } finally {
    // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
    release(userId);
  }
}
