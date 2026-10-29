"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/Icon";
import { YoutineIcon } from "@/components/YoutineIcon";
import { load, remove, save } from "@/lib/storage/local";
import { useStored } from "@/lib/storage/useStored";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useModalFocus } from "@/lib/useModalFocus";

import styles from "./TopAppBar.module.css";

/** 표시 이름 — 계정이 없는 앱이라 기기(localStorage)가 정본이다. */
const NAME_KEY = "user-name";
/**
 * 테마 선택("light"|"dark", 없으면 시스템).
 * ⚠️ layout.tsx 의 부트스트랩 스크립트가 같은 키(al:v1:theme)를 원문으로 읽는다 —
 * 키를 바꾸면 그쪽도 함께 바꿀 것.
 */
const THEME_KEY = "theme";

type ThemeMode = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: "system", label: "시스템", icon: "contrast" },
  { value: "light", label: "라이트", icon: "light_mode" },
  { value: "dark", label: "다크", icon: "dark_mode" },
];

/**
 * 선택을 저장하고 즉시 적용한다. "시스템"은 저장을 지우고 현재 OS 값을 반영한다
 * (세션 중 OS 설정이 또 바뀌는 경우는 다음 로드에서 부트스트랩이 따라간다).
 */
function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    remove(THEME_KEY);
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
  } else {
    save(THEME_KEY, mode);
    root.dataset.theme = mode;
  }
  // 상태바 색도 수동 테마를 따른다(3라운드 m13) — layout.tsx 부트스트랩이 만든 하나뿐인
  // theme-color 를 갱신한다. 값은 방금 바뀐 팔레트의 --surface 를 읽어 hex 이중 관리를 피한다.
  document
    .querySelector('meta[name="theme-color"]:not([media])')
    ?.setAttribute(
      "content",
      getComputedStyle(root).getPropertyValue("--surface").trim(),
    );
}

/** 설정 모달 — 이름·화면 모드. 스크림·Esc·포커스 규칙은 앱의 다른 모달과 동일. */
function SettingsModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  const nameId = useId();

  // 열릴 때 한 번 읽는다 — 입력은 즉시 저장되므로 별도 저장 버튼이 없다.
  const [name, setName] = useState(() => load<string>(NAME_KEY, ""));
  const theme = useStored<ThemeMode | null>(THEME_KEY, null);
  const mode: ThemeMode = theme.value ?? "system";

  // 초기 포커스(닫기) · Tab 트랩 · 닫힐 때 톱니 버튼으로 복귀 — 공용 훅(3라운드 m31).
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(sheetRef, closeRef);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="설정"
      onClick={onClose}
    >
      {/* 시트 안쪽 클릭이 스크림으로 새어 닫히지 않게 막는다(IngredientDetailModal 과 같은 규칙) */}
      <div
        ref={sheetRef}
        className={styles.sheet}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.sheetBar}>
          <p className={styles.sheetTitle}>설정</p>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={nameId}>
            이름
          </label>
          <input
            id={nameId}
            className={styles.input}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              // 입력 즉시 저장 — subscribe 로 상단바 인사말도 실시간 갱신된다.
              save(NAME_KEY, event.target.value);
            }}
            placeholder="어떻게 불러 드릴까요?"
            maxLength={20}
          />
          <p className={styles.fieldHint}>이 기기에만 저장돼요.</p>
        </div>

        <div className={styles.field}>
          <p className={styles.fieldLabel}>화면 모드</p>
          <div
            className={styles.segment}
            role="radiogroup"
            aria-label="화면 모드"
          >
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                className={`${styles.segmentItem} ${
                  mode === option.value ? styles.segmentActive : ""
                }`}
                onClick={() => applyTheme(option.value)}
              >
                <Icon
                  name={option.icon}
                  size="sm"
                  filled={mode === option.value}
                />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 홈·스캔·내 고민·루틴 상단 바 — 인사말(저장된 이름) + 설정(이름·화면 모드) 진입점.
 *
 * @param title 페이지 주제. 화면에는 안 보이는 h1 로만 쓴다 — 예전엔 인사말이 네 페이지
 *   공통 h1 이라 스크린리더 제목 목록이 전부 "안녕하세요"였다(3라운드 I14).
 */
export function TopAppBar({ title }: { title: string }) {
  const name = useStored<string>(NAME_KEY, "");
  const [open, setOpen] = useState(false);

  // 이름이 없으면 이름 없이 인사한다 — 가짜 이름("Glow")으로 개인화를 흉내 내지 않는다(P14).
  const trimmed = name.ready ? name.value.trim() : "";
  const greeting = trimmed ? `${trimmed}님, 안녕하세요` : "안녕하세요";

  return (
    <header className={styles.bar}>
      <h1 className={styles.srOnly}>{title}</h1>
      {/* fixed 바는 좌우로 꽉 채우고, 내용만 여기서 --container-max 로 좁힌다(m25). */}
      <div className={styles.inner}>
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden="true">
            <YoutineIcon size={40} />
          </div>
          <p className={styles.title}>{greeting}</p>
        </div>

        <button
          type="button"
          className={styles.gear}
          onClick={() => setOpen(true)}
          aria-label="설정"
        >
          <Icon name="settings" />
        </button>
      </div>

      {/*
        ⚠️ 포털 필수 — 바에 backdrop-filter 가 있어 fixed 자손의 기준 박스가 헤더가 된다.
        헤더 안에서 그리면 오버레이가 72px 헤더 안에 갇혀 모달이 화면 위에 붙는다(실측).
      */}
      {open &&
        createPortal(
          <SettingsModal onClose={() => setOpen(false)} />,
          document.body,
        )}
    </header>
  );
}
