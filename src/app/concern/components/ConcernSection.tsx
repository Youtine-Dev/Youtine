"use client";

import Link from "next/link";
import { useState } from "react";

import { ApiError } from "@/api/client";
import { DataState } from "@/components/DataState/DataState";
import { Icon } from "@/components/Icon";
import { saveProfile, useConcernIngredients, useSkinProfile } from "@/lib/data";

import { IngredientProducts } from "@/components/IngredientProducts/IngredientProducts";

import styles from "./ConcernSection.module.css";

/**
 * 루틴 생성 폼과 같은 기본값. 고민만 등록하는 사용자도 값이 있어야 저장된다
 * (`skin_profiles.usable_morning/evening` 이 NOT NULL 이다).
 */
const DEFAULT_USABLE_TIME = { morning: "5분", evening: "10분" };

/**
 * "내 고민" 탭의 입구 — 고민을 적으면 **그 고민에 도움이 되는 성분**을 AI 가 추천한다.
 *
 * ⚠️ **의학적 조언이 아니다.** 화면에 그 문구를 고정한다(사용자 결정 2026-08-19).
 * 프롬프트에도 진단·치료 표현을 금지하는 규칙이 들어 있다.
 *
 * 성분 추천은 고민 문자열을 키로 캐시된다 — 탭을 오가도 다시 부르지 않는다.
 */
