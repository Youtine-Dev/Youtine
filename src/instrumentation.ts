/**
 * 서버 기동 훅 — Next 가 서버 인스턴스마다 `register()` 를 한 번 부른다
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`).
 *
 * 하는 일: DB 에 적용된 마이그레이션이 코드가 기대하는 버전보다 낮으면 **경고만** 남긴다(3라운드 I6).
 * 기존 볼륨에는 새 마이그레이션이 자동 적용되지 않아 손으로 넣는데(docker-compose.yml 주석),
 * 빠뜨려도 코드는 몰랐다 — 예: 006 이 없으면 수행 기록 멱등 유니크 키가 없어 중복이 조용히 쌓인다.
 */

/** 코드가 기대하는 마지막 마이그레이션. `db/migrations/` 에 파일을 추가하면 같이 올린다. */
const EXPECTED_SCHEMA_VERSION = "007";

export function register() {
  /*
   * NEXT_RUNTIME 은 Next 가 런타임별로 상수 치환하는 값이라 env.ts 를 거치지 않는다(문서 패턴 그대로).
   * import 를 이 분기 **안에** 둬야 edge 번들이 mysql2 를 끌어들이지 않는다.
   * 프로덕션 빌드 중에는 Next 가 register 를 아예 부르지 않는다(instrumentation-globals.external.js) — DB 없는 빌드도 안전.
   */
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 기다리지 않는다 — register 가 끝나야 요청을 받는데, DB 가 죽어 있으면 접속 타임아웃만큼 기동이 늦어진다.
    void import("@/lib/db/pool")
      .then(({ selectRows }) =>
        selectRows("SELECT MAX(version) AS version FROM schema_migrations"),
      )
      .then(warnIfSchemaBehind)
      .catch((error: unknown) => {
        // 앱 기동은 막지 않는다. DB 가 아직 안 떴을 수 있다 — 실제 요청에서 다시 드러난다.
        console.warn("[schema] 스키마 버전을 확인하지 못했습니다:", error);
      });
  }
}

function warnIfSchemaBehind(rows: unknown[]): void {
  const row = rows[0];
  const version =
    typeof row === "object" &&
    row !== null &&
    "version" in row &&
    typeof row.version === "string"
      ? row.version
      : null;

  // '001'…'007' 은 0 채운 같은 길이라 문자열 비교로 순서가 맞다.
  if (version !== null && version >= EXPECTED_SCHEMA_VERSION) return;

  console.error(
    `[schema] ⛔ DB 스키마가 ${version ?? "(기록 없음)"} 까지만 적용됐습니다 — 코드는 ${EXPECTED_SCHEMA_VERSION} 을 기대합니다. db/migrations/ 의 빠진 파일을 순서대로 적용하세요.`,
  );
}
