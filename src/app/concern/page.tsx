import type { Metadata } from "next";

import { TopAppBar } from "@/components/TopAppBar/TopAppBar";

import { ConcernDictionary } from "./components/ConcernDictionary";
import { ConcernSection } from "./components/ConcernSection";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "내 고민",
};

/**
 * "내 고민" 화면 — 예전 프로필 자리다(`/profile` → `/concern`, 2026-08-19).
 *
 * **한 가지 흐름만 담는다**: 고민 등록 → 성분 추천 → 그 성분이 든 제품 → 집중 루틴 만들기.
 * 예전에 여기 있던 선반·리포트는 스캔 탭으로, 기록은 루틴 탭으로 나갔다 —
 * 각 탭이 자기 일과 그 결과를 함께 갖게 하려는 것이다
 * ([계획서](../../../docs/plans/2026-08-19-concern-flow/README.md) Step 6).
 *
 * 흐름 전체가 한 컴포넌트 안에서 이어지므로(고민이 있어야 성분이, 성분을 눌러야 제품이
 * 나온다) 페이지는 껍데기만 남는다. `"use client"` 는 `ConcernSection` leaf 에 있다.
 */
export default function ConcernPage() {
  return (
    <>
      <TopAppBar title="내 고민" />

      <main id="main" className={styles.main}>
        {/* 제목을 컴포넌트가 직접 갖는다 — 입력 화면과 결과 화면의 제목이 다르다. */}
        <ConcernSection />

        {/*
          자유 입력(위, AI)과 별개인 0원짜리 지식 경로 — 자주 찾는 고민 8종은
          기다림 없이 바로 본다. 고민 등록 전에도, 후에도 쓸 수 있어 페이지에 둔다.
        */}
        <ConcernDictionary />
      </main>
    </>
  );
}
