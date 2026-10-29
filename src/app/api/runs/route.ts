/**
 * 루틴 수행 기록 — `routine_runs`.
 *
 * Q10 의 "이번 주 루틴 달성률"이 이 기록에서만 계산된다. 기록이 곧 점수의 유일한 근거다.
 *
 * ⚠️ `routine_id` 에는 **FK 가 없다**(의도적). 루틴을 다시 만들면 옛 기록이 고아가 되는데,
 *    CASCADE 로 지우면 과거 수행 이력이 사라져 달성률이 소급해서 바뀐다.
 */

import { currentUserId } from "@/lib/auth/anonUser";
import {
  dbErrorResponse,
  ensureUser,
  execute,
  selectRows,
} from "@/lib/db/pool";
import {
  isoDate,
  LIMITS,
  readJsonObject,
  text,
  textArray,
} from "@/lib/db/input";
import { toRoutineRun } from "@/lib/db/rows";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await selectRows(
      `SELECT id, routine_id, started_at, finished_at, completed_step_ids
         FROM routine_runs WHERE user_id = ? ORDER BY finished_at`,
      [await currentUserId()],
    );
    return Response.json(rows.map(toRoutineRun).filter((r) => r !== null));
  } catch (error) {
    return dbErrorResponse("api/runs GET", error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return Response.json(
      { message: "JSON 객체 본문이 아닙니다." },
      { status: 400 },
    );
  }

  // 컬럼이 CHAR(36)(UUID)라 넘치면 DB 에러 → 503. migrate 라우트와 같은 상한으로 400 처리.
  const routineId = text(body.routineId, 36);
  /*
   * `new Date()` 는 "March 5" 나 서기 5만년도 받아 준다. 시각이 터무니없으면
   * 주간 달성률이 조용히 틀어지므로 `isoDate` 가 범위까지 확인한다.
   */
  const startedAt = isoDate(body.startedAt);
  const finishedAt = isoDate(body.finishedAt);

  if (!routineId || !startedAt || !finishedAt) {
    return Response.json(
      { message: "routineId·startedAt·finishedAt 이 필요합니다." },
      { status: 400 },
    );
  }
  if (startedAt > finishedAt) {
    return Response.json(
      { message: "startedAt 이 finishedAt 보다 늦을 수 없습니다." },
      { status: 400 },
    );
  }
  /*
   * 컬럼이 DATETIME(초 정밀도)이라 ms 는 저장되지 않는다. ms 붙은 값으로 기존 행을
   * 찾으면 `started_at = ?` 가 영영 안 맞아 **201 + DB 에 없는 id** 를 돌려줬다(m5).
   * 저장·조회 모두 초 단위로 잘라 같은 값을 쓴다.
   */
  startedAt.setUTCMilliseconds(0);

  const completedStepIds = textArray(body.completedStepIds ?? [], {
    maxItems: LIMITS.completedStepIds,
    maxLength: 64,
  });
  if (!completedStepIds) {
    return Response.json(
      { message: "completedStepIds 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const userId = await currentUserId();
    await ensureUser(userId);

    /*
     * **멱등하게 저장한다**(m1). INSERT 가 커밋된 뒤 응답만 유실되면(모바일 연결 끊김)
     * 클라이언트는 실패로 보고 재시도하는데, 예전에는 요청마다 새 PK 를 만들어
     * 같은 수행이 2행이 됐다 — 주간 달성률이 completedStepIds 합산이라 50% 가 100% 로 보였다.
     *
     * 자연키는 `(user_id, routine_id, started_at)`(006 마이그레이션). finished_at 은
     * 재시도마다 새로 만들어져 키가 못 된다. started_at 은 수행 시작 표시에서 오므로
     * 재시도·새로고침에도 같다.
     */
    const id = crypto.randomUUID();
    const inserted = await execute(
      `INSERT IGNORE INTO routine_runs
         (id, user_id, routine_id, started_at, finished_at, completed_step_ids)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        routineId,
        startedAt,
        finishedAt,
        JSON.stringify(completedStepIds),
      ],
    );

    /*
     * 0행 = 이미 같은 수행이 있다. 이건 **실패가 아니라 재시도가 수렴한 것**이므로
     * 기존 행을 그대로 돌려준다 — 클라이언트가 성공으로 받아 시작 표시를 소비해야
     * 다음 진입 때 또 재시도하지 않는다. 여기서 에러를 내면 영원히 재시도한다.
     */
    if (inserted === 0) {
      const rows = await selectRows(
        `SELECT id, routine_id, started_at, finished_at, completed_step_ids
           FROM routine_runs
          WHERE user_id = ? AND routine_id = ? AND started_at = ?
          LIMIT 1`,
        [userId, routineId, startedAt],
      );
      const existing = rows.map(toRoutineRun).find((run) => run !== null);
      if (existing) return Response.json(existing, { status: 200 });
      // 넣지도 찾지도 못했다 — 없는 id 로 성공을 꾸미지 않는다(클라이언트는 재시도한다).
      throw new Error("멱등 폴백: 기존 수행 행을 찾지 못함");
    }

    return Response.json(
      {
        id,
        routineId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        completedStepIds,
      },
      { status: 201 },
    );
  } catch (error) {
    return dbErrorResponse("api/runs POST", error);
  }
}
