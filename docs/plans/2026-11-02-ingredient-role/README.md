# 제품 모달 성분 칩 → 성분 역할 한 줄 설명 (AI + 공유 캐시)

## Context

제품 상세 모달(`PopularProductModal` — 스캔 › 선반·인기, 홈 성분 알림, 성분별 제품에서 공용)의
성분 칩을 누르면 "이 성분이 화장품에서 무슨 역할을 하는지" 작은 모달로 보여 달라는 요청(2026-11-02).

기존 성분 지식(`ingredient_effects`·`ingredient_pairs`)으로는 답이 안 된다 — 테스트 DB 실측으로
제품 81개의 성분 721종 중 **22종(3%)**, 등장 횟수로 18%만 지식이 있다. 정제수·부틸렌글라이콜 같은
기본 성분은 비어 있다. 그래서 역할 설명은 새로 만든다.

## 결정 확정 (2026-11-02)

- **사용자 결정**: "AI 한 줄 설명 + 저장" — 처음 누른 성분만 헤드리스 Claude 로 1–2문장을 만들고
  DB 에 성분 단위로 저장해 이후 모든 사용자에게 즉시 준다. 기존 지식이 있으면 함께 보여 준다.
  (기각: 기존 상세 모달 재사용 — 대부분 "정보 없음" / 등록 시 미리 생성 — AI 호출량 과다)

### 구현 판단 (조사 근거: 규약 조사 워크플로 4영역, 2026-11-02)

| 항목          | 판단                                                         | 근거                                                                                                    |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 저장 키       | `nameKey(canonicalIngredient(원문))`                         | 원문 키는 `레티놀(0.1%)`·`Retinol` 이 갈라진다. canonical 만으론 내부 공백 차이를 못 접는다             |
| 프롬프트 입력 | `canonicalIngredient(원문)` (원문 금지)                      | 원문 괄호에 문장을 끼우면 그 답이 공유 설명으로 영구 저장된다                                           |
| 남용 방지     | AI 호출 전 "카탈로그에 있는 성분인가" 확인                   | 임의 문자열로 AI 를 돌리는 공개 프록시가 되지 않게. 캐시 적중은 확인 없이 즉시                          |
| `role: null`  | 저장한다(재호출 안 함)                                       | concern·warnings 선례. 한계: 잘못된 null 이 굳는다 → 행 삭제로 재생성                                   |
| 모달 위치     | `PopularProductModal.tsx` 안 로컬 함수, 포털 없이 overlay 안 | `IngredientDetailModal` 재사용은 순환 import(상세→제품목록→제품모달→상세)                               |
| Esc           | 제품 모달에 m9 가드 + 작은 모달에 `stopImmediatePropagation` | 가드가 없어 Esc 한 번에 둘 다 닫힌다                                                                    |
| 칩 범위       | 제품 모달만. 검색 모달(저장 전 AI 추출값)은 제외             | 오독된 이름의 설명이 공유 DB 에 쌓인다                                                                  |
| 재시도 UX     | `Resource` 에 `validating` 을 **추가만** 한다                | 재시도 중에도 에러 화면이 10–30초 남는 문제(SWR 은 성공해야 error 를 지운다). 기존 소비처 동작은 그대로 |

## 변경 대상 파일

| 파일 경로                                         | 작업 요약                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `db/migrations/008_ingredient_roles.sql`          | 신규 테이블 `ingredient_roles(name_key PK, name, role NULL, created_at)` |
| `src/instrumentation.ts`                          | `EXPECTED_SCHEMA_VERSION` 007 → 008                                      |
| `README.md`                                       | 스키마 범위 표기 001–007 → 001–008                                       |
| `src/lib/ingredientNames.ts`                      | `nameKey` export (재구현 금지)                                           |
| `src/lib/prompts/ingredientRole.ts`               | 프롬프트 + 응답 좁히기 `parseIngredientRole`                             |
| `src/lib/prompts/ingredientRole.test.ts`          | 좁히기 함수 Vitest                                                       |
| `src/app/api/ai/ingredient-role/route.ts`         | POST — 캐시 → 카탈로그 확인 → 가드 → AI → 저장                           |
| `src/api/ai.ts`                                   | `fetchIngredientRole({ name })`                                          |
| `src/lib/data.ts`                                 | `useIngredientRole(name)` (AI_SWR_OPTIONS), `Resource.validating` 추가   |
| `src/app/scan/components/PopularProductModal.tsx` | 칩 → 버튼, 작은 모달, Esc 가드                                           |
| `src/app/scan/components/productModal.module.css` | 칩 버튼·작은 시트 스타일                                                 |

