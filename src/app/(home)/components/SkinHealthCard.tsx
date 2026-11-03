"use client";

import Link from "next/link";

import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { SentenceBreak } from "@/components/SentenceBreak";
import { weeklyAchievement } from "@/lib/achievement";
import { useRoutines, useRuns } from "@/lib/data";

import card from "./card.module.css";
import styles from "./SkinHealthCard.module.css";

// 게이지 원 둘레 (r=40) — stroke-dasharray 계산에 쓴다
const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function summaryText(percent: number): string {
  if (percent >= 80) return "정말 잘하고 있어요! 이대로만 이어가 보세요.";
  if (percent >= 50) return "절반 넘게 해냈어요. 남은 단계도 채워보세요.";
  return "이번 주 루틴을 조금 더 챙겨보면 좋아요.";
}

/**
 * 지난주 대비 문구. `delta` 는 %p(퍼센트포인트) 단위다 — % 와 섞어 쓰면
 * "82% 대비 5%"처럼 단위가 헷갈린다.
 *
 * `null` 은 "지난주 기록 없음"이지 "변화 없음(0)"이 아니다 — 구분해서 보여준다.
 */
function deltaInfo(delta: number | null): { icon: string; text: string } {
  if (delta === null) return { icon: "history", text: "지난주 기록 없음" };
  if (delta > 0)
    return { icon: "trending_up", text: `지난주보다 ${delta}%p 올랐어요` };
  if (delta < 0)
    return {
      icon: "trending_down",
      text: `지난주보다 ${Math.abs(delta)}%p 줄었어요`,
    };
  return { icon: "trending_flat", text: "지난주와 같아요" };
}

/**
 * "이번 주 루틴 달성률" (Q10).
 *
 * 예전엔 "피부 건강 점수"였지만 산출 근거가 없었다 — 실제 수행 기록에서
 * 계산되는 달성률로 이름과 내용을 맞췄다. 계산 자체는 순수 함수인
 * `weeklyAchievement`(src/lib/achievement.ts)가 갖고 있어 여기서는
 * 저장소만 읽어 넘기고, 표시만 담당한다.
 */
export function SkinHealthCard() {
  const routinesRes = useRoutines();
  const runsRes = useRuns();

  // 달성률은 루틴과 기록이 **둘 다** 있어야 계산된다. 하나라도 덜 왔으면 아직 모른다.
  if (!routinesRes.ready || !runsRes.ready)
    return <DataState loading label="달성률" />;

  if (routinesRes.error || runsRes.error)
    return (
      <DataState
        error
        label="달성률"
        // 둘 다 실패할 수도 있다 — 먼저 있는 쪽(routines)의 메시지를 우선한다.
        message={routinesRes.errorMessage ?? runsRes.errorMessage}
        onRetry={() => {
          routinesRes.retry();
          runsRes.retry();
        }}
      />
    );

  const { percent, delta, hasRuns } = weeklyAchievement(
    runsRes.value,
    routinesRes.value,
  );

  // 루틴이 아직 없어 예정 단계가 0 — 달성률을 계산할 수 없다.
  // CTA 는 두지 않는다 — 제품이 없으면 '루틴 만들기'가 "먼저 제품을 등록"으로 튕겼다(4라운드 m6).
  // 같은 홈의 다음 단계 카드(NextStepCard)가 제품 유무에 맞는 행동을 안내한다.
  if (percent === null) {
    return (
      <section className={`${card.card} ${styles.empty}`}>
        <Icon name="auto_awesome" filled className={styles.emptyIcon} />
        <h2 className={card.cardTitle}>이번 주 루틴 달성률</h2>
        <p className={styles.emptyText}>
          아직 만든 루틴이 없어요.
          <br />
          루틴을 만들면 달성률을 보여드려요.
        </p>
      </section>
    );
  }

  // 이번 주 수행 기록이 하나도 없다 — 0%로 그리면 "실패"처럼 보인다.
  if (!hasRuns) {
    return (
      <section className={`${card.card} ${styles.empty}`}>
        <Icon name="auto_awesome" filled className={styles.emptyIcon} />
        <h2 className={card.cardTitle}>이번 주 루틴 달성률</h2>
        <p className={styles.emptyText}>
          이번 주엔 아직 기록이 없어요.
          <br />첫 루틴을 시작해 보세요.
        </p>
        <Link className={styles.emptyCta} href="/routine">
          <Icon name="play_arrow" filled size="sm" />
          루틴 시작하기
        </Link>
      </section>
    );
  }

  const filled = (CIRCUMFERENCE * percent) / 100;
  const { icon, text } = deltaInfo(delta);

  return (
    <section className={`${card.card} ${styles.section}`}>
      <div className={styles.info}>
        <h2 className={`${card.cardTitle} ${styles.heading}`}>
          이번 주 루틴 달성률
        </h2>
        <p className={styles.summary}>
          <SentenceBreak text={summaryText(percent)} />
        </p>
        <p className={`${card.label} ${styles.delta}`}>
          <Icon name={icon} size="sm" />
          {text}
        </p>
      </div>

      <div className={styles.gauge}>
        <svg viewBox="0 0 100 100" className={styles.gaugeSvg}>
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="transparent"
            stroke="var(--surface-container-highest)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="transparent"
            /* --primary-container 는 컨테이너 배경 역할이라 이 카드(surface-container-lowest)
               같은 유동 표면 위 강조색으로 쓰면 다크에서 대비가 무너진다 → --primary */
            stroke="var(--primary)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            className={styles.progress}
          />
        </svg>

        <div className={styles.readout}>
          <span className={styles.score}>{percent}</span>
          <span className={`${card.label} ${styles.total}`}>%</span>
        </div>
      </div>
    </section>
  );
}
