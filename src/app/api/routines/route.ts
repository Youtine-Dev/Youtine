/**
 * 생성된 루틴 — `routines` × `routine_steps`.
 *
 * 저장은 **`condition` 단위 교체**다. 루틴은 한 번 생성할 때 아침·저녁이 한 세트로 나오므로
 * 세트 교체가 상태를 단순하게 유지하고(반쪽만 남는 경우가 없다), 조건으로 범위를 좁혀서
 * 기본 루틴과 고민 집중 루틴이 서로를 지우지 않는다.
 */

import { currentUserId } from "@/lib/auth/anonUser";
import {
  dbErrorResponse,
  ensureUser,
  execute,
  selectRows,
  withTransaction,
} from "@/lib/db/pool";
import {
  intInRange,
  LIMITS,
  optionalText,
  readJsonObject,
  text,
  textArray,
} from "@/lib/db/input";
import { groupSteps, toRoutine } from "@/lib/db/rows";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await currentUserId();

    const routineRows = await selectRows(
      /*
       * 한 번의 PUT 으로 아침·저녁이 같은 초에 저장되므로 created_at 만으로는 순서가
       * 랜덤 UUID 순이 된다(m6). time_slot 은 ENUM('am','pm') 이라 정의 순 = 아침 먼저.
       */
      `SELECT id, name, \`condition\`, time_slot, summary, created_at
         FROM routines WHERE user_id = ? ORDER BY created_at, time_slot, id`,
      [userId],
    );
    if (routineRows.length === 0) return Response.json([]);

    const ids = routineRows
      .map((row) =>
        typeof row === "object" && row !== null && "id" in row
          ? String(row.id)
          : "",
      )
      .filter(Boolean);

    // 루틴마다 쿼리를 날리면 N+1 이 된다. IN 으로 한 번에 가져와 묶는다.
    const stepRows = await selectRows(
      `SELECT routine_id, id, routine_name, estimated_time,
              using_product, how_to_use, tips, warning
         FROM routine_steps
        WHERE routine_id IN (${ids.map(() => "?").join(",")})
        ORDER BY seq`,
      ids,
    );
    const stepsByRoutine = groupSteps(stepRows);

    const routines = routineRows
      .map((row) => {
        const id =
          typeof row === "object" && row !== null && "id" in row
            ? String(row.id)
            : "";
        return toRoutine(row, stepsByRoutine.get(id) ?? []);
      })
      .filter((r) => r !== null);

    return Response.json(routines);
  } catch (error) {
    return dbErrorResponse("api/routines GET", error);
  }
}

/** 저장 대상으로 인정할 최소 모양. 클라이언트가 보내는 값이라도 서버에서 다시 좁힌다. */
type StepInput = {
  routineName: string;
  estimatedTime: number;
  usingProduct: string[];
  howToUse: string[];
  tips: string[];
  warning: string[];
};
type RoutineInput = {
  /** 유지하고 싶은 기존 id. 서버가 소유를 확인한 뒤에만 쓴다(PUT 참조). */
  id: string | undefined;
  name: string;
  condition: string;
  time: "am" | "pm";
  summary: string;
  steps: StepInput[];
};

/**
 * 단계 안의 문자열 배열(사용법·팁·주의). 상한을 넘으면 `null`(= 거부).
 * ⚠️ 빈 배열로 뭉개면 안 된다 — 사용법·주의가 조용히 사라진 채 저장된다.
 */
function stepTexts(value: unknown): string[] | null {
  return textArray(value ?? [], {
    maxItems: LIMITS.stepTextItems,
    maxLength: LIMITS.stepTextLength,
  });
}

function narrowStep(value: unknown): StepInput | null {
  if (typeof value !== "object" || value === null) return null;
  const step: Record<string, unknown> = { ...value };

  const routineName = text(step.routineName, LIMITS.routineName);
  if (!routineName) return null;

  /*
   * 초 단위 정수다. 분으로 착각해 넣으면 타이머가 60배 틀어진다.
   * 상한이 필요한 이유: 값 하나가 INT 범위를 넘으면 그 INSERT 가 죽고
   * **트랜잭션 전체가 롤백돼 루틴이 한 벌도 저장되지 않는다.**
   * 범위 밖·숫자 아님은 0 으로 바꾸지 않고 거부한다(m17) — 없을 때만 0 이다.
   */
  const estimatedTime =
    step.estimatedTime === undefined
      ? 0
      : intInRange(step.estimatedTime, 0, LIMITS.estimatedTime);
  if (estimatedTime === null) return null;

  const usingProduct = stepTexts(step.usingProduct);
  const howToUse = stepTexts(step.howToUse);
  const tips = stepTexts(step.tips);
  const warning = stepTexts(step.warning);
  if (!usingProduct || !howToUse || !tips || !warning) return null;

  return {
    routineName,
    estimatedTime,
    usingProduct,
    howToUse,
    tips,
    warning,
  };
}

