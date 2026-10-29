/**
 * POST /api/ai/routine — 아침/저녁 루틴 생성.
 *
 * 프롬프트가 **피부 고민 원문 + 보유 제품 전체**를 포함해 길어진다 — runner 가 stdin 으로
 * 넘기므로 argv 상한(32,767자)에 걸리지 않는다.
 * 그 전문이 세션 트랜스크립트에 그대로 남으므로 러너 기본값(cleanupSession: true)으로 지운다.
 * (옛 주석은 "도구를 안 쓰니 이미지가 안 남아 정리가 불필요하다"고 했는데 틀렸다 — 텍스트도 남는다.)
 */

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { isStringArray, parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { intInRange, LIMITS, readJsonObject, text } from "@/lib/db/input";
import {
  buildRoutinePrompt,
  type RoutineProductInput,
} from "@/lib/prompts/routine";

export const runtime = "nodejs";

const TIMEOUT_MS = 600_000;

/** 텍스트뿐인 본문이라 이미지가 실리는 ingredients 보다 훨씬 작게 잡는다. */
const MAX_BODY_BYTES = 256 * 1024;

/** 프롬프트 출력의 단계 1개 (snake_case 그대로 — 변환은 화면 단에서) */
type RawStep = {
  routine_name: string;
  estimated_time: number;
  using_product: string[];
  how_to_use: string[];
  tips: string[];
  warning: string[];
};

/**
 * 단계 1개를 검증하며 좁힌다.
 * 누락 필드는 **에러가 아니라 빈 값으로 보정**한다 — 루틴 하나가 통째로 날아가는 것보다
 * 팁이 비는 편이 낫다. 다만 핵심 필드(routine_name)가 없으면 그 단계는 버린다.
 */
function narrowStep(value: unknown): RawStep | null {
  if (typeof value !== "object" || value === null) return null;
  const step = value as Record<string, unknown>;

  if (typeof step.routine_name !== "string" || !step.routine_name.trim())
    return null;

  return {
    routine_name: step.routine_name,
    /*
     * 프롬프트 계약은 "초 단위 int" 지만 LLM 은 음수·소수·거대값을 낼 수 있다.
     * 저장(`PUT /api/routines`)은 범위 밖 값을 400 으로 거부하므로(m17) 여기서 0 으로
     * 보정하지 않으면 90초 걸린 생성 결과가 저장에서 통째로 실패한다.
     */
    estimated_time:
      intInRange(step.estimated_time, 0, LIMITS.estimatedTime) ?? 0,
    using_product: isStringArray(step.using_product) ? step.using_product : [],
    how_to_use: isStringArray(step.how_to_use) ? step.how_to_use : [],
    tips: isStringArray(step.tips) ? step.tips : [],
    warning: isStringArray(step.warning) ? step.warning : [],
  };
}

function narrowSteps(value: unknown): RawStep[] {
  if (!Array.isArray(value)) return [];
  return value.map(narrowStep).filter((step): step is RawStep => step !== null);
}

/**
 * 프롬프트 "규칙"은 계약이지만 **LLM 은 이를 어긴다.**
 * 어겼다고 크래시내지 않고 경고만 남긴다 — 결과는 보여주되 품질 저하를 놓치지 않기 위함.
 */
function warnOnRuleViolations(
  steps: RawStep[],
  slot: "morning" | "evening",
  known: Set<string>,
): void {
  const invented = steps
    .flatMap((step) => step.using_product)
    .filter((name) => !known.has(name.trim()));
  if (invented.length > 0) {
    console.warn(
      `[api/ai/routine] 규칙 3 위반(${slot}) — 보유하지 않은 제품:`,
      invented,
    );
  }

  if (steps.some((step) => step.how_to_use.length === 0)) {
    console.warn(
      `[api/ai/routine] 규칙 8 위반(${slot}) — how_to_use 가 빈 단계가 있음`,
    );
  }
}

function narrowProducts(value: unknown): RoutineProductInput[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const product = item as Record<string, unknown>;
    if (typeof product.productName !== "string") return [];

    return [
      {
        productName: product.productName,
        category:
          typeof product.category === "string" ? product.category : "미분류",
        ingredients: isStringArray(product.ingredients)
          ? product.ingredients
          : [],
      },
    ];
  });
}

