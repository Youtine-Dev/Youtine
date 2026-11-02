-- 008_ingredient_roles — 성분 하나가 화장품에서 하는 역할(한두 문장), 공유 지식
--
-- 왜 필요한가 (2026-11-02, 사용자 결정 "AI 한 줄 설명 + 저장"):
--   제품 모달의 성분 칩을 누르면 "이 성분이 뭐 하는지"를 보여 준다. 기존 지식
--   (ingredient_effects·ingredient_pairs)은 실측 제품 성분 721종 중 22종(3%)만 덮어
--   정제수·부틸렌글라이콜 같은 기본 성분은 비어 있다. 처음 누른 성분만 헤드리스 Claude 로
--   만들고 여기 저장해 이후 모든 사용자에게 즉시 준다(/api/ai/ingredient-role).
--   계획서: docs/plans/2026-11-02-ingredient-role/README.md
--
-- 키:
--   name_key = nameKey(canonicalIngredient(라벨 원문)) — 소문자·공백 제거한 대표명.
--   "레티놀(0.1%)"·"Retinol"·"부틸렌 글라이콜"/"부틸렌글라이콜" 이 각각 한 행으로 모인다.
--
-- 적용 방법:
--   mysql -h <host> -u <user> -p <database> < db/migrations/008_ingredient_roles.sql
--
-- 규칙(001 과 동일): 이 파일을 고치지 말고 009 를 추가한다. 테이블을 DROP 하지 않는다.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ingredient_roles (
  name_key    VARCHAR(100) NOT NULL PRIMARY KEY,
  -- 사람이 읽는 대표명(canonicalIngredient 결과) — 프롬프트 입력과 같은 값
  name        VARCHAR(100) NOT NULL,
  -- NULL = 모델이 "널리 알려진 역할을 확신할 수 없다"고 답함(규칙 1·4). 이것도 답이라
  -- 저장해 같은 성분으로 AI 를 다시 사지 않는다. 다시 만들려면 그 행을 지운다.
  role        VARCHAR(500) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('008')
ON DUPLICATE KEY UPDATE version = version;