/**
 * 루틴 하나를 좁힌다. 실패하면 **어디가 문제인지 담은 한글 메시지**를 돌려준다 —
 * 걸러진 루틴을 조용히 버리면, 저장이 조건 단위 교체라 2벌 중 1벌만 남는 사고가 난다.
 * `index` 는 사용자 안내용 0-기반 위치다.
 */
function narrowRoutine(value: unknown, index: number): RoutineInput | string {
  const nth = `${index + 1}번째 루틴`;
  if (typeof value !== "object" || value === null)
    return `${nth}이 객체가 아닙니다.`;
  const routine: Record<string, unknown> = { ...value };

  const name = text(routine.name, LIMITS.routineName);
  if (!name)
    return `${nth}의 name 은 필수이고 ${LIMITS.routineName}자 이하여야 합니다.`;

  /*
   * 단계 수 상한. 없으면 steps 를 수만 개 보내 트랜잭션이 사용자 행을 잡은 채
   * 수십 초를 왕복하고, `seq` 가 SMALLINT 라 32,767 을 넘는 순간 전체가 롤백된다.
   * 0단계(배열 아님 포함)도 거부한다 — 수행할 게 없는 빈 카드가 저장됐다(m17).
   */
  const rawSteps = Array.isArray(routine.steps) ? routine.steps : [];
  if (rawSteps.length === 0 || rawSteps.length > LIMITS.steps)
    return `${nth}의 단계는 1~${LIMITS.steps}개여야 합니다.`;

  // 모르는 값을 "am" 으로 바꿔 저장하면 저녁 루틴이 아침에 뜬다(m17).
  const time = routine.time;
  if (time !== "am" && time !== "pm")
    return `${nth}의 time 은 "am" 또는 "pm" 이어야 합니다.`;

  // UUID 는 36자. 넘치는 값은 어차피 존재할 수 없는 id 다.
  const id = optionalText(routine.id, 36);
  if (id === null) return `${nth}의 id 형식이 올바르지 않습니다.`;

  /*
   * ⚠️ 길이를 넘긴 `condition` 을 "평소"로 떨어뜨리면 안 된다.
   *    저장이 조건 단위 교체라, 그 순간 **사용자의 기본 루틴이 지워진다.**
   *    없는 것(undefined)만 기본값을 쓰고, 잘못된 값은 그 루틴을 통째로 거부한다.
   */
  const condition = optionalText(routine.condition, LIMITS.condition);
  if (condition === null)
    return `${nth}의 condition 은 ${LIMITS.condition}자 이하여야 합니다.`;

  /*
   * ⚠️ 불량 단계를 filter 로 조용히 떨어뜨리면 안 된다 — 루틴 레벨과 같은 원칙이다.
   *    단계가 빠진 채 저장되면 화면은 성공을 띄우고 사용자는 단계가 사라진 걸 나중에 안다.
   */
  const steps: StepInput[] = [];
  for (const [stepIndex, raw] of rawSteps.entries()) {
    const step = narrowStep(raw);
    if (step === null)
      return `${nth}의 ${stepIndex + 1}번째 단계 형식이 올바르지 않습니다.`;
    steps.push(step);
  }

  return {
    id,
    name,
    condition: condition ?? "평소",
    time,
    summary: text(routine.summary, LIMITS.summary) ?? "",
    steps,
  };
}

