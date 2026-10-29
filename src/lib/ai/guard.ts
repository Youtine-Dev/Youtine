/**
 * AI 호출 동시 실행 가드 — **서버 전용, 메모리 기반**.
 *
 * `/api/ai/*` 는 호출 1건마다 `claude -p` 자식 프로세스를 띄운다(루틴 생성 약 90초).
 * 사용자의 Claude 구독 한도에서 차감되므로, 같은 사용자가 탭을 여러 개 열거나 버튼을
 * 연타하면 그만큼 실제 비용이 나간다. 그래서 **쿠키 사용자당 동시 1건**만 허용한다
 * (사용자 결정 2026-08-18 — 쿨다운·rate limit 은 넣지 않는다: 심사 자리에서 여러 명이
 * 번갈아 시연할 때 정상 사용까지 막힌다).
 *
 * dev 의 HMR 은 이 모듈을 다시 평가한다. Set 을 모듈 스코프에 두면 파일을 고칠 때마다
 * 새 Set 이 생겨 표시가 초기화된다 — `src/lib/db/pool.ts` 가 커넥션 풀을 붙이는 것과
 * 같은 이유로 `globalThis` 에 둔다.
 *
 * ⚠️ 한계(둘 다 지금 배포 형태에서는 실제로 발동하지 않는다):
 *  - **프로세스가 여러 개면(스케일아웃) 각자 따로 센다.** 이 Set 은 프로세스 로컬이라
 *    인스턴스 A 가 1건 실행 중이어도 인스턴스 B 는 모른다. 진짜 동시성 제어는 DB/Redis 같은
 *    공유 저장소가 필요하다 — 지금은 단일 프로세스(로컬/단일 서버 심사)라 충분하다.
 *  - **쿠키를 지우면 사용자별 가드는 우회된다.** `x-al-uid` 가 바뀌면 새 사용자로 취급한다.
 *    그래서 **전역 상한**(`MAX_CONCURRENT`)을 함께 둔다(3라운드 M10) — 쿠키 발급은 공짜라
 *    사용자별 가드만으로는 동시 실행 수가 무제한이었다(실측: 익명 4명 동시 4건 전부 수락).
 *    `claude` 는 호출마다 별도 프로세스이고 서버는 다른 서비스와 공유하는 단일 호스트다.
 */

/**
 * 동시에 돌릴 수 있는 사용자 요청 수(사용자 결정 2026-10-29: 3).
 * 주의사항 백그라운드 큐(`warningsQueue`)는 별도 직렬 1건이라 여기에 세지 않는다 —
 * 실제 최대 프로세스 수는 이 값 + 1 이다.
 */
const MAX_CONCURRENT = 3;

const globalForGuard = globalThis as typeof globalThis & {
  __alAiInFlight?: Set<string>;
};

function inFlightSet(): Set<string> {
  globalForGuard.__alAiInFlight ??= new Set();
  return globalForGuard.__alAiInFlight;
}

/**
 * 실행 슬롯을 잡는다. 잡으면 `null`, 못 잡으면 **그대로 반환할 응답**.
 * 잡았으면 반드시 핸들러의 `finally` 에서 `release` 한다.
 */
export function acquireOrBusy(userId: string): Response | null {
  const inFlight = inFlightSet();
  if (inFlight.has(userId)) {
    return Response.json(
      {
        message: "이미 처리 중인 요청이 있습니다. 완료 후 다시 시도해 주세요.",
      },
      { status: 429 },
    );
  }
  if (inFlight.size >= MAX_CONCURRENT) {
    // 사용자 탓이 아니므로 429 가 아니라 503 — 잠시 뒤 재시도하면 풀린다.
    return Response.json(
      { message: "지금 AI 요청이 많아요. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }
  inFlight.add(userId);
  return null;
}

/** 실행 종료 표시. `acquireOrBusy` 가 `null` 을 반환했을 때만 호출한다(핸들러의 `finally`). */
export function release(userId: string): void {
  inFlightSet().delete(userId);
}
