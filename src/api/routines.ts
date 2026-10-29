/**
 * 생성된 루틴. 서버 `/api/routines` 를 부른다.
 *
 * 저장은 **`condition` 단위 교체**다 — 한 번 생성할 때 아침·저녁이 한 세트로 나오므로
 * 요청에 담긴 조건의 세트만 갈아 끼운다(반쪽만 남는 경우가 없고, 기본 루틴과
 * 고민 집중 루틴이 서로를 지우지 않는다). 전체 삭제는 `deleteRoutines`(DELETE)가 담당한다.
 */

import type { Routine } from "@/types/skincare";

import { api } from "./client";

export const fetchRoutines = () => api.get<Routine[]>("/routines");

/**
 * 서버가 id·createdAt 을 만들므로 보낼 때는 없어도 된다.
 * `id` 를 보내면 서버는 그것이 **이 사용자의 같은 condition 루틴**일 때 유지한다 —
 * 단계 편집이 루틴 id 를 바꾸면 수행 기록(오늘 완료·달성률)이 끊긴다(m7·I9).
 */
export type RoutineInput = Omit<Routine, "id" | "createdAt"> & {
  id?: string;
  steps: Omit<Routine["steps"][number], "id">[];
};

export const saveRoutines = (input: { routines: RoutineInput[] }) =>
  api.put<{ ok: boolean; count: number }>("/routines", input);

/** condition 을 주면 그 세트만, 없으면 전부 지운다. */
export const deleteRoutines = (input?: { condition?: string }) =>
  api.delete<{ ok: boolean; deleted: number }>(
    input?.condition
      ? `/routines?condition=${encodeURIComponent(input.condition)}`
      : "/routines",
  );
