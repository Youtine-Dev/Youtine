/**
 * 주의사항 백그라운드 생성 큐 — **서버 전용**.
 *
 * 예전에는 홈 화면(useIngredientAlerts)이 주의사항 없는 제품을 발견하면 클라이언트가
 * 순차로 AI 를 호출했다. 그 호출들이 **사용자당 동시 1건 가드를 30초×제품 수만큼
 * 독점**해서, 그동안 "내 고민"·루틴 생성이 전부 429 로 튕겼다(사용자 보고 2026-08-20).
 * 탭을 옮기면 고아가 된 진행 중 호출이 가드를 쥔 채 남아 다음 루프까지 429 를 받았다.
 *
 * 이제 생성은 **제품 등록 시점에 서버가 응답을 보낸 뒤** 여기서 한다:
 *  - 사용자 가드(acquire/release)를 쓰지 않는다 — 사용자가 시작한 대화형 호출이
 *    아니라서 사용자의 다른 AI 기능을 막을 이유가 없다.
 *  - 대신 **전역 직렬 큐**로 스스로를 제한한다 — claude 프로세스가 겹쳐 뜨지 않는다.
 *  - 홈 화면은 저장된 값만 읽는다(AI 호출 0건).
 *  - **제품당 실패 상한**(3라운드 m4) — 계속 실패하는 제품이 `GET /api/products` 마다
 *    재큐잉돼 구독 한도와 직렬 큐를 갉아먹었다. 상한을 넘으면 한동안 쉰다.
 *
 * HMR 이 모듈을 재평가해도 체인이 끊기지 않도록 globalThis 에 둔다(guard.ts 와 같은 이유).
 */

import { isStringArray, parseJsonObject } from "@/lib/claude/parseJson";
import { runClaude } from "@/lib/claude/runner";
import { execute, selectRows } from "@/lib/db/pool";
import { textArray } from "@/lib/db/input";
import { buildWarningsPrompt } from "@/lib/prompts/warnings";

const TIMEOUT_MS = 120_000;

/** 연속 실패가 이만큼이면 `RETRY_COOLDOWN_MS` 동안 큐에 넣지 않는다. */
const MAX_FAILURES = 3;
/**
 * 상한에 걸린 제품도 이만큼 쉬면 1회씩 다시 시도한다. 영구 중단이면 인증 만료처럼
 * 전 제품이 함께 실패한 뒤 재로그인해도 **재시작 전까지** 주의사항이 안 생긴다.
 */
const RETRY_COOLDOWN_MS = 60 * 60 * 1000;

const globalForQueue = globalThis as typeof globalThis & {
  /** 전역 직렬 체인 — 작업이 하나씩만 돈다. */
  __alWarningsChain?: Promise<void>;
  /** 대기·실행 중인 product id. 같은 제품을 연달아 담아도 한 번만 생성한다. */
  __alWarningsQueued?: Set<string>;
  /** 제품별 연속 실패 기록. 성공하면 지운다. */
  __alWarningsFailures?: Map<string, { count: number; lastAt: number }>;
};

type Job = {
  id: string;
  name: string;
  category: string;
  ingredients: string[];
};

async function generate(job: Job): Promise<void> {
  // 큐에서 기다리는 사이 다른 경로(다른 사용자의 등록 등)로 채워졌으면 건너뛴다.
  const rows = await selectRows(
    `SELECT 1 FROM products WHERE id = ? AND warnings IS NULL`,
    [job.id],
  );
  if (rows.length === 0) return;

  const raw = await runClaude(
    buildWarningsPrompt({
      productName: job.name,
      category: job.category,
      ingredients: job.ingredients,
    }),
    { timeoutMs: TIMEOUT_MS },
  );

  // 아래 두 실패도 던진다 — NULL 로 남아 재큐잉되므로 실패 상한에 함께 세야 한다.
  const parsed = parseJsonObject(raw) as Record<string, unknown>;
  if (!isStringArray(parsed.warning)) {
    throw new Error(`warning 배열 없음: ${raw.slice(0, 300)}`);
  }

  // PATCH 와 같은 상한(개수 20·길이 500). 넘치면 저장하지 않는다.
  const warnings = textArray(parsed.warning, { maxItems: 20, maxLength: 500 });
  if (warnings === null) throw new Error("상한 초과 — 저장 생략");

  /*
   * **첫 기록(NULL)일 때만** 쓴다 — 데이터 손실 가드(PATCH 와 같은 규칙).
   * 빈 배열도 저장한다: "확인했고 주의 없음"이라는 답이라 재생성이 반복되지 않는다.
   */
  await execute(
    `UPDATE products SET warnings = ? WHERE id = ? AND warnings IS NULL`,
    [JSON.stringify(warnings), job.id],
  );
}

/**
 * 생성을 큐에 넣는다. **응답을 기다리지 않는다** — 등록 UX 를 34초 막지 않기 위한
 * 지연 생성이라는 원래 결정(useIngredientAlerts 주석)은 그대로고, 실행 주체만
 * 클라이언트 → 서버로 옮겼다.
 */
export function enqueueWarningsGeneration(job: Job): void {
  if (job.ingredients.length === 0) return; // 규칙 6 — 라우트가 고정 문구를 동기 저장한다

  globalForQueue.__alWarningsQueued ??= new Set();
  globalForQueue.__alWarningsFailures ??= new Map();
  const queued = globalForQueue.__alWarningsQueued;
  const failures = globalForQueue.__alWarningsFailures;
  if (queued.has(job.id)) return;

  const failed = failures.get(job.id);
  if (
    failed &&
    failed.count >= MAX_FAILURES &&
    Date.now() - failed.lastAt < RETRY_COOLDOWN_MS
  ) {
    return; // 상한 도달 로그는 마지막 실패 때 이미 남겼다.
  }
  queued.add(job.id);

  globalForQueue.__alWarningsChain = (
    globalForQueue.__alWarningsChain ?? Promise.resolve()
  )
    .then(async () => {
      await generate(job);
      failures.delete(job.id);
    })
    .catch((error: unknown) => {
      // 실패해도 체인은 계속 돈다. warnings 는 NULL 로 남아 다음 조회 때 재시도된다.
      const count = (failures.get(job.id)?.count ?? 0) + 1;
      failures.set(job.id, { count, lastAt: Date.now() });
      console.warn(
        `[warningsQueue] "${job.name}" 생성 실패(${count}회 연속)${
          count >= MAX_FAILURES ? " — 상한 도달, 1시간 뒤 다시 시도" : ""
        }:`,
        error,
      );
    })
    .finally(() => {
      queued.delete(job.id);
    });
}