/**
 * 루틴 이름에 붙는 고민 요약(사용자 요청 2026-08-20 — "블랙헤드 - 저녁 루틴").
 * 프롬프트 규칙 9는 2~8자를 요구하지만 LLM 은 계약을 어길 수 있다 —
 * 여유를 두고 2~20자 밖이면 **경고 후 null** 로 강등한다. 이름은 요약 없이도 성립한다.
 */
function narrowSummary(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    if (trimmed)
      console.warn(
        `[api/ai/routine] concern_summary 길이 위반: "${trimmed.slice(0, 30)}"`,
      );
    return null;
  }
  return trimmed;
}

export async function POST(request: Request) {
  // 사용자당 동시 1건 + 전역 상한. 루틴 생성은 90초짜리 claude 프로세스라 특히 중복 실행 비용이 크다.
  const userId = await currentUserId();
  const busy = acquireOrBusy(userId);
  if (busy) return busy;

  try {
    // content-length 가 없는 요청은 검사 없이 통과시킨다(흔치 않고, 다른 방어가 남아 있다).
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return Response.json(
        { message: "요청 본문이 너무 큽니다(최대 256KB)." },
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

    /*
     * 상한은 저장(`PUT /api/profile`)과 같다(m17) — 여기서 안 막으면 90초 생성이 끝난 뒤
     * 프로필 저장이 400 으로 실패해 결과가 버려진다.
     */
    const wonder = text(body.wonder, LIMITS.wonder);
    if (!wonder) {
      return Response.json(
        { message: `wonder 는 필수이고 ${LIMITS.wonder}자 이하여야 합니다.` },
        { status: 400 },
      );
    }

    const time = (body.usableTime ?? {}) as Record<string, unknown>;
    const morning = text(time.morning, LIMITS.usableTime);
    const evening = text(time.evening, LIMITS.usableTime);
    if (!morning || !evening) {
      return Response.json(
        {
          message: `usableTime.morning 과 usableTime.evening 이 필요합니다(${LIMITS.usableTime}자 이하).`,
        },
        { status: 400 },
      );
    }

    const products = narrowProducts(body.products);
    if (products.length === 0) {
      return Response.json(
        { message: "등록된 제품이 없어 루틴을 만들 수 없습니다." },
        { status: 400 },
      );
    }

    try {
      const raw = await runClaude(
        buildRoutinePrompt({
          wonder,
          usableTime: { morning, evening },
          products,
        }),
        // 사용자가 떠나면(새로고침·탭 닫기) 자식을 죽여 가드를 바로 푼다(m3).
        { timeoutMs: TIMEOUT_MS, signal: request.signal },
      );

      const parsed = parseJsonObject(raw) as Record<string, unknown>;
      const morningSteps = narrowSteps(parsed.morning);
      const eveningSteps = narrowSteps(parsed.evening);

      if (morningSteps.length === 0 && eveningSteps.length === 0) {
        // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다.
        console.error("[api/ai/routine] 루틴 생성 실패:", raw.slice(0, 500));
        return Response.json(
          { message: "AI 가 루틴을 만들지 못했습니다." },
          { status: 502 },
        );
      }

      const known = new Set(
        products.map((product) => product.productName.trim()),
      );
      warnOnRuleViolations(morningSteps, "morning", known);
      warnOnRuleViolations(eveningSteps, "evening", known);

      return Response.json({
        morning: morningSteps,
        evening: eveningSteps,
        concern_summary: narrowSummary(parsed.concern_summary),
      });
    } catch (error: unknown) {
      // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
      console.error("[api/ai/routine]", error);
      return Response.json(
        { message: "루틴 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }
  } finally {
    // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
    release(userId);
  }
}