export function ConcernSection() {
  const profile = useSkinProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 펼친 성분 이름. 하나만 연다 — 여러 개를 열면 목록이 길어져 비교가 어렵다. */
  const [expanded, setExpanded] = useState<string | null>(null);

  const wonder = profile.value?.wonder ?? null;
  // 편집 중에는 추천을 부르지 않는다 — 아직 확정되지 않은 문장으로 30초를 쓸 이유가 없다.
  const ingredients = useConcernIngredients(editing ? null : wonder);

  async function handleSave() {
    const next = draft.trim();
    if (!next) return;

    setSaving(true);
    setSaveError(null);
    try {
      // 가용 시간은 루틴 생성에서 정한다. 여기서는 기존 값을 지키고 없으면 기본값을 넣는다.
      // 필드별로 본다 — 예전 이관(migrate)이 빈 문자열로 저장한 행이 있고, 서버는 빈 값을 400 으로 거부한다.
      const saved = profile.value?.usableTime;
      await saveProfile({
        wonder: next,
        usableTime: {
          morning: saved?.morning || DEFAULT_USABLE_TIME.morning,
          evening: saved?.evening || DEFAULT_USABLE_TIME.evening,
        },
      });
      setEditing(false);
    } catch (cause: unknown) {
      // 서버가 준 한글 안내(`{ message }`)를 우선 보여 준다 — "API 400" 원문은 사용자용이 아니다.
      if (cause instanceof ApiError) {
        const body = cause.body as { message?: string } | null;
        setSaveError(
          body?.message ?? `고민을 저장하지 못했어요 (${cause.status})`,
        );
      } else {
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "고민을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (!profile.ready) return <DataState loading label="고민" />;
  if (profile.error)
    return (
      <DataState
        error
        onRetry={profile.retry}
        label="고민"
        message={profile.errorMessage}
      />
    );

  // 고민이 없거나 고치는 중이면 입력 화면
  if (!wonder || editing) {
    return (
      <section className={styles.card}>
        <h2 className={styles.heading}>어떤 고민이 있나요?</h2>
        <p className={styles.lead}>
          고민을 적으면 도움이 되는 성분을 찾아 드려요.
        </p>

        <textarea
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예: 모공이 넓고 각질이 자주 일어나요"
          rows={3}
          disabled={saving}
          aria-label="피부 고민"
        />

        {saveError && (
          <p className={styles.error} role="alert">
            <Icon name="error" size="sm" />
            {saveError}
          </p>
        )}

        <div className={styles.actions}>
          {wonder && (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              취소
            </button>
          )}
          <button
            type="button"
            className={styles.submit}
            onClick={handleSave}
            disabled={saving || draft.trim() === ""}
          >
            {saving ? (
              <>
                <Icon name="progress_activity" className={styles.spinner} />
                저장 중…
              </>
            ) : (
              <>
                <Icon name="search" filled />
                성분 찾기
              </>
            )}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={styles.card}>
        <div className={styles.wonderHead}>
          <div>
            <p className={styles.label}>내 고민</p>
            <p className={styles.wonder}>{wonder}</p>
          </div>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              setDraft(wonder);
              setEditing(true);
            }}
          >
            <Icon name="edit" size="sm" />
            수정
          </button>
        </div>
      </section>

      <section className={styles.card}>
        {/*
          제목에 등록한 고민을 그대로 넣는다(사용자 요청 2026-08-20) —
          "이 고민"이라는 대명사보다 무엇에 대한 답인지가 바로 보인다.
          고민은 한 문단일 수 있어 CSS 로 두 줄에서 자른다(전문은 위 카드에 있다).
        */}
        <h2 className={styles.heading}>
          <span className={styles.headingWonder}>&ldquo;{wonder}&rdquo;</span>에
          도움이 되는 성분
        </h2>

        {!ingredients.ready ? (
          <DataState loading label="성분" />
        ) : ingredients.error ? (
          /* 429("이미 처리 중")를 "인터넷 연결을 확인해 주세요"로 안내하면 안 된다. */
          <DataState
            error
            onRetry={ingredients.retry}
            label="성분"
            message={ingredients.errorMessage}
          />
        ) : ingredients.value.length === 0 ? (
          /* 빈 배열은 실패가 아니다 — 프롬프트 규칙 7(고를 수 없으면 [])의 결과다. */
          <p className={styles.empty}>
            성분을 고르지 못했어요.
            <br />
            고민을 조금 더 구체적으로 적어 보세요.
          </p>
        ) : (
          <ul className={styles.list}>
            {ingredients.value.map((item) => {
              const open = expanded === item.name;

              return (
                <li key={item.name} className={styles.item}>
                  {/*
                    펼칠 때만 제품을 조회한다 — 성분 6개를 한꺼번에 부르면
                    쓰지도 않을 요청이 6개 나간다.
                  */}
                  <button
                    type="button"
                    className={styles.itemHead}
                    onClick={() => setExpanded(open ? null : item.name)}
                    aria-expanded={open}
                  >
                    <span className={styles.itemText}>
                      <span className={styles.name}>{item.name}</span>
                      {item.effect && (
                        <span className={styles.effect}>{item.effect}</span>
                      )}
                    </span>
                    <Icon
                      name={open ? "expand_less" : "expand_more"}
                      className={styles.chevron}
                    />
                  </button>

                  {item.caution && (
                    <p className={styles.caution}>
                      <Icon name="info" size="sm" />
                      {item.caution}
                    </p>
                  )}

                  {open && <IngredientProducts ingredient={item.name} />}
                </li>
              );
            })}
          </ul>
        )}

        {/* 진단으로 읽히지 않도록 결과 옆에 고정한다. 프롬프트 규칙 5 와 짝이다. */}
        <p className={styles.disclaimer}>
          일반적인 정보이며 의학적 조언이 아닙니다.
          <br />
          피부 질환이 의심되면 전문의와 상담하세요.
        </p>
      </section>

      {/*
        이 탭의 마지막 칸이다 — 고민 → 성분 → 제품까지 왔으면 다음은 루틴이다.
        여기서 나가면 `condition = "고민 집중"` 으로 저장돼 기본 루틴을 덮지 않는다.
      */}
      <section className={styles.card}>
        {/* 루틴 탭·생성 화면이 쓰는 이름("기타 루틴")과 맞춘다 — 제목과 버튼이 다른 말을 했다(3라운드 m33). */}
        <h2 className={styles.heading}>이 고민으로 기타 루틴 만들기</h2>
        <p className={styles.lead}>
          선반에 담은 제품으로 이 고민에 집중한 아침·저녁 루틴을 짜 드려요.
          <br />
          기본 루틴은 그대로 남습니다.
        </p>
        <Link className={styles.cta} href="/routine/new?focus=1">
          <Icon name="auto_awesome" filled size="sm" />
          기타 루틴 만들기
        </Link>
      </section>
    </>
  );
}
