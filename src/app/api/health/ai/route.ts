/**
 * GET /api/health/ai — 헤드리스 Claude 가 **지금 실제로 응답하는지** 확인한다.
 *
 * 왜 필요한가(2026-08-20 배포 장애): 구독 OAuth 세션이 만료되자 AI 5종이 전부 502 가
 * 났는데, 화면 메시지는 "성분 추출에 실패했습니다"로 뭉개져 있어 **사용자 신고 전까지
 * 아무도 몰랐고**, 원인 확인에 서버 SSH 로그가 필요했다. 이 라우트는 그 진단을
 * 브라우저 한 번으로 끝내고, 외부 uptime 모니터가 주기적으로 찍을 수 있게 한다.
 *
 * 응답:
 *   200 { ok: true,  checkedAt }                     — 정상
 *   503 { ok: false, reason: "auth" | "error", ... } — reason:"auth" 면 서버에서 재로그인 필요
 *
 * ⚠️ 이 라우트는 claude 프로세스를 띄운다. 아무나 연타하면 서버 자원을 먹으므로
 *    **결과를 캐시**하고, 캐시가 살아 있는 동안은 프로세스를 띄우지 않는다.
 *    캐시가 만료된 순간 동시에 들어온 요청은 **진행 중인 점검 하나를 함께 기다린다**
 *    (3라운드 m8: 예전엔 완료 후에야 캐시가 채워져 동시 요청 수만큼 claude 가 떴다).
 *    사용자당 동시 실행 가드(guard.ts)는 쓰지 않는다 — 운영 점검이 사용자의 AI 사용을
 *    막으면 안 되고, 반대로 사용자 요청 때문에 점검이 429 로 막혀도 안 된다.
 */

import { runClaude } from "@/lib/claude/runner";

export const runtime = "nodejs";

/** 점검은 1분 안에 끝나야 한다 — 더 걸리면 그 자체가 비정상이다. */
const TIMEOUT_MS = 60_000;

/** 정상 결과 재사용 시간. uptime 모니터가 1분 간격으로 찍어도 안전하다. */
const OK_CACHE_MS = 5 * 60_000;

/**
 * 실패 결과는 짧게만 재사용한다 — 재로그인 직후에도 5분 동안 "실패"가 보이면
 * 조치가 먹혔는지 확인할 수 없다. 연타 방어만 되면 된다.
 */
const FAIL_CACHE_MS = 30_000;

/**
 * 인증 만료는 코드 수정이 아니라 **서버 재로그인**으로만 풀린다 — 다른 실패와 구분한다.
 * 실측 문구(러너가 stdout 봉투의 사유를 메시지에 담는다): "Not logged in · Please run /login".
 * `authenticat` 는 authenticate·authentication_error 를 함께 잡는다.
 */
const AUTH_PATTERNS = [
  "oauth",
  "authenticat",
  "unauthorized",
  "not logged in",
  "login",
  "credential",
];

type Cached = { at: number; ok: boolean; body: Record<string, unknown> };

// HMR·다중 요청에서도 하나만 유지한다(guard.ts·warningsQueue 와 같은 이유).
const globalForHealth = globalThis as typeof globalThis & {
  __alAiHealth?: Cached;
  __alAiHealthInFlight?: Promise<Cached>;
};

function isAuthFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** 실제 점검. 거부하지 않는다 — 실패도 결과로 만들어 캐시에 넣는다. */
async function check(): Promise<Cached> {
  const startedAt = Date.now();
  let result: Cached;

  try {
    /*
     * 가장 싼 호출 — 도구 없이 한 줄만 시킨다. 응답 내용은 보지 않고 성공 여부만 본다.
     * `request.signal` 은 넘기지 않는다 — 여러 요청이 이 점검 하나를 공유하므로, 처음 요청이
     * 끊겼다고 죽이면 기다리던 나머지까지 "실패"를 받고 그 실패가 캐시된다.
     */
    await runClaude("ping 이라고만 답하세요. 다른 말은 하지 마세요.", {
      timeoutMs: TIMEOUT_MS,
    });
    result = {
      at: Date.now(),
      ok: true,
      body: {
        ok: true,
        elapsedMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const auth = isAuthFailure(message);

    // 운영자가 서버 로그만 봐도 조치를 알 수 있게 남긴다.
    console.error(
      auth
        ? "[health/ai] ⛔ AI 인증 실패 — 서버에서 `claude` 재로그인 필요:"
        : "[health/ai] AI 점검 실패:",
      message.slice(0, 300),
    );

    result = {
      at: Date.now(),
      ok: false,
      body: {
        ok: false,
        reason: auth ? "auth" : "error",
        // 상세 원문은 로그에만 남긴다(서버 경로·stderr 가 섞여 나올 수 있다).
        message: auth
          ? "AI 인증이 만료됐습니다. 서버에서 재로그인이 필요합니다."
          : "AI 점검에 실패했습니다.",
        checkedAt: new Date().toISOString(),
      },
    };
  }

  globalForHealth.__alAiHealth = result;
  return result;
}

export async function GET() {
  const cached = globalForHealth.__alAiHealth;
  const ttl = cached?.ok ? OK_CACHE_MS : FAIL_CACHE_MS;
  if (cached && Date.now() - cached.at < ttl) {
    return Response.json(
      { ...cached.body, cached: true },
      { status: cached.ok ? 200 : 503 },
    );
  }

  globalForHealth.__alAiHealthInFlight ??= check().finally(() => {
    globalForHealth.__alAiHealthInFlight = undefined;
  });
  const result = await globalForHealth.__alAiHealthInFlight;
  return Response.json(result.body, { status: result.ok ? 200 : 503 });
}