## 구현 순서

- Step 1: 마이그레이션 + 스키마 버전 + `nameKey` export
- Step 2: 프롬프트·좁히기 함수 + 테스트 (`ai-contract-check` 적용)
- Step 3: 라우트
- Step 4: 클라이언트 함수·훅
- Step 5: 칩 버튼 + 작은 모달 + Esc 가드
- Step 6: 검증 — 로컬 QA DB 에 008 적용, 실제 빌드로 브라우저 실측, `ai-contract-prober` 로 성분 여러 개 병렬 호출

## 검증

- `npm run check` · `npm run build` 통과
- `ai-contract-check`: 프롬프트 출력 스키마(`{ role: string | null }`)와 좁히기 함수 대조
- `ai-contract-prober`: 일반 성분·기능성 성분·영문 INCI·화장품 성분 아님 — 규칙 준수(길이·null·진단 표현 금지)
- 브라우저(QA DB): 스캔 › 선반 → 제품 → 성분 칩 → 첫 생성(경과 초) → 다시 열면 즉시 / Esc 한 번에 작은 모달만 /
  포커스가 칩으로 복귀 / 360px 칩 터치 영역 / 라이트·다크

## 배포 시 필수

- ⚠️ **운영 DB 에 008 을 먼저 적용**한다(자동 러너 없음). 안 하면 캐시 조회·저장이 실패해 매번 AI 를 부르고
  저장도 안 된다(라우트는 캐시 실패를 경고만 하고 진행하도록 짠다 — 기능은 살아 있되 비용이 샌다).

## 비범위 (Out of Scope)

- 검색 결과 모달(저장 전) 칩
- 제품 등록 시 미리 생성(사용자 기각)
- `useResource` 의 에러 표시 동작 변경(공용 — 추가 필드만 넣는다)
- 오래된 설명 갱신·관리 화면

## 진행 상태

- [x] Step 1–6 — 완료 2026-11-02(미커밋). 신규 5파일(마이그레이션·프롬프트·테스트·라우트·계획서) + 수정 8파일.
      `npm run check` 통과(14파일 120 테스트), `npm run build` 통과, 로컬 QA DB 에 008 적용.
  - **AI 계약 실측**(`ai-contract-prober` 3갈래 병렬, 11성분): 스키마·규칙 위반 0. 길이 54–83자, 1–2문장,
    진단·치료 표현 0. 첫 생성 4–8초(코드 주석의 10–30초보다 빠름), 캐시 적중 10–80ms.
    주입 문구를 넣은 이름(QA 전용 시험 제품, 시험 후 삭제) → 모델이 `null`.
  - **브라우저 실측**(360px, 실제 빌드): 칩 → 작은 모달 → 대기(경과 초)·기존 지식 줄 즉시 → 설명 도착 /
    Esc 1회 = 작은 모달만, 포커스 칩 복귀 / Esc 2회 = 둘 다 닫힘·스크롤 잠금 해제 / 라이트·다크.
  - **코드 리뷰**(워크플로 3관점 + 발견별 반박 검증) CONFIRMED 3건 수정: ① 재시도 시 포커스가 body 로 빠짐 →
    재시도 직전 닫기 버튼으로 ② 칩 A 생성 중 칩 B 가 429 에러 화면 → 앞 요청을 기다렸다 1회 재요청
    (실측: 에러 0회, 14초 뒤 설명) ③ 칩 터치 영역 42px → 44px(`::after` 기준은 padding box).
  - **프로브 발견 2건 수정**: SYNONYMS 에 없는 이름은 원문이 프롬프트에 들어감 → `isPromptSafeName`
    (60자·문장 부호 관문, 실측 카탈로그 721종 최대 39자·문장 부호 0) / `글리콜릭애씨드` 표기 누락 → 동의어 추가.
  - 남긴 관찰: Hexyl Nicotinate 설명이 "입술 볼륨 제품"을 예로 듦(규칙 4 경계, 위반 아님) · Tasmannia 추출물 설명이 빈약.
  - ⚠️ **배포 전 운영 DB 에 008 적용 필요**(위 "배포 시 필수").
