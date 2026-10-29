import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader/PageHeader";

import { RoutineForm } from "./components/RoutineForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "루틴 만들기",
};

/**
 * 루틴 생성 화면.
 *
 * 페이지는 서버 컴포넌트로 두고 폼만 클라이언트다 — 생성 입력·진행 상태가 전부 폼
 * 안에서만 필요하므로 `"use client"` 를 leaf 에 유지한다.
 *
 * `?focus=1` 이면 **기타 루틴**(저장값 "고민 집중")을 만든다("내 고민" 탭에서 들어오는 길).
 * 쿼리는 서버에서 읽어 prop 으로 내린다 — `useSearchParams` 를 쓰면 이 페이지 전체가
 * Suspense 경계를 요구하게 된다.
 */
export default async function NewRoutinePage({
  searchParams,
}: PageProps<"/routine/new">) {
  const { focus } = await searchParams;

  return (
    <>
      <PageHeader title={focus === "1" ? "기타 루틴 만들기" : "루틴 만들기"} />

      <main id="main" className={styles.main}>
        <RoutineForm focus={focus === "1"} />
      </main>
    </>
  );
}
