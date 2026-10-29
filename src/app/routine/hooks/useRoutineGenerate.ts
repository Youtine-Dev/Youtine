"use client";

import { useCallback, useEffect, useState } from "react";

import { generateRoutine, type RoutineStepResponse } from "@/api/ai";
import { ApiError } from "@/api/client";
import { saveProfile, saveRoutines, useProducts } from "@/lib/data";
import type { Routine, RoutineStep, RoutineTime } from "@/types/skincare";

import type { RoutineCondition } from "../condition";
import { TIME_LABEL, totalMinutes } from "../routineTime";

export type GenerateStatus = "idle" | "working" | "done" | "error";

export type GenerateInput = {
  /** 피부 고민 (프롬프트 `wonder`) */
  wonder: string;
  usableTime: { morning: string; evening: string };
  /** 기본 루틴인지 기타 루틴인지. **저장 시 교체 범위를 정한다.** */
  condition: RoutineCondition;
};

/**
 * 결과 화면용 임시 id. 서버는 이미 가진 루틴의 id 만 유지하므로(`PUT /api/routines`)
 * 이 값은 저장 시점에 무시되고 진짜 id 가 새로 만들어진다.
 *
 * ⚠️ `crypto.randomUUID` 는 **보안 컨텍스트(HTTPS·localhost)에서만** 존재한다.
 *    TLS 없이 배포하면 없으므로 폴백이 필요하다 — 여기서 던지면 90초 걸린 생성 결과가
 *    화면에 그려지지 않는다.
 */
function tempId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 응답 단계(snake_case) → 프론트 모델(camelCase).
 *
 * `id` 는 LLM 출력에 없다. 서버가 저장 시점에 진짜 id 를 새로 만들지만(서버는 이 값을
 * 무시한다), 저장 응답이 없어 생성 직후 결과 화면(`saved`)은 이 값으로 그린다 —
 * `Routine`/`RoutineStep` 타입이 `id` 를 필수로 두고 React key 로도 쓰이기 때문이다.
 * 배열 인덱스를 쓰지 않는 이유는 나중에 루틴을 재생성하면 같은 인덱스가 다른 단계를
 * 뜻하게 되기 때문이다.
 */
function toStep(raw: RoutineStepResponse): RoutineStep {
  return {
    id: tempId(),
    routineName: raw.routine_name,
    estimatedTime: raw.estimated_time,
    usingProduct: raw.using_product,
    howToUse: raw.how_to_use,
    tips: raw.tips,
    warning: raw.warning,
  };
}

/**
 * 카드 한 줄 설명 — 단계 수·소요 시간에서 **파생**한다(지어낸 문구가 아니다).
 * 단계 편집 저장(`RoutineCard`)도 같은 규칙으로 다시 만든다 — 안 그러면 헤더와 어긋난다(m7).
 */
export function routineSummary(steps: readonly RoutineStep[]): string {
  const minutes = totalMinutes(steps);
  return minutes === null
    ? `${steps.length}단계`
    : `${steps.length}단계 · 약 ${minutes}분`;
}

/**
 * 프롬프트는 `{ morning, evening }` **1벌**을 주는데 저장 모델은 time 당 `Routine` 1개다.
 * 그래서 한 번의 응답을 `Routine` 2개로 펼친다.
 *
 * `name`·`summary`·`condition` 은 생성 시점에 만든다:
 *  - `name`   : **고민 요약(concern_summary) + 시간대** — "블랙헤드 - 저녁 루틴"
 *    (사용자 요청 2026-08-20). 요약이 없으면(LLM 계약 위반 → 라우트가 null 강등)
 *    시간대만 쓴다 — 요약 때문에 이름이 죽으면 안 된다.
 *  - `summary`: 단계 수·소요 시간에서 **파생**한다. 지어낸 문구가 아니라 실제 값이다.
 *  - `condition`: 호출자가 정한다(기본 / 기타). 프롬프트 입력은 `wonder` 하나뿐이라
 *    **결과가 갈리는 것도 `wonder` 때문이다.** 조건은 그 결과를 저장·표시할 칸을 정할 뿐,
 *    AI 에게 다른 지시를 넣지 않는다.
 */
function toRoutine(
  raws: RoutineStepResponse[],
  time: RoutineTime,
  condition: RoutineCondition,
  concernSummary: string | null,
): Routine {
  const steps = raws.map(toStep);
  /*
   * 이름의 성격 접미는 두지 않는다 — "아침 기타 루틴"은 어색하고, 구명칭
   * "집중 케어"는 개명(기타 루틴)과 어긋난다(재검토 N7). 기본/기타 구분은
   * 카드 칩(conditionLabel)과 섹션 헤딩이 이미 하고 있다.
   */
  const base = `${TIME_LABEL[time]} 루틴`;

  return {
    id: tempId(),
    name: concernSummary ? `${concernSummary} - ${base}` : base,
    condition,
    time,
    summary: routineSummary(steps),
    steps,
    // createdAt 은 optional 이다. 서버가 저장 시점에 진짜 값을 만들므로 여기서 지어내지 않는다.
  };
}

