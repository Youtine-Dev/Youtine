"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { useProducts, useRoutines } from "@/lib/data";
import { stepIcon } from "@/lib/stepIcon";
import { markRunStep, setStepSkipped } from "@/lib/storage/history";
import type { Product } from "@/types/skincare";

import { HowToList } from "./HowToList";
import styles from "./RoutineRunner.module.css";
import { RunHeader } from "./RunHeader";
import { StepActions } from "./StepActions";
import { StepTimer } from "./StepTimer";
import { StepWarnings } from "./StepWarnings";

/**
 * using_product(이름 문자열)를 저장된 제품과 정규화 매칭해 히어로 사진을 찾는다.
 * LLM 이 공백·대소문자를 바꿔 쓸 수 있어(계약 함정) 정규화 후 정확 일치 → 포함
 * 순으로 본다. 못 찾으면 null — 아이콘 폴백이 받는다(이름 표시는 별개로 유지).
 */
function findStepPhoto(
  usingProduct: readonly string[],
  products: readonly Product[],
): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  for (const name of usingProduct) {
    const target = normalize(name);
    if (!target) continue;
    const matched =
      products.find((p) => normalize(p.productName) === target) ??
      products.find((p) => {
        const own = normalize(p.productName);
        return own.includes(target) || target.includes(own);
      });
    // 수행 화면은 내 선반이 전제라 개인 촬영본(thumbnail)을 우선한다.
    const photo = matched?.thumbnail ?? matched?.image;
    if (photo) return photo;
  }
  return null;
}

/**
 * 수행 화면의 클라이언트 경계.
 *
 * 루틴이 localStorage 로 옮겨가면서 **서버는 루틴을 모른다.** 그래서
 *  - `generateStaticParams` 가 성립하지 않는다(단계 수가 루틴마다 다르다) → 제거했다.
 *  - 404 판정도 서버의 `notFound()` 로 못 한다 → 여기서 판정한다.
 *
 * 페이지(`page.tsx`)는 서버 컴포넌트로 남기고 `params` 만 넘긴다 —
 * `"use client"` 를 페이지가 아니라 한 단계 아래인 여기에 둔다.
 */
