/**
 * 요청 본문 좁히기 + 상한.
 *
 * 왜 상한이 필요한가: 컬럼 길이를 넘기면 MariaDB 가 에러를 내고, 그게 `dbErrorResponse` 를 타서
 * **503("잠시 후 다시 시도")** 으로 나간다. 사용자 입력이 길어서 생긴 일인데 서버 장애처럼 보이고
 * 다시 시도해도 영영 안 된다. 400 으로 먼저 막아야 원인을 알 수 있다.
 *
 * 상한 값은 `db/migrations/001_init.sql` 의 컬럼 정의와 맞춘다.
 */

/** 컬럼 길이(VARCHAR) 와 맞춘 상한. 스키마를 고치면 여기도 고친다. */
export const LIMITS = {
  productName: 255,
  brand: 120,
  category: 60,
  routineName: 100,
  condition: 60,
  summary: 255,
  /**
   * 긴 변 256px JPEG data URL 은 실측 20~50KB 다. MEDIUMTEXT 상한(16MB)까지 열어 두면
   * 원본 사진을 그대로 올리는 요청 하나로 DB 와 목록 응답이 통째로 무거워진다.
   */
  thumbnail: 1_000_000,
  /** 초 단위. 한 단계가 2시간을 넘을 이유가 없다. */
  estimatedTime: 7_200,
  routines: 20,
  steps: 50,
  stepTextItems: 30,
  stepTextLength: 500,
  completedStepIds: 500,
  /** `wonder` 는 TEXT 라 컬럼 상한은 크지만, 사용자가 적는 피부 고민 한 문단이면 충분하다. */
  wonder: 2_000,
  /** `usable_morning`·`usable_evening` VARCHAR(30) */
  usableTime: 30,
} as const;

/** 문자열 + 길이 상한. 조건에 안 맞으면 `null` — 조용히 자르지 않는다(사용자가 모른다). */
export function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed;
}

/** 선택 입력. 없으면 `undefined`, 있는데 너무 길면 `null`(= 거부). */
export function optionalText(
  value: unknown,
  max: number,
): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, max);
}

/**
 * 문자열 배열 + 개수·길이 상한.
 * **빈 배열은 정상이다** — 프롬프트 규칙이 "확신 없으면 []" 를 요구한다.
 */
export function textArray(
  value: unknown,
  options: { maxItems: number; maxLength: number },
): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > options.maxItems) return null;

  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    // 공백뿐인 항목은 버린다 — `[" "]` 가 "성분을 가져왔다"로 통과해 공유 카탈로그의
    // 사진 성분을 덮던 경로가 있었다(3라운드 M2).
    if (!trimmed) continue;
    if (trimmed.length > options.maxLength) return null;
    items.push(trimmed);
  }
  return items;
}

/** 정수 + 범위. 범위를 벗어나면 `null`. */
export function intInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.trunc(value);
  return int < min || int > max ? null : int;
}

/**
 * ISO 문자열 → Date.
 *
 * `new Date()` 는 `"March 5"` 같은 것도 받아 주고 1970년·서기 5만년도 통과시킨다.
 * 수행 기록의 시각이 터무니없으면 주간 달성률 계산이 조용히 망가지므로 범위를 좁힌다.
 */
export function isoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  // 앞으로 하루까지만 — 기기 시계가 조금 빠른 경우는 받아 준다.
  if (year < 2020 || date.getTime() > Date.now() + 86_400_000) return null;

  return date;
}

/**
 * 요청 본문을 **JSON 객체**로 읽는다. JSON 이 아니거나 객체가 아니면(`null`·배열·원시값) `null`.
 *
 * `(await request.json()) as Body` 는 `null` 을 통과시켜 다음 줄의 `body.x` 에서 TypeError →
 * 400 이어야 할 요청이 500(트랜잭션 안이면 503 "DB 장애" 문구)이 됐다(3라운드 m1, 라우트 12곳).
 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
