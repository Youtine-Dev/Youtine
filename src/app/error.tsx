"use client";

import { useEffect } from "react";

import styles from "./status.module.css";

/**
 * 렌더링 중 예외가 터졌을 때 보여줄 화면.
 * App Router 규칙상 이 파일은 반드시 클라이언트 컴포넌트여야 한다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: Sentry 등 에러 리포팅 도구를 붙일 자리
    console.error(error);
  }, [error]);

  return (
    <main id="main" className={styles.container}>
      <h1 className={styles.title}>문제가 발생했습니다</h1>
      <p className={styles.description}>
        잠시 후 다시 시도해 주세요.
        <br />
        문제가 계속되면 팀에 알려주세요.
      </p>
      <button type="button" onClick={reset} className={styles.action}>
        다시 시도
      </button>
    </main>
  );
}
