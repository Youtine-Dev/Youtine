/**
 * 피부 프로필 — `skin_profiles`. 루틴 생성의 입력이다.
 *
 * 여러 루틴이 같은 입력에서 나오므로 루틴마다 중복 저장하지 않고 따로 둔다.
 * 재생성 화면의 프리필과 프로필 화면의 "피부 프로필" 표시가 이걸 함께 쓴다.
 */

import { currentUserId } from "@/lib/auth/anonUser";
import {
  dbErrorResponse,
  ensureUser,
  execute,
  selectRows,
} from "@/lib/db/pool";
import { LIMITS, readJsonObject, text } from "@/lib/db/input";
import { toSkinProfile } from "@/lib/db/rows";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await selectRows(
      `SELECT wonder, usable_morning, usable_evening, updated_at
         FROM skin_profiles WHERE user_id = ?`,
      [await currentUserId()],
    );

    // 아직 한 번도 루틴을 만들지 않은 상태다. 404 가 아니라 null 이 정상 응답이다.
    return Response.json(rows.length > 0 ? toSkinProfile(rows[0]) : null);
  } catch (error) {
    return dbErrorResponse("api/profile GET", error);
  }
}

export async function PUT(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return Response.json(
      { message: "JSON 객체 본문이 아닙니다." },
      { status: 400 },
    );
  }

  const wonder = text(body.wonder, LIMITS.wonder);
  if (!wonder) {
    return Response.json(
      { message: `wonder 는 필수이고 ${LIMITS.wonder}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  const usableTime: Record<string, unknown> =
    typeof body.usableTime === "object" && body.usableTime !== null
      ? { ...body.usableTime }
      : {};
  /*
   * 둘 다 **필수**다(`/api/ai/routine` 과 같은 계약). 이 PUT 은 행 전체를 덮으므로
   * 빠진 값을 "" 로 채우면 기존 가용 시간이 조용히 지워진다(3라운드 반박 부기 — 계약 위생).
   * 길이 상한은 컬럼 VARCHAR(30) — 넘치면 DB 에러가 503 으로 나가니 여기서 400 으로 막는다.
   */
  const morning = text(usableTime.morning, LIMITS.usableTime);
  const evening = text(usableTime.evening, LIMITS.usableTime);
  if (morning === null || evening === null) {
    return Response.json(
      {
        message: `usableTime 의 morning·evening 은 필수이고 ${LIMITS.usableTime}자 이하의 문자열이어야 합니다.`,
      },
      { status: 400 },
    );
  }

  try {
    const userId = await currentUserId();
    await ensureUser(userId);

    /*
     * PK 가 user_id 라 사용자당 1행이다. 두 번째부터는 갱신된다.
     *
     * `concern_ingredients` 는 **wonder 가 바뀔 때만** 비운다 — 루틴 생성이 같은
     * 고민으로 가용 시간만 저장해도 성분 추천 캐시가 날아가면 30초를 다시 산다.
     * ⚠️ 할당 순서가 중요하다: wonder 를 덮기 **전에** 옛 wonder 와 비교해야 한다
     *    (MariaDB 는 SET 절을 왼쪽부터 순서대로 평가한다).
     * ⚠️ `VALUES()` 를 함수 인자로 넣지 않는다 — `JSON_LENGTH(VALUES(...))` 가
     *    MariaDB 에서 오작동한 실측(2026-08-19)이 있어 placeholder 로 비교한다.
     */
    await execute(
      `INSERT INTO skin_profiles (user_id, wonder, usable_morning, usable_evening)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         concern_ingredients = IF(wonder = ?, concern_ingredients, NULL),
         wonder         = VALUES(wonder),
         usable_morning = VALUES(usable_morning),
         usable_evening = VALUES(usable_evening)`,
      [userId, wonder, morning, evening, wonder],
    );

    return Response.json({ ok: true });
  } catch (error) {
    return dbErrorResponse("api/profile PUT", error);
  }
}
