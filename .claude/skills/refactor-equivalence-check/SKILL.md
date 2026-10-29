---
name: refactor-equivalence-check
description: youtine(유틴)에서 동작 보존이 목적인 변경 — 거대 파일 분리, 쌍둥이 컴포넌트 통합, 폴더/파일 이동, 죽은코드 삭제, CSS 모듈 병합, 서버/클라이언트 컴포넌트 경계 재배치 — 을 마친 뒤 원본과의 등가를 검증한다. 이 레포는 테스트 러너가 없어서 이 절차가 사실상의 테스트 스위트다. "분리해줘", "통합해줘", "리팩토링", "등가 검증", "분할 커밋" 같은 맥락은 물론, 사용자가 명시적으로 요청하지 않더라도 동작 보존 리팩토링 편집을 마쳤다면 커밋 전에 반드시 이 스킬을 적용한다. 기능 추가·버그 수정처럼 동작 변경이 의도된 작업에는 사용하지 않는다.
---

# 리팩토링 등가 검증 (Refactor Equivalence Check)

## 왜 중요한가

이 레포에는 테스트가 없다. 분리/통합/이동/삭제가 "겉보기에 똑같다"는 주장은
아래 결정적 검증을 전부 통과해야만 성립한다.

> jikjikjik 레포와 달리 **여기서는 타입체커와 빌드를 직접 돌릴 수 있다.**
> `tsc --noEmit`은 esbuild 파스보다 훨씬 강한 게이트다 — 1단계를 절대 건너뛰지 말 것.

## 검증 절차 (해당하는 것만, 순서대로)

### 1. 타입 + 린트 + 포맷 + 빌드 — 무조건 먼저

```bash
npm run check && npm run build
```

- `npm run check` = `next typegen` → `tsc --noEmit` → `eslint` → `prettier --check`.
- **`next typegen`이 먼저 도는 게 중요하다.** `typedRoutes`가 켜져 있어 라우트 타입이
  생성돼야 `<Link href>`·`LayoutProps<"/...">`가 검증된다. 파일을 옮겨 라우트가 바뀌었다면
  이 경로로 돌려야 깨진 링크가 잡힌다.
- 기준: **양쪽 다 exit 0.** 하나라도 실패하면 여기서 멈추고 먼저 알린다.
- 이것만으로 잡히는 것: 끊어진 import, 사라진 export, 타입 불일치, 미사용 심볼,
  `"use client"` 누락으로 인한 훅 사용 오류, 깨진 라우트 링크.

### 2. 참조 무결성 — grep 0 확인

타입체커가 못 잡는 **문자열 기반 참조**를 손으로 확인한다.

- 삭제/이동한 심볼·경로를 **4형태**로 검색해 전부 0건:
  1. 정적 `from "..."`
  2. 동적 `import("...")`
  3. bare side-effect import (`import "./x.css"`)
  4. 문자열 참조 (라우트 문자열, `next/dynamic` 경로, CSS `url()`, `@/` alias 문자열)
- JSX가 쓰는 `styles.클래스`가 `.module.css`에 실제 존재하는지(클래스 집합 diff 0),
  역으로 dangling 정의 0.
- **CSS Module은 타입 검사를 받지 않는다** — `styles.존재하지않는클래스`는 `tsc`를 통과하고
  런타임에 `undefined`가 되어 클래스가 조용히 사라진다. 이 단계에서만 잡힌다.
  스타일이 전부 CSS Modules인 이 프로젝트에서는 **여기가 가장 중요한 게이트**다.
- 공용 모듈(`status.module.css`처럼 여러 컴포넌트가 import하는 것)의 클래스를 지웠다면
  **모든 소비처**를 확인한다. 한 곳만 보고 지우면 다른 화면이 조용히 깨진다.

### 3. 토큰 멀티셋 diff — 분리/통합의 렌더 출력 보존

`scripts/token_multiset_diff.py`로 OLD(git의 원본) vs NEW(신규 파일들)의
`styles.` 참조·JSX 엘리먼트·한글 UI 문자열·import 경로 Counter를 비교한다
(**Bash 도구로 실행** — PowerShell은 인라인 env prefix에서 파서 에러):

```bash
PYTHONIOENCODING=utf-8 python .claude/skills/refactor-equivalence-check/scripts/token_multiset_diff.py \
  --old git:HEAD:src/app/xxx/page.tsx --new src/app/xxx/page.tsx src/app/xxx/components/Part.tsx
```

