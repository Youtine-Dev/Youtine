// youtine 적대적 코드리뷰 워크플로 템플릿.
// Workflow 도구로 실행. FINDERS(도메인)·KNOWN_INTENTIONAL(사전 제외)·기준 브랜치만 갱신해 쓴다.
//
// ★ 모델 핀: 파인더·검증 에이전트는 전원 REVIEW_MODEL='fable'로 고정 →
//   이 스크립트를 돌리는 세션 모델이 Opus여도 리뷰 판단은 Fable 5로 수행된다.
//   종합·상위 건 재확인·수정은 세션 모델(오케스트레이터)이 이어받는다.
//
// ⚠️ 실행 전에 `src/` 실제 구조를 확인하고 FINDERS를 존재하는 범위로만 채울 것.
//    없는 경로를 주면 파인더가 빈손으로 돌아온다.

export const meta = {
  name: "adversarial-code-review",
  description:
    "youtine 광역 코드리뷰 — 파인더 fan-out → dedup → 발견별 반박 검증 (리뷰 에이전트 Fable 5 핀)",
  phases: [
    { title: "Find", detail: "도메인×렌즈 파인더 병렬 (Fable 5)" },
    { title: "Verify", detail: "발견별 반박 검증 (Fable 5)" },
  ],
};

// 리뷰 판단 품질을 세션 모델과 무관하게 상위 티어로 고정.
const REVIEW_MODEL = "fable";

// 비교 기준 브랜치. 회귀 추적용.
const BASE = "main";

// 의도된 결정 — 버그로 오탐하지 말 것. AGENTS.md·README.md·직전 리뷰 md에서 최신화해 온다.
const KNOWN_INTENTIONAL = `
- API raw 응답 정책 — src/api/ 는 백엔드 raw 응답을 그대로 반환하고, 키 변경/한글화/derived 필드는
  훅·컴포넌트에서만 한다. API 계층에 변환이 없는 것은 "누락"이 아니라 정책이다.
- TypeScript 5.9 / ESLint 9 고정 — 최신(TS 7 / ESLint 10)을 안 쓰는 것은 호환성 때문에 의도한 것이다.
  TS 7은 typescript-eslint 미지원으로 lint가 죽고, ESLint 10은 eslint-config-next 의존 플러그인과 충돌한다.
- next/react/react-dom 정확 버전 고정(캐럿 없음) — 프레임워크 마이너 드리프트 방지용 의도.
- **Tailwind 미사용은 팀 결정이다.** tailwindcss·@tailwindcss/postcss·postcss.config.mjs 가
  없는 것은 "설정 누락"이 아니다. 스타일은 전부 CSS Modules 로 작성한다.
  globals.css 가 전역 리셋(box-sizing·margin 0·button/a 초기화)을 직접 들고 있는 것도
  preflight 대체용으로 의도된 것이다 — 중복이라고 지우라고 하지 말 것.
  반대로 **Tailwind 유틸리티 클래스가 코드에 섞여 있으면 그것이 major 위반**이다.
- Pretendard를 next/font/local 이 아니라 jsDelivr CDN <link>로 로드 — 폰트 바이너리를 아직
  레포에 넣지 않아서다. CLS 지적은 minor로만.
- CSP(Content-Security-Policy) 미설정 — v1 범위에서 의도적으로 제외했다. 나머지 보안 헤더는 설정돼 있다.
- .env.example 이 커밋되는 것 — 값 없는 템플릿이라 의도된 것이다(.gitignore에 ! 예외 있음).
- AGENTS.md 상단의 nextjs-agent-rules 블록 — next dev 가 자동 생성하며 커밋하는 것이 정상이다.
`;

const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          title: { type: "string" },
          severity: { type: "string", enum: ["major", "minor"] },
          description: { type: "string" },
          evidence: { type: "string" },
        },
        required: [
          "file",
          "line",
          "title",
          "severity",
          "description",
          "evidence",
        ],
      },
    },
  },
  required: ["findings"],
};

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    isReal: { type: "boolean" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    correctedSeverity: {
      type: "string",
      enum: ["major", "minor", "not-a-bug"],
    },
    failureScenario: { type: "string" },
    conventionOnly: { type: "boolean" },
  },
  required: [
    "isReal",
    "confidence",
    "correctedSeverity",
    "failureScenario",
    "conventionOnly",
  ],
};

// 도메인 × 렌즈. 각 파인더는 담당 파일을 전량 정독 + git으로 회귀 추적.
// ⚠️ 아래는 예시다. 실제 src/ 구조를 확인하고 존재하는 범위로 갱신할 것.
const FINDERS = [
  {
    key: "api",
    scope:
      "src/api — client.ts(fetch 래퍼·에러 처리·credentials) + 도메인별 모듈",
  },
  {
    key: "lib",
    scope: "src/lib — env.ts(서버/클라이언트 노출 경계) 및 공용 유틸",
  },
  {
    key: "app-shell",
    scope:
      "src/app — layout.tsx·error.tsx·not-found.tsx·globals.css (전역 셸·메타데이터·토큰)",
  },
  {
    key: "routes",
    scope:
      "src/app 하위 라우트 page.tsx 전체 — 서버/클라이언트 경계, 데이터 페칭",
  },
  {
    key: "config",
    scope:
      "next.config.ts·tsconfig.json·eslint.config.mjs·middleware(있다면) — 보안 헤더·rewrite·타입 설정",
  },
];