/**
 * AI 가드 응답(`src/lib/ai/guard.ts`)은 어느 작업이 막혔는지 모른다 — 생성 단계에서만 바꿔 말한다.
 * 저장 단계의 503 은 DB 장애라 이 문구를 쓰면 안 된다.
 */
const BUSY_TEXT: Partial<Record<number, string>> = {
  429: "이전에 시작한 AI 작업(루틴 생성 등)이 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요.",
  503: "지금 AI 요청이 많아요. 잠시 후 다시 시도해 주세요.",
};

/**
 * 루틴 생성 — AI 호출 → 서버 저장 한 흐름.
 *
 * ⚠️ 실측 약 90초 걸린다. 화면은 반드시 진행 표시를 해야 한다.
 */
export function useRoutineGenerate() {
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Routine[]>([]);
  /*
   * 선반은 서버에서 온다. 예전에는 `listProducts()` 를 콜백 안에서 동기로 읽었지만
   * 네트워크가 끼면서 **아직 안 온 상태와 진짜 빈 선반을 구분**해야 한다 —
   * 안 하면 로딩 중에 누른 사용자에게 "제품이 없어요"라고 잘못 안내한다.
   */
  const products = useProducts();

  /*
   * 생성 중 새로고침·탭 닫기 경고(m23) — 떠나면 서버가 claude 를 죽이므로(m3) 기다린 만큼이
   * 버려진다. 앱 안 이동은 전면 오버레이(RoutineForm)가 이미 막는다.
   */
  useEffect(() => {
    if (status !== "working") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const generate = useCallback(
    async (input: GenerateInput) => {
      const wonder = input.wonder.trim();
      if (!wonder) {
        setStatus("error");
        setError("피부 고민을 입력해 주세요.");
        return;
      }

      if (!products.ready) {
        setStatus("error");
        setError("제품 목록을 불러오는 중이에요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (products.error) {
        setStatus("error");
        setError("제품 목록을 불러오지 못했어요. 연결을 확인해 주세요.");
        return;
      }

      // 제품이 없으면 서버도 400 을 준다. 왕복하기 전에 여기서 막고 다음 행동을 안내한다.
      const items = products.value;
      if (items.length === 0) {
        setStatus("error");
        setError("등록된 제품이 없어요. 먼저 내 선반에 제품을 담아 주세요.");
        return;
      }

      setStatus("working");
      setError(null);
      setSaved([]);

      let saving = false;
      try {
        const raw = await generateRoutine({
          wonder,
          usableTime: input.usableTime,
          // 프롬프트 입력에 필요한 3개만 보낸다 — 썸네일까지 실으면 프롬프트가 불필요하게 커진다.
          products: items.map((product) => ({
            productName: product.productName,
            category: product.category,
            ingredients: product.ingredients,
          })),
        });

        // 한쪽이 비는 경우가 있다(제품이 적으면 저녁만 나오기도 한다).
        // 빈 시간대는 루틴을 만들지 않는다 — 단계 0개짜리 카드는 사용자에게 의미가 없다.
        const summary = raw.concern_summary ?? null;
        const routines: Routine[] = [];
        if (raw.morning.length > 0)
          routines.push(toRoutine(raw.morning, "am", input.condition, summary));
        if (raw.evening.length > 0)
          routines.push(toRoutine(raw.evening, "pm", input.condition, summary));

        if (routines.length === 0) {
          setStatus("error");
          setError("AI 가 루틴을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
          return;
        }

        // 서버 저장. 90초 기다려 만든 결과가 저장에서 조용히 실패하면 사용자는 저장된 줄
        // 안다 — 프로필·루틴 중 하나라도 실패하면 부분 성공으로 보고하지 않고 catch 로 던진다.
        saving = true;
        await saveProfile({ wonder, usableTime: input.usableTime });
        await saveRoutines(routines);

        setSaved(routines);
        setStatus("done");
      } catch (cause: unknown) {
        setStatus("error");

        if (cause instanceof ApiError) {
          const body = cause.body as { message?: string } | null;
          setError(
            (saving ? undefined : BUSY_TEXT[cause.status]) ??
              body?.message ??
              `루틴을 만들지 못했어요 (${cause.status})`,
          );
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "알 수 없는 오류가 발생했어요.",
        );
      }
    },
    [products],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setSaved([]);
  }, []);

  return { status, error, saved, generate, reset };
}