export function RoutineRunner({
  routineId,
  step,
}: {
  routineId: string;
  step: string;
}) {
  const { ready, value: routines, error, errorMessage, retry } = useRoutines();
  // 히어로에 제품 사진을 얹기 위한 선반 조회 — 실패해도 아이콘 폴백이라 치명적이지 않다.
  const products = useProducts();

  const routine = routines.find((item) => item.id === routineId);
  const index = Number(step) - 1;
  const valid =
    routine !== undefined &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < routine.steps.length;

  /*
   * 로드에 실패한 사진 src 를 기억해 아이콘으로 폴백한다(m34, ProductCard 와 같은 방식).
   * src 자체를 기억하므로 다른 단계의 사진으로 바뀌면 자동으로 다시 시도한다.
   */
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);

  /*
   * 히어로(사진 영역)가 화면에서 사라졌을 때만 하단 고정 액션바를 띄운다
   * (사용자 요청 2026-08-20 — 다음 버튼은 평소 히어로 안에 있다).
   * 훅은 early return 앞에 있어야 하므로 여기 둔다.
   */
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      // 히어로가 15% 미만으로 남았을 때 "사라졌다"로 본다 — 경계에서 덜컥거리지 않게.
      { threshold: 0.15 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
    // ready/step 이 바뀌면 히어로 DOM 이 새로 그려질 수 있어 다시 관찰한다.
  }, [ready, index, routineId]);

  /*
   * 첫 단계에서 수행 시작 시각을 찍고, 이후 단계마다 위치를 남긴다 — 완료 화면·홈
   * '이어서 하기'는 별도 라우트라 메모리로 넘길 수 없다. 훅은 early return 앞에서
   * 무조건 호출해야 하므로 조건은 본문 안에 둔다.
   */
  useEffect(() => {
    if (ready && valid) markRunStep(routineId, index + 1);
  }, [ready, valid, index, routineId]);

  // 아직 서버 응답 전이다. 여기서 "없음"으로 단정하면
  // 정상 루틴인데도 "찾을 수 없어요"가 한 번 깜빡였다가 사라진다.
  if (!ready) return <DataState loading label="루틴" />;

  // 네트워크 실패를 "루틴 없음"으로 오판하면 안 되므로 404 판정보다 먼저 처리한다.
  if (error)
    return (
      <DataState error onRetry={retry} label="루틴" message={errorMessage} />
    );

  if (!routine || !valid) {
    return (
      <main className={styles.missing} role="alert">
        <Icon name="search_off" filled className={styles.missingIcon} />
        <h2 className={styles.missingTitle}>이 단계를 찾을 수 없어요</h2>
        <p className={styles.missingText}>
          루틴을 다시 만들었거나 주소가 잘못됐을 수 있어요.
        </p>
        <Link className={styles.missingCta} href="/routine">
          루틴 목록으로
        </Link>
      </main>
    );
  }

  const steps = routine.steps;
  const current = steps[index];
  const next = steps[index + 1];

  const nextHref = next
    ? (`/routine/${routineId}/${index + 2}` as Route)
    : (`/routine/${routineId}/done` as Route);
  const matched = findStepPhoto(current.usingProduct, products.value);
  const photo = matched !== brokenPhoto ? matched : null;
  /** '다음'은 이 단계를 한 것으로, '건너뛰기'는 안 한 것으로 남긴다(I10). */
  const markStep = (skipped: boolean) => () =>
    setStepSkipped(routineId, current.id, skipped);

  return (
    <>
      <RunHeader title={routine.name} step={index + 1} total={steps.length} />

      <main className={styles.main}>
        <div className={styles.visual}>
          {/*
           * 히어로 = 큰 터치 영역(사용자 요청 2026-08-20):
           * 배경에 매칭된 제품 사진(없으면 아이콘 폴백), 상단은 즉시 표시되는
           * 큰 타이머(탭=일시정지), 하단은 이전(작게)+다음(크게) 버튼.
           */}
          <div
            ref={heroRef}
            className={`${styles.photo} ${photo ? styles.photoWithImg : ""}`}
          >
            {photo ? (
              <Image
                src={photo}
                alt=""
                fill
                unoptimized
                className={styles.photoImg}
                onError={() => setBrokenPhoto(photo)}
              />
            ) : (
              /*
                타이머가 있으면 아이콘은 타이머 묶음(숫자 위)으로 들어간다 — 정중앙 배경에
                두면 숫자와 겹친다(2026-11-02). 타이머가 없는 단계만 배경에 깐다.
              */
              current.estimatedTime <= 0 && (
                <Icon
                  name={stepIcon(current.routineName)}
                  filled
                  className={styles.photoIcon}
                />
              )
            )}

            {/*
              제목(단계 칩·소요 시간·제품명)은 히어로 좌측 상단에 얹는다(사용자 요청
              2026-08-20). 링크가 없어 pointer-events 를 끊는다 — 탭은 타이머가 받는다.
            */}
            <div className={styles.heroIntro}>
              <p className={styles.meta}>
                <span className={styles.category}>{current.routineName}</span>
                {/* 시간이 없는 단계에 "약 1분"을 날조하지 않는다(리뷰 m15). */}
                {current.estimatedTime > 0 && (
                  <span className={styles.duration}>
                    약 {Math.max(1, Math.round(current.estimatedTime / 60))}분
                  </span>
                )}
              </p>
              {/*
                using_product 는 제품 id 가 아니라 **이름 문자열**이다. 저장된 제품과
                정확히 안 맞을 수 있으므로 매칭에 실패해도 이름은 그대로 보여준다.
              */}
              <h2 className={styles.heroTitle}>
                {current.usingProduct.length > 0
                  ? current.usingProduct.join(" + ")
                  : current.routineName}
              </h2>
            </div>

            {/* estimated_time 은 초 단위 정수다 — 분이 아니다.
                0 이하면 잴 시간이 없다 — 타이머를 그리지 않는다(리뷰 m15).
                key: 단계가 바뀌면 이전 단계의 진행 중 타이머를 버린다(HowToList 와 동일). */}
            {current.estimatedTime > 0 && (
              <StepTimer
                key={current.id}
                seconds={current.estimatedTime}
                onPhoto={photo !== null}
                icon={photo ? undefined : stepIcon(current.routineName)}
              />
            )}

            <div className={styles.heroActions}>
              {index > 0 && (
                <Link
                  href={`/routine/${routineId}/${index}` as Route}
                  className={styles.heroPrev}
                  aria-label="이전 단계"
                >
                  <Icon name="arrow_back" />
                </Link>
              )}
              <Link
                href={nextHref}
                className={styles.heroNext}
                onClick={markStep(false)}
              >
                <span>
                  {next ? `다음: ${next.routineName}` : "루틴 마치기"}
                </span>
                <Icon name={next ? "arrow_forward" : "check"} />
              </Link>
            </div>
          </div>
        </div>

        <div className={styles.details}>
          {/*
            순서는 사용법 → 주의사항 → 팁 (사용자 피드백 2026-08-20).
            지금 해야 할 일(사용법)이 첫눈에 오고, 안전(주의)이 참고(팁)보다 앞선다.
            단계가 바뀌면 체크 상태를 초기화한다(key).
          */}
          <HowToList key={current.id} items={current.howToUse} />

          <StepWarnings items={current.warning} />

          {current.tips.length > 0 && (
            <aside className={styles.expert}>
              <span className={styles.expertBadge} aria-hidden="true">
                <Icon name="spa" filled size="sm" />
              </span>
              <div>
                <p className={styles.expertLabel}>전문가 팁</p>
                <ul className={styles.tipList}>
                  {current.tips.map((tip) => (
                    <li key={tip} className={styles.expertText}>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/*
        하단 고정 액션바는 히어로가 스크롤로 사라졌을 때만 나타난다 —
        평소의 다음 버튼은 히어로 안에 있다(사용자 요청 2026-08-20).
        768px+ 에서는 히어로가 sticky 라 사실상 항상 보이므로 바가 뜨지 않는다.
      */}
      {!heroVisible && (
        <StepActions
          nextHref={nextHref}
          nextLabel={next ? next.routineName : undefined}
          prevHref={
            index > 0 ? (`/routine/${routineId}/${index}` as Route) : undefined
          }
          onNext={markStep(false)}
          onSkip={markStep(true)}
        />
      )}
    </>
  );
}
