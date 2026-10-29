/**
 * POST /api/ai/warnings — 제품 단독 사용 시 주의사항.
 * 도구 없음. 제품 1개당 1회 호출이라 지연 생성으로 쓴다(등록 직후 대기시키지 않는다).
 */

import { acquireOrBusy, release } from "@/lib/ai/guard";
import { currentUserId } from "@/lib/auth/anonUser";
import { isStringArray, parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { readJsonObject } from "@/lib/db/input";
import { buildWarningsPrompt } from "@/lib/prompts/warnings";

export const runtime = "nodejs";

const TIMEOUT_MS = 300_000;

/** 프롬프트 규칙 7 — 최대 6개 */
const MAX_WARNINGS = 6;

/** 텍스트뿐인 본문이라 이미지가 실리는 ingredients 보다 훨씬 작게 잡는다. */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  // 사용자당 동시 1건 + 전역 상한. claude 프로세스 1개가 뜨는 비용이라 중복 실행을 막는다.
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

    const productName =
      typeof body.productName === "string" ? body.productName.trim() : "";
    if (!productName) {
      return Response.json(
        { message: "productName 은 필수입니다." },
        { status: 400 },
      );
    }

    try {
      const raw = await runClaude(
        buildWarningsPrompt({
          productName,
          category:
            typeof body.category === "string" ? body.category : "미분류",
          // 빈 배열도 정상 입력이다 — 프롬프트 규칙 6이 그 경우의 응답을 따로 정해 뒀다.
          ingredients: isStringArray(body.ingredients) ? body.ingredients : [],
        }),
        // 요청이 끊기면 자식을 죽여 가드를 바로 푼다(m3).
        { timeoutMs: TIMEOUT_MS, signal: request.signal },
      );

      const parsed = parseJsonObject(raw) as Record<string, unknown>;

      // 키가 단수형(`warning`)인데 값은 배열이다. 오타가 아니라 명세 그대로다.
      if (!isStringArray(parsed.warning)) {
        // AI 응답 원문은 응답 본문이 아니라 로그로만 남긴다.
        console.error(
          "[api/ai/warnings] warning 배열 없음:",
          raw.slice(0, 500),
        );
        return Response.json(
          { message: "AI 응답에 warning 배열이 없습니다." },
          { status: 502 },
        );
      }

      if (parsed.warning.length > MAX_WARNINGS) {
        console.warn(
          `[api/ai/warnings] 규칙 7 위반 — ${parsed.warning.length}개 반환(최대 ${MAX_WARNINGS})`,
        );
      }

      return Response.json({ warning: parsed.warning.slice(0, MAX_WARNINGS) });
    } catch (error: unknown) {
      // claude CLI 의 stderr·서버 절대 경로가 섞여 나올 수 있어 상세는 로그로만 남긴다.
      console.error("[api/ai/warnings]", error);
      return Response.json(
        {
          message: "주의사항 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 502 },
      );
    }
  } finally {
    // 예외·타임아웃으로 새면 이 사용자는 영영 AI 를 못 쓰게 되므로 반드시 여기서 푼다.
    release(userId);
  }
}
