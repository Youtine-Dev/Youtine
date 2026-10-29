import Link from "next/link";

import styles from "./status.module.css";

export default function NotFound() {
  return (
    <main id="main" className={styles.container}>
      <h1 className={styles.title}>404</h1>
      <p className={styles.description}>요청하신 페이지를 찾을 수 없습니다.</p>
      <Link href="/" className={styles.action}>
        홈으로
      </Link>
    </main>
  );
}
