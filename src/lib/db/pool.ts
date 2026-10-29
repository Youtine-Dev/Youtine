/**
 * MariaDB 커넥션 풀 — **서버 전용**.
 *
 * ⛔ 클라이언트 컴포넌트에서 import 하지 말 것. 접속 정보가 번들에 섞인다.
 *    이 파일은 Route Handler(`src/app/api/**`)에서만 쓴다.
 *
 * 쿼리는 생 SQL 이다(ORM 없음 — 계획서 Q1). 테이블 8개 규모에 코드젠·빌드 단계를 더할 이유가 없다.
 */

import { createPool, type Pool, type PoolConnection } from "mysql2/promise";

import { ENSURE_USER_SQL } from "@/lib/auth/anonUser";
import { serverEnv } from "@/lib/env";

/**
 * dev 의 HMR 은 모듈을 다시 평가한다. 풀을 모듈 스코프에 두면 파일을 고칠 때마다 새 풀이
 * 생겨 커넥션이 쌓이고, 결국 DB 의 연결 상한을 먹는다. 그래서 전역에 붙여 재사용한다.
 */
const globalForPool = globalThis as typeof globalThis & { __alPool?: Pool };

export function getPool(): Pool {
  globalForPool.__alPool ??= createPool({
    ...serverEnv.db,
    waitForConnections: true,
    /**
     * DATETIME 을 Date 객체로 받아 화면에서 ISO 로 바꾼다.
     * DB 컨테이너가 UTC 로 도므로 `Z` 로 해석해야 시각이 어긋나지 않는다 —
     * 이 값을 빼면 로컬 타임존으로 가정해 9시간 밀린다.
     */
    timezone: "Z",
  });

  return globalForPool.__alPool;
}

/**
 * 바인딩 값.
 *
 * mysql2 의 `ExecuteValues` 보다 **일부러 좁게** 잡았다 — 그쪽은 객체·배열까지 허용해서
 * `JSON.stringify` 를 빠뜨린 값이 조용히 통과한다. JSON 컬럼에는 문자열로 넣어야 한다.
 */
export type SqlParam = string | number | boolean | Date | null;

/**
 * SELECT 전용. **행을 `unknown[]` 으로 돌려준다** — 좁히기는 `rows.ts` 가 한다.
 * DB 가 준 값을 도메인 타입으로 단정(`as`)하지 않는 것이 이 계층의 규율이다.
 */
export async function selectRows(
  sql: string,
  params: SqlParam[] = [],
): Promise<unknown[]> {
  const [result] = await getPool().execute(sql, params);
  // execute 의 반환은 SELECT 면 행 배열, 그 외면 헤더다. 배열일 때만 행으로 본다.
  return Array.isArray(result) ? result : [];
}

/** INSERT/UPDATE/DELETE. 영향받은 행 수를 돌려준다(0 이면 대상이 없었다는 뜻). */
export async function execute(
  sql: string,
  params: SqlParam[] = [],
): Promise<number> {
  const [result] = await getPool().execute(sql, params);
  if (Array.isArray(result) || !("affectedRows" in result)) return 0;
  return result.affectedRows;
}

/**
 * 다시 돌리면 풀리는 트랜잭션 충돌 — `ER_CHECKREAD`(1020, 스냅샷 격리: 읽은 행이 그새 바뀜)·
 * `ER_LOCK_DEADLOCK`(1213). 같은 신규 제품을 두 사용자가 동시에 등록하면 난다(3라운드 m19, 31회 중 1회 실측).
 */
function isTransientConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    (error.errno === 1020 || error.errno === 1213)
  );
}

/**
 * 여러 쿼리를 원자적으로 실행한다.
 *
 * 루틴 저장이 "기존 삭제 → 새로 삽입"이라 중간에 실패하면 **루틴이 통째로 사라진다.**
 * 트랜잭션 없이는 이 구간이 데이터 유실 경로가 된다.
 *
 * ⚠️ 충돌(`isTransientConflict`)이면 롤백 후 `fn` 을 **처음부터 한 번 더** 실행한다.
 *    그래서 `fn` 은 DB 밖에 부작용을 남기면 안 된다 — 카운터·결과는 콜백 **안에서** 만들어 반환하고,
 *    큐 등록·외부 호출은 트랜잭션이 끝난 뒤에 한다.
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await conn.beginTransaction();
        const out = await fn(conn);
        await conn.commit();
        return out;
      } catch (error) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          /*
           * 롤백 실패가 원래 오류를 덮으면 로그에서 진짜 원인이 사라진다(3라운드 m10).
           * 롤백 상태를 모르는 커넥션은 풀에 돌려주지 않는다 — 다음 사용자의 BEGIN 이
           * 열린 트랜잭션을 암묵 커밋할 수 있다. destroy 후의 release 는 아무것도 안 한다.
           */
          console.error("[db] rollback 실패:", rollbackError);
          conn.destroy();
          throw error;
        }
        if (attempt === 1 && isTransientConflict(error)) continue;
        throw error;
      }
    }
  } finally {
    // 롤백했든 커밋했든 커넥션은 반드시 풀로 돌려준다.
    conn.release();
  }
}

/**
 * DB 오류를 HTTP 응답으로 바꾼다.
 *
 * ⛔ **오류 메시지를 그대로 내보내지 않는다.** `ECONNREFUSED 127.0.0.1:3308` 처럼
 * 접속 대상이 메시지에 그대로 들어 있어, 공개 서비스에서 내부 구조를 알려 주는 꼴이 된다.
 * 상세는 서버 로그에만 남기고 사용자에게는 일반 문구를 준다.
 */
export function dbErrorResponse(scope: string, error: unknown): Response {
  console.error(`[${scope}]`, error);
  return Response.json(
    { message: "데이터를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 503 },
  );
}

/**
 * `users` 행을 지연 생성한다.
 *
 * proxy 는 요청마다 도는데 거기서 DB 를 건드리면 정적 자산 요청까지 왕복이 붙는다.
 * 그래서 **실제로 쓰기가 일어나는 시점**에 여기서 만든다. FK 가 걸린 테이블에
 * INSERT 하기 전에 반드시 먼저 호출해야 한다.
 */
export async function ensureUser(
  userId: string,
  conn?: PoolConnection,
): Promise<void> {
  if (conn) {
    await conn.execute(ENSURE_USER_SQL, [userId]);
    return;
  }
  await execute(ENSURE_USER_SQL, [userId]);
}
