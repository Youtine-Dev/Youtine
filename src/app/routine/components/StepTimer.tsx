"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";

import styles from "./StepTimer.module.css";

function format(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * 히어로(제품 사진) 위에 얹히는 단계 타이머 — 사용자 요청 2026-08-20:
 * "시작을 눌러야 도는" 방식이 아니라 **진입 즉시 남은 시간이 크게** 보인다.
 * 넓은 상단 영역 전체가 터치 타깃이고, 탭하면 일시정지/계속을 오간다.
 *
 * 남은 시간은 항상 **시작 시각 기준으로 파생**한다 — 틱 감산은 백그라운드 탭·화면
 * 꺼짐에서 setInterval 스로틀로 실시간과 어긋난다(리뷰 m13). 일시정지는 그 시점의
 * 남은 초를 `base` 에 보존했다가 재개 시 이어 센다.
 */
export function StepTimer({
  seconds,
  onPhoto,
  icon,
}: {
  seconds: number;
  /** 제품 사진 위에 얹혔는가 — 글자색·스크림 대비가 달라진다. */
  onPhoto: boolean;
  /**
   * 사진이 없을 때의 단계 아이콘. 숫자 **위에 한 덩어리로** 놓는다 — 예전엔 히어로 정중앙에
   * 따로 깔려 타이머 숫자와 겹쳤다(사용자 보고 2026-11-02).
   */
  icon?: string;
}) {
  const [left, setLeft] = useState(seconds);
  // 재개(시작) 시점의 남은 초 — 파생 계산의 기준점
  const [base, setBase] = useState(seconds);
  // 실행 중이면 시작 시각(epoch ms), 정지 상태면 null. 진입 즉시 시작한다.
  const [startedAt, setStartedAt] = useState<number | null>(() => Date.now());
  const running = startedAt !== null;

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      const remain = base - Math.floor((Date.now() - startedAt) / 1000);
      if (remain <= 0) {
        setLeft(0);
        setStartedAt(null);
        // 젖은 손·시선은 거울 — 화면 밖 신호도 준다(I11). iOS Safari 엔 vibrate 가 없다.
        // 사용자가 아직 탭하지 않은 문서에서 부르면 Chrome 이 막고 콘솔 error 를 남긴다(새로고침 직후 등).
        if ("vibrate" in navigator && navigator.userActivation?.hasBeenActive) {
          navigator.vibrate([200, 100, 200]);
        }
        return;
      }
      setLeft(remain);
    };
    tick();
    // 스로틀돼도 복귀 후 첫 틱이 실제 경과를 통째로 반영하므로 1초면 충분하다.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, base]);

  const finished = left === 0;
  const hint = finished
    ? "완료 — 탭하면 다시 시작"
    : running
      ? "탭하면 일시정지"
      : "일시정지됨 — 탭하면 계속";

  return (
    <>
      <button
        type="button"
        className={[
          styles.timer,
          onPhoto ? styles.onPhoto : "",
          finished ? styles.finished : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (finished) {
            setLeft(seconds);
            setBase(seconds);
            setStartedAt(Date.now());
            return;
          }
          if (running) {
            // 일시정지 — 지금까지의 경과를 남은 초로 굳혀 둔다
            setBase(left);
            setStartedAt(null);
            return;
          }
          setStartedAt(Date.now());
        }}
        aria-label={`남은 시간 ${format(left)} — ${hint}`}
      >
        {icon && <Icon name={icon} filled className={styles.icon} />}
        <span className={styles.time}>{format(left)}</span>
        <span className={styles.hint}>{hint}</span>
      </button>
      {/* 처음부터 빈 채로 있어야 내용이 바뀔 때 스크린리더가 읽는다. */}
      <span className={styles.srOnly} role="status">
        {finished ? "타이머가 끝났어요. 다음 단계로 넘어가세요." : ""}
      </span>
    </>
  );
}