- **OLD 소실 = 0**이 기준(verbatim 분리/이동일 때). NEW 유입은 전부 설명 가능해야 한다.
- 이 프로젝트는 Tailwind를 쓰지 않으므로 **`styles-ref` 소실이 렌더 등가의 핵심 신호**다.
  `classname-literal`에 유틸리티처럼 보이는 토큰(`flex`, `gap-4` …)이 **유입**되면
  Tailwind 클래스가 섞여 들어온 것이니 CSS Module로 되돌린다.
- `korean-string`은 **한글 주석도 집계**한다. 주석 재작성 유래 소실은 등가 위반이 아니므로
  소실 목록에서 주석 문구인지 확인하고 설명으로 소화한다. 주석만 정리한 경우
  `--ignore korean-string`으로 뺄 수 있다.
- ⚠️ 어댑터화처럼 **구조가 바뀌는 통합**은 정당한 소실이 나온다
  (예: `styles.X` → styleKey 문자열 + 동적 `styles[...]`). 이 경우 소실 목록을 하나하나
  설명으로 소화하고, 등가 증명은 4·5단계로 대체한다.

### 4. 서버/클라이언트 경계 이동 — Next 고유 게이트

`"use client"`를 추가·제거하거나 컴포넌트를 경계 너머로 옮겼다면:

- **서버 전용 값이 클라이언트로 새지 않았는지**: `src/lib/env.ts`의 `serverEnv`,
  `process.env`의 non-`NEXT_PUBLIC_` 키가 `"use client"` 파일에서 import되지 않는지 grep.
- **`"use client"` 경계가 위로 올라가지 않았는지**: 경계가 올라가면 하위 트리 전체가
  클라이언트 번들에 들어간다. `npm run build`의 라우트 표에서 `○`(Static)가
  `ƒ`(Dynamic)로 바뀌지 않았는지 **빌드 전후를 비교**한다.
- 서버 컴포넌트에 이벤트 핸들러·`useState`가 남지 않았는지 (1단계에서 대부분 잡히지만,
  props로 함수를 넘기는 경우는 런타임 에러로만 드러난다).

### 5. 대형 변경 마지막 게이트 — 멀티에이전트 3렌즈 적대 검증

500줄급 분리나 컴포넌트 통합은 **렌더 · 배선(props/이벤트) · 훅/임포트** 3렌즈로
"원본과 다른 점을 찾아 반박하라"는 독립 에이전트 검증을 돌리고,
전부 EQUIVALENT일 때만 완료 보고한다.

## 죽은코드 삭제 게이트

- 삭제 전 **3각도**를 모두 확인한다: ①2번의 4형태 grep 0건, ②git 이력에서 의도 폐기 근거
  (트리거를 제거한 커밋), ③대체 기능 존재.
- ⚠️ `src/lib/`·`src/components/` 공용 자산은 지금 미사용이어도 도메인 자산 —
  삭제 전 사용자에게 확인한다.
- ⚠️ App Router의 **규약 파일**(`page.tsx`·`layout.tsx`·`error.tsx`·`not-found.tsx`·`route.ts`)은
  어디서도 import되지 않는다. grep 0건이라고 죽은코드가 아니다. **절대 이 기준으로 지우지 말 것.**

## Windows 함정

- Git Bash에서 `--outfile=/dev/null` / `> /dev/null`은 상황에 따라 리터럴 `nul` 파일을
  레포에 만든다. 임시 출력은 반드시 스크래치패드 경로로 보내고,
  검증 후 `git status --short`로 작업 트리에 잔여물이 없는지 확인한다.
- `.next/`·`tsconfig.tsbuildinfo`·`next-env.d.ts`는 gitignore 대상이라 잔여물 판정에서 제외된다.

## 분할 커밋 연계

한 파일이 여러 커밋 주제에 걸치면: 주제 B 변경을 Edit로 임시 되돌림 → 위 검증 → 주제 A 커밋
→ B 재적용 → 검증 → B 커밋. 마지막에 작업 트리 clean + HEAD가 모든 변경을 포함하는지 확인한다.

## 보고 형식

```
check PASS · build PASS(라우트 표 동일) · 참조 잔존 0 · 멀티셋 diff 0(유입 n건 설명) · [경계 OK] · [3렌즈 EQUIVALENT]
```

한 줄 요약 + 실패 항목은 상세. **하나라도 실패면 커밋을 멈추고 먼저 알린다.**
