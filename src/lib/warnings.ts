/**
 * 주의사항(`warnings`) 공용 상수 — **클라이언트·서버 공용**(서버 전용 import 없음).
 *
 * 예전엔 `lib/ai/warningsQueue.ts`(자식 프로세스를 띄우는 서버 전용 모듈)에 있어서
 * 화면이 이 문구를 구분할 수 없었다 → 성분 0개 제품이 '주의 성분 포함'·'자극 우려 성분'
 * 으로 표시됐다(3라운드 m27).
 */

/**
 * 프롬프트 규칙 6 — 성분 정보가 부족하면 AI 도 이 문구 하나만 반환하도록 못박혀 있다.
 * 결과가 정해져 있으므로 성분 없는 제품은 호출 없이 이 문구를 바로 저장한다.
 */
export const NO_INGREDIENTS_WARNING =
  "성분 정보가 부족하여 구체적인 주의사항을 제공하기 어렵습니다";

/** 실제 주의사항만 — "성분 정보 부족" 안내는 경고가 아니다(위험하다는 뜻이 아니다). */
export function realWarnings(warnings: readonly string[]): string[] {
  return warnings.filter((warning) => warning !== NO_INGREDIENTS_WARNING);
}