export async function PUT(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return Response.json(
      { message: "JSON 객체 본문이 아닙니다." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.routines)) {
    return Response.json(
      { message: "routines 배열이 필요합니다." },
      { status: 400 },
    );
  }
  if (body.routines.length > LIMITS.routines) {
    return Response.json(
      {
        message: `루틴은 한 번에 ${LIMITS.routines}벌까지 저장할 수 있습니다.`,
      },
      { status: 400 },
    );
  }
  // 하나라도 좁히기에 실패하면 부분 저장 대신 요청 전체를 거부한다(사유는 narrowRoutine 참조).
  const routines: RoutineInput[] = [];
  for (const [index, raw] of body.routines.entries()) {
    const result = narrowRoutine(raw, index);
    if (typeof result === "string") {
      return Response.json({ message: result }, { status: 400 });
    }
    routines.push(result);
  }

  try {
    const userId = await currentUserId();

    /*
     * ⭐ **`condition` 단위로 교체한다.** 예전에는 사용자의 루틴을 전부 지우고 다시 넣었는데,
     *    그러면 "고민 집중 케어"를 만든 뒤 기본 루틴을 다시 만들면 고민 루틴이 사라진다.
     *    이번 요청에 담긴 조건만 갈아 끼우면 나머지 조건은 그대로 남는다.
     *
     *    전부 지우려면 `DELETE /api/routines` 를 쓴다 — 그쪽이 그 일을 하는 자리다.
     *
     * 삭제와 삽입 사이에서 실패하면 그 조건의 루틴이 사라진다. 반드시 한 트랜잭션 안에서 한다.
     * (routine_steps 는 FK CASCADE 라 따로 지우지 않아도 함께 사라진다.)
     */
    const conditions = [...new Set(routines.map((r) => r.condition))];

    await withTransaction(async (conn) => {
      await ensureUser(userId, conn);

      /*
       * 교체되는 루틴의 id 는 **유지한다**(m7·I9). 수행 기록은 routine_id 로 이어지는데,
       * 단계 편집이 id 를 재발급하면 편집 안 한 짝 루틴까지 오늘 완료·이번 주 달성률·
       * 기록 이름이 끊겼다. 요청 id 는 **이 사용자의 같은 condition 루틴**일 때만 믿는다 —
       * 아니면(생성 직후의 임시 id·남의 id) 새로 만든다.
       * 유지하는 루틴은 created_at 도 그대로 둔다 — 달성률 분모가 생성일부터라(4라운드 Q3)
       * 편집할 때마다 리셋되면 그 주 예정이 줄어 달성률이 부풀었다.
       */
      const owned = new Map<string, Map<string, Date | null>>();
      for (const condition of conditions) {
        const [found] = await conn.execute(
          `SELECT id, created_at FROM routines WHERE user_id = ? AND \`condition\` = ?`,
          [userId, condition],
        );
        const rows: unknown[] = Array.isArray(found) ? found : [];
        const kept = new Map<string, Date | null>();
        for (const row of rows) {
          if (typeof row !== "object" || row === null || !("id" in row))
            continue;
          const createdAt = "created_at" in row ? row.created_at : null;
          kept.set(
            String(row.id),
            createdAt instanceof Date ? createdAt : null,
          );
        }
        owned.set(condition, kept);

        await conn.execute(
          `DELETE FROM routines WHERE user_id = ? AND \`condition\` = ?`,
          [userId, condition],
        );
      }

      for (const routine of routines) {
        /*
         * 새 id 는 **여기서** 만든다. DB 의 UUID() 에 맡기면 방금 넣은 행을 다시 찾아야 하는데,
         * 같은 이름·시간대 루틴이 여러 벌이면 엉뚱한 행을 집을 수 있다.
         * `Map.delete` 는 한 번만 true 다 — 같은 id 를 두 번 보내도 PK 가 겹치지 않는다.
         */
        const kept = owned.get(routine.condition);
        const createdAt = routine.id ? (kept?.get(routine.id) ?? null) : null;
        const routineId =
          routine.id && kept?.delete(routine.id)
            ? routine.id
            : crypto.randomUUID();

        await conn.execute(
          `INSERT INTO routines (id, user_id, name, \`condition\`, time_slot, summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
          [
            routineId,
            userId,
            routine.name,
            routine.condition,
            routine.time,
            routine.summary,
            createdAt,
          ],
        );

        for (const [index, step] of routine.steps.entries()) {
          await conn.execute(
            `INSERT INTO routine_steps
               (id, routine_id, seq, routine_name, estimated_time,
                using_product, how_to_use, tips, warning)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              routineId,
              index,
              step.routineName,
              step.estimatedTime,
              JSON.stringify(step.usingProduct),
              JSON.stringify(step.howToUse),
              JSON.stringify(step.tips),
              JSON.stringify(step.warning),
            ],
          );
        }
      }
    });

    return Response.json({ ok: true, count: routines.length });
  } catch (error) {
    return dbErrorResponse("api/routines PUT", error);
  }
}

/** `?condition=` 을 주면 그 세트만 지운다(루틴 삭제 — 사용자 피드백 2026-08-20). 없으면 전부. */
export async function DELETE(request: Request) {
  const condition = new URL(request.url).searchParams.get("condition");
  // 컬럼이 VARCHAR(60)이라 넘치는 값은 어차피 존재할 수 없는 조건이다 — 400 으로 먼저 막는다.
  if (condition !== null && (condition.length === 0 || condition.length > 60)) {
    return Response.json(
      { message: "condition 이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const changed = condition
      ? await execute(
          `DELETE FROM routines WHERE user_id = ? AND \`condition\` = ?`,
          [await currentUserId(), condition],
        )
      : await execute(`DELETE FROM routines WHERE user_id = ?`, [
          await currentUserId(),
        ]);
    return Response.json({ ok: true, deleted: changed });
  } catch (error) {
    return dbErrorResponse("api/routines DELETE", error);
  }
}
