import { IngredientAlerts } from "./components/IngredientAlerts";
import { NextStepCard } from "./components/NextStepCard";
import { RoutineStarter } from "./components/RoutineStarter";
import { ScanCard } from "./components/ScanCard";
import { SkinHealthCard } from "./components/SkinHealthCard";

import { TopAppBar } from "@/components/TopAppBar/TopAppBar";

import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      {/* 인사말 이름은 설정 모달에서 저장한 값(localStorage)을 TopAppBar 가 직접 읽는다. */}
      <TopAppBar title="홈" />

      <main id="main" className={styles.main}>
        <div className={styles.full}>
          <RoutineStarter />
        </div>

        <div className={styles.wide}>
          <SkinHealthCard />
        </div>

        <div className={styles.narrow}>
          <ScanCard />
        </div>

        <div className={styles.wide}>
          <NextStepCard />
        </div>

        <div className={styles.narrow}>
          <IngredientAlerts />
        </div>
      </main>
    </>
  );
}