const finderPrompt = (
  f,
) => `너는 youtine(Next.js 16 App Router / React 19 / TypeScript, c:/Work/AL-front)의 적대적 코드리뷰 파인더다.
담당 범위: ${f.scope}
이 범위의 파일을 **전량 정독**하고, \`git diff ${BASE}...HEAD -- <path>\`와 \`git show ${BASE}:<path>\`로 원본 대비 회귀도 추적하라.

우선 렌즈:
- 서버/클라이언트 경계 — serverEnv·비-NEXT_PUBLIC_ 환경변수가 "use client" 파일로 새는가. "use client"가 불필요하게 상위로 올라가 번들이 부푸는가.
- 데이터 정합성 — 점수 집계·아이템 사용·상점 구매 등 되돌릴 수 없는 상태 변경.
- 비동기 레이스 — out-of-order fetch, stale closure, 중복 제출.
- 리소스 누수 — EventSource(SSE)·타이머·구독의 cleanup 누락.
- 계약 위반 — 백엔드 DTO와 프론트 타입 불일치.
- UX 계약 — 실패 시 상태, 빈값 시맨틱, 로딩 중 중복 제출.

백엔드 계약이 의심되면 c:/Work/animal-league-04-back 의 dto/·controller/<도메인>/res/·entity/ 를 직접 읽어라.
⚠️ src/main/resources/ (application-*.yml 등 자격 증명)는 절대 열지 말 것.

★ 아래는 의도된 결정이라 버그로 보고하지 말 것:
${KNOWN_INTENTIONAL}

각 발견은 file/line/title/severity(major=데이터 정합성·보안 직결)/description/evidence(구체 코드 근거)로.
재현 경로가 없으면 넣지 마라.`;

const verifyPrompt = (
  f,
) => `너는 적대적 검증자다. 아래 코드리뷰 발견이 **버그가 아님을 증명**하는 게 기본 스탠스다.
발견: [${f.severity}] ${f.file}:${f.line} — ${f.title}
설명: ${f.description}
근거: ${f.evidence}

해당 파일과 그 소비처를 직접 열어 확인하라. **구체 재현 시나리오**(실제 입력·상태 → 잘못된 출력/부작용)를
만들 수 없으면 isReal=false로 기각한다.
아래 의도된 결정에 해당하면 not-a-bug다:
${KNOWN_INTENTIONAL}
버그는 아니지만 컨벤션 위반(any 사용·hex 하드코딩·주석 누락 등)이면 isReal=false + conventionOnly=true로.`;

// 발견 dedup 키 (파일+라인±2줄+제목 정규화). 라인 근접·동일 제목은 한 건으로.
const dedupeKey = (f) =>
  `${f.file}|${Math.round(f.line / 3)}|${f.title.replace(/\s+/g, "").slice(0, 24)}`;

phase("Find");
const rawArrays = await parallel(
  FINDERS.map(
    (f) => () =>
      agent(finderPrompt(f), {
        label: `find:${f.key}`,
        phase: "Find",
        schema: FINDINGS_SCHEMA,
        model: REVIEW_MODEL,
        effort: "high",
      }),
  ),
);
const raw = rawArrays.filter(Boolean).flatMap((r) => r.findings);

// dedup (barrier 후 평범한 코드 — cross-item 병합)
const seen = new Set();
const deduped = [];
for (const f of raw) {
  const k = dedupeKey(f);
  if (seen.has(k)) continue;
  seen.add(k);
  deduped.push(f);
}
log(`원시 ${raw.length} → dedup ${deduped.length}`);

phase("Verify");
const verified = await parallel(
  deduped.map(
    (f) => () =>
      agent(verifyPrompt(f), {
        label: `verify:${f.file}:${f.line}`,
        phase: "Verify",
        schema: VERDICT_SCHEMA,
        model: REVIEW_MODEL,
        effort: "high",
      }).then((v) => ({ ...f, verdict: v })),
  ),
);

const alive = verified.filter(Boolean);
const confirmed = alive.filter((v) => v.verdict.isReal);
const refuted = alive.filter((v) => !v.verdict.isReal);

// 오케스트레이터(세션 모델)가 이 결과로 상위 건 직접 재확인 → review-md-template.md 형식으로 md 작성.
return {
  stats: {
    raw: raw.length,
    deduped: deduped.length,
    confirmed: confirmed.length,
    refuted: refuted.length,
    conventionOnly: refuted.filter((v) => v.verdict.conventionOnly).length,
  },
  confirmed,
  refuted,
};
