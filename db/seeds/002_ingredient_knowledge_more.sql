-- db/seeds/002_ingredient_knowledge_more.sql — 공유 성분 지식 확장 시드 (2026-11-02, 시연 준비)
-- 생성: 헤드리스 Claude 14회(고민 8·피부 타입 4·시너지·충돌), 카탈로그 성분 표기 우선.
-- 검수: 에이전트 반박 검증으로 틀리거나 근거가 약한 항목을 뺐다. 규칙은 001 과 같다(잘 알려진 것만·지어내기 금지·진단 금지).
-- INSERT IGNORE 라 재실행해도 안전하다. 쌍의 a<b 정렬과 같은 쌍 중복 방지는 DB 가 한다(리포트 수확과 같은 SQL).

SET NAMES utf8mb4;

INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('c3d4ee67-2e1d-40ba-87db-d53a4fe23763', 'concern', '건조함', '시어버터', 'helps', '지방산이 풍부해 피부를 부드럽게 하고 수분 증발을 줄여 건조한 피부에 도움이 될 수 있습니다', '지성·여드름성 피부는 무겁게 느낄 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('fe43df63-5c85-4cde-9642-2e07f48ec76c', 'concern', '건조함', '우레아', 'helps', '천연보습인자 성분으로 수분을 끌어당겨 거칠고 건조한 피부의 보습에 쓰입니다', '고농도는 손상되거나 예민한 피부에 따가울 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('70d1348d-ade3-4523-bc1e-ac204b384b65', 'concern', '건조함', '페트롤라툼', 'helps', '피부 표면에 막을 만들어 수분 손실을 줄여 매우 건조한 피부에 도움이 될 수 있습니다', '사용감이 무거워 지성 피부는 양을 조절하세요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('1f7c0734-93fc-4867-933b-d5cbbbdb7d2a', 'concern', '건조함', '콜레스테롤', 'helps', '피부 장벽 지질의 하나로 세라마이드와 함께 장벽을 보완해 건조한 피부에 쓰입니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('a3cfbf4d-9803-40e6-ad39-331bb8f62d53', 'concern', '건조함', '소듐피씨에이', 'helps', '피부 속 천연보습인자 성분으로 수분을 붙잡아 건조한 피부의 보습에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('a069545d-04de-4882-84e0-da29974c4174', 'concern', '건조함', '베타인', 'helps', '수분을 끌어당기는 보습 성분으로 당김이 느껴지는 건조한 피부에 쓰입니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('6c890f9c-bc54-40de-becd-9c22d5dbe1ef', 'concern', '건조함', '트레할로오스', 'helps', '수분을 머금는 당 성분으로 피부의 촉촉함 유지에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('3c11069b-52a5-4386-a790-7051aa8480a1', 'concern', '건조함', '호호바씨오일', 'helps', '피지와 비슷한 성질의 오일로 피부를 부드럽게 하고 건조함 완화에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('06c35c44-239d-4b8d-888c-d1aba200dc9d', 'concern', '여드름·트러블', '레티놀', 'helps', '각질 탈락과 피부 턴오버를 도와 모공 막힘이 잦은 피부에 도움이 될 수 있습니다', '건조·자극이 생길 수 있어 저농도·저녁 사용과 자외선 차단이 권장됩니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('45aca3c5-a0c1-44e8-adba-8c5d8a615230', 'concern', '여드름·트러블', '글라이콜릭애씨드', 'helps', '피부 표면의 묵은 각질 제거를 도와 모공이 막히기 쉬운 피부에 도움이 될 수 있습니다', '자극·자외선 민감도가 높아질 수 있어 자외선 차단이 필요합니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('5bb5c87a-2ae3-4231-a0b4-5ab60c507d2d', 'concern', '여드름·트러블', '카프릴로일살리실릭애씨드', 'helps', '살리실릭애씨드 유도체로 각질과 모공 관리에 쓰여 트러블 피부에 도움이 될 수 있습니다', '과다 사용 시 건조함이나 따가움이 생길 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('e96e73b0-fb09-4799-8f9d-a0e7d9d4a4a1', 'concern', '여드름·트러블', '베타인살리실레이트', 'helps', '순한 BHA 계열로 각질·피지 관리에 쓰여 트러블이 잦은 피부에 도움이 될 수 있습니다', '다른 각질 제거 성분과 겹쳐 쓰면 자극이 생길 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('3250f6b8-468e-4d54-abba-0421d015c3a7', 'concern', '여드름·트러블', '징크피씨에이', 'helps', '피지 조절에 쓰이는 성분으로 유분이 많고 트러블이 잦은 피부에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('ca91c951-04d2-4190-928c-ef1ab4fa0ff8', 'concern', '여드름·트러블', '센텔라아시아티카추출물', 'helps', '진정 효과로 알려져 트러블로 붉어지고 예민해진 피부에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('26177748-84b9-4f74-a08d-106a042a9f1b', 'concern', '여드름·트러블', '녹차추출물', 'helps', '항산화·피지 조절에 쓰여 유분이 많고 트러블이 생기기 쉬운 피부에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('9beb28c5-0cdc-439b-9eab-c59a071030f7', 'concern', '유분·번들거림', '녹차추출물', 'helps', '피지 분비가 많아 번들거리는 피부의 유분 관리에 도움이 될 수 있는 식물 추출물로 쓰입니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('0576127f-fe44-496c-a696-2d6edb4f414f', 'concern', '유분·번들거림', '버지니아풍년화수', 'helps', '수렴 작용으로 번들거림과 모공 정돈에 도움이 될 수 있는 성분으로 쓰입니다', '알코올과 함께 배합된 제품은 건조감을 줄 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('29279526-4540-42f5-bc9c-70908df5cdd9', 'concern', '유분·번들거림', '카프릴로일살리실릭애씨드', 'helps', '모공 속 피지와 각질 관리에 쓰여 유분이 많은 피부에 도움이 될 수 있습니다', '다른 각질 제거 성분과 겹쳐 쓰면 자극이 생길 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('7e83079c-6449-4fca-8ca5-dd39fc3ac3ff', 'concern', '유분·번들거림', '베타인살리실레이트', 'helps', '순한 각질 관리 성분으로 피지가 많은 피부의 모공 관리에 쓰입니다', '각질 제거 제품을 여러 개 겹쳐 쓰지 않는 것이 좋습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('66a41ee1-d815-4ae1-82a3-545aad43b588', 'concern', '유분·번들거림', '티트리오일(티트리잎오일)', 'helps', '유분이 많고 트러블이 잦은 피부의 진정과 피지 관리에 쓰입니다', '고농도 원액은 자극·알레르기 반응이 생길 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('470f077d-a01d-4006-8f1d-556358b4ba39', 'concern', '유분·번들거림', '실리카', 'helps', '피부 표면의 과잉 유분을 흡착해 번들거림을 줄이는 데 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('36d7ded0-15b8-4e3b-85cf-6d221db06748', 'concern', '넓은 모공', '징크피씨에이', 'helps', '피지 분비를 조절하는 데 쓰여, 피지로 모공이 도드라져 보이는 피부에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('2c5b0b09-c38b-47ce-a378-2295f2b72841', 'concern', '넓은 모공', '카올린', 'helps', '피부 표면의 과잉 피지와 노폐물을 흡착해 모공이 덜 도드라져 보이는 데 도움이 될 수 있습니다', '자주 쓰면 건조해질 수 있어 사용 빈도를 조절하세요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('a1c28a5c-359e-4a39-a897-097688f0988a', 'concern', '넓은 모공', '버지니아풍년화수', 'helps', '수렴 작용으로 피부를 정돈해 모공이 덜 눈에 띄도록 하는 데 쓰입니다', '알코올이 함께 든 제품은 건조감을 줄 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('3530dd29-09b2-4746-bd6c-e6772de7a42e', 'concern', '넓은 모공', '카프릴로일살리실릭애씨드', 'helps', '모공 속 각질과 피지를 부드럽게 정리하는 데 쓰여 모공 관리에 도움이 될 수 있습니다', '각질 제거 성분이라 자외선 차단제를 함께 쓰세요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('89733e88-d386-4c28-a9ac-725e621d91af', 'concern', '넓은 모공', '베타인살리실레이트', 'helps', '살리실산 계열로 순하게 모공 속 각질을 정돈하는 데 도움이 될 수 있습니다', '다른 각질 제거 성분과 겹쳐 쓰면 자극이 될 수 있습니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('2e4414fb-5057-473a-8421-b8d88748e0bf', 'concern', '넓은 모공', '락틱애씨드', 'helps', '피부 표면 각질을 정리해 모공 주변이 매끄러워 보이는 데 도움이 될 수 있습니다', '햇빛에 민감해질 수 있어 자외선 차단제를 쓰세요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('b07b2887-f90c-424f-97aa-85962749a0db', 'concern', '넓은 모공', '글루코노락톤', 'helps', '순한 각질 정돈 성분으로, 민감한 피부의 모공 관리에 쓰일 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('295697c4-cb3a-46bb-98eb-622ef2f3aecf', 'concern', '넓은 모공', '녹차추출물', 'helps', '피지 조절과 진정에 쓰여 피지가 많아 모공이 넓어 보이는 피부에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('c6f2d8c7-b38c-432c-af5a-bffd99979ada', 'concern', '색소침착·칙칙함', '아스코빌글루코사이드', 'helps', '비타민C 유도체로, 칙칙해 보이는 피부 톤을 밝게 가꾸는 데 도움이 될 수 있습니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('3c11af1e-4746-40f2-94f4-a5b7a7122c04', 'concern', '색소침착·칙칙함', '3-O-에틸아스코빅애씨드', 'helps', '안정성을 높인 비타민C 유도체로, 멜라닌 생성을 줄여 톤 관리에 쓰입니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('3ab361cd-591c-42f7-b01f-707b2cdcf3cc', 'concern', '색소침착·칙칙함', '글라이콜릭애씨드', 'helps', '묵은 각질 제거를 도와 칙칙한 피부의 톤 정돈에 도움이 될 수 있습니다.', '자극이 있을 수 있어 낮은 농도부터 쓰고 자외선 차단을 함께 하세요.', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('69dafb36-6fba-40ca-accf-563f6b6373b7', 'concern', '색소침착·칙칙함', '락틱애씨드', 'helps', '순한 각질 케어 성분으로, 피부결과 칙칙한 톤 개선에 쓰입니다.', '사용 중에는 자외선에 민감해질 수 있어 차단제를 함께 쓰세요.', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('8ac0590e-0f49-4d89-9509-87963a3a327f', 'concern', '색소침착·칙칙함', '감초뿌리추출물', 'helps', '글라브리딘 등이 들어 있어 멜라닌 생성 억제와 톤 관리에 쓰입니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('7ea1133e-9426-46d2-b174-c496d9e68279', 'concern', '색소침착·칙칙함', '레티놀', 'helps', '피부 턴오버를 도와 고르지 않은 톤과 칙칙함 관리에 도움이 될 수 있습니다.', '임신 중 사용을 피하고, 밤에 소량부터 쓰는 것이 좋습니다.', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('8c619497-7420-4522-bdc8-5054ca89bc12', 'concern', '색소침착·칙칙함', '소듐아스코빌포스페이트', 'helps', '자극이 적은 편인 비타민C 유도체로, 피부 톤 관리에 도움이 될 수 있습니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('88c97973-cc1f-4e80-b4e7-03a0f7605c0a', 'concern', '주름·탄력 저하', '아데노신', 'helps', '피부 탄력 유지에 쓰이며, 주름이 신경 쓰이는 피부의 경우 관리에 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('fc24f59b-d979-4b0c-9c94-d126c702966e', 'concern', '주름·탄력 저하', '글라이콜릭애씨드', 'helps', '묵은 각질 정리를 도와 잔주름이 신경 쓰이는 피부의 경우 결 관리에 도움이 될 수 있습니다', '자극·햇빛 민감도가 오를 수 있어 자외선 차단이 필요합니다', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('a91b9d75-a528-4db5-b1a0-9ade432910f3', 'concern', '주름·탄력 저하', '유비퀴논', 'helps', '항산화 성분으로 쓰여 탄력 저하가 신경 쓰이는 피부의 경우 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('99b10672-127f-4bfa-875c-c38f485f8b05', 'concern', '주름·탄력 저하', '히알루론산(소듐하이알루로네이트)', 'helps', '수분을 붙잡아 건조로 도드라진 잔주름이 신경 쓰이는 피부의 경우 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('df95c8f5-b94d-4805-b1cb-c5b1757d6b54', 'concern', '주름·탄력 저하', '하이드롤라이즈드콜라겐', 'helps', '피부 표면 보습에 쓰여 탄력이 부족해 보이는 피부의 경우 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('3d36019c-f260-48bf-95db-33fde9b3b13a', 'concern', '각질·피부결', '카프릴로일살리실릭애씨드', 'helps', '살리실릭애씨드 유도체로 각질을 천천히 녹여 피부결을 정돈하는 데 도움이 될 수 있습니다', '각질 제거 성분과 겹쳐 쓰면 자극이 생길 수 있어요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('374ad1b3-f96a-40c8-a15f-8e814c2c512b', 'concern', '각질·피부결', '베타인살리실레이트', 'helps', '순한 BHA 대용 성분으로 묵은 각질과 거친 피부결 관리에 쓰입니다', '다른 산 성분과 함께 쓰면 자극이 생길 수 있어요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('0c845571-e429-40c5-8991-718527ce148d', 'concern', '각질·피부결', '만델릭애씨드', 'helps', '분자가 큰 AHA라 비교적 천천히 작용해 각질 관리에 도움이 될 수 있습니다', '사용 중에는 자외선 차단제를 함께 쓰는 것이 좋아요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('e65e87c8-c667-481a-b0de-ef3764c463a1', 'concern', '각질·피부결', '레티놀', 'helps', '피부 턴오버를 도와 거칠어진 피부결을 매끄럽게 가꾸는 데 쓰입니다', '초기 건조·붉어짐이 있을 수 있고 임신 중엔 피하세요', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('00e472f7-4a98-4e71-84fd-1b5addbf29b9', 'concern', '각질·피부결', '파파인', 'helps', '파파야 유래 효소로 각질 단백질을 분해해 부드러운 각질 관리에 쓰입니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('ecf294d7-f785-4be9-a0cb-d0e59c9906d2', 'concern', '각질·피부결', '프로테아제', 'helps', '단백질 분해 효소로 묵은 각질을 순하게 정리하는 데 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('dc3b4e8a-9f6f-476f-adc6-e24a7355f5da', 'concern', '각질·피부결', '나이아신아마이드', 'helps', '장벽을 돕고 거친 피부결과 칙칙함을 정돈하는 데 도움이 될 수 있습니다', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('cf46246e-208a-42dd-92ab-4ceb58798293', 'concern', '민감·홍조', '다이포타슘글리시리제이트', 'helps', '감초에서 얻은 진정 성분으로, 붉어지고 예민한 피부를 진정시키는 데 도움이 될 수 있습니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('adf21ee9-4b9f-4064-9352-98a3763e23fb', 'concern', '민감·홍조', '비사보롤', 'helps', '캐모마일 유래 진정 성분으로, 자극받아 붉어진 피부를 가라앉히는 데 쓰입니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('c1a9efa4-3ac6-4b03-9b75-15c10cf831d5', 'concern', '민감·홍조', '아시아티코사이드', 'helps', '병풀 유래 성분으로, 예민해진 피부를 진정시키고 장벽 회복을 돕는 데 쓰입니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('0549458d-728b-4319-8705-15a8f4ef5cf3', 'concern', '민감·홍조', '나이아신아마이드', 'helps', '피부 장벽을 강화해 민감·홍조 피부의 붉은 기 완화에 도움이 될 수 있습니다.', '고농도에서 일시적으로 따가움이나 홍조를 느낄 수 있습니다.', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('29fd4513-6bc7-424b-bc76-02cadb7d8ebd', 'concern', '민감·홍조', '엑토인', 'helps', '외부 자극과 건조로부터 피부를 보호해 민감 피부의 진정에 도움이 될 수 있습니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('4ad6adf0-988c-46be-8531-faafc449c171', 'concern', '민감·홍조', '귀리커넬추출물', 'helps', '건조하고 가려운 민감 피부를 진정시키고 보습하는 데 쓰입니다.', '귀리 알레르기가 있다면 사용 전 확인하세요.', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('b227ffe5-0525-42d9-a73b-be6619b18c90', 'concern', '민감·홍조', '캐모마일꽃추출물', 'helps', '진정 효과로 알려져 예민하고 붉어진 피부 관리에 도움이 될 수 있습니다.', '국화과 식물 알레르기가 있다면 주의하세요.', 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('1a1d3954-7285-4114-9165-7944f0ad183c', 'concern', '민감·홍조', '녹차추출물', 'helps', '항산화·진정 작용으로 자극받은 민감 피부의 붉은 기 완화에 쓰입니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('361eff83-da1c-40eb-b2a1-4abacc5e6c1d', 'skin_type', '건성', '글라이콜릭애씨드', 'caution', '각질을 녹이는 AHA라 건성 피부는 당김·자극을 느끼기 쉬워요. 저농도로 주 1~2회부터 쓰고 보습을 함께 하세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('921c2703-dee9-4665-9fd9-ba09f4715aa4', 'skin_type', '건성', '에탄올', 'caution', '빠르게 날아가며 수분을 함께 빼앗아 건조함이 심해질 수 있어요. 성분표 앞쪽에 있다면 보습제를 덧바르세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('dc1dab83-eb43-4e09-8484-fe5048af66be', 'skin_type', '건성', '소듐C14-16올레핀설포네이트', 'caution', '세정력이 강한 계면활성제라 피부 유분을 과하게 씻어낼 수 있어요. 짧게 헹구고 세안 뒤 바로 보습하세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('a01d29b5-4e70-437c-a920-314809cb81e8', 'skin_type', '건성', '향료', 'caution', '건조해 장벽이 약해진 피부에는 자극이 될 수 있어요. 처음 쓰는 제품은 좁은 부위에 먼저 써 보세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('d0fb1e40-7278-4d0f-a0d8-4e49a934f340', 'skin_type', '건성', '티트리오일(티트리잎오일)', 'caution', '정유 성분이라 건조한 피부에 따가움이나 건조감을 줄 수 있어요. 낮은 농도 제품을 고르고 보습을 함께 하세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('fcd3a2fc-e84f-4eec-a7f4-da5a53f3693b', 'skin_type', '건성', '아이소프로필알코올', 'caution', '휘발성 알코올이라 피부를 건조하게 만들 수 있어요. 자주 바르는 제품보다는 씻어내는 제품에서 쓰는 편이 무난해요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('b6ae79ce-0b0a-4545-9bfa-e1d4a6c85bea', 'skin_type', '지성', '라놀린', 'caution', '밀폐력이 강하고 무거운 사용감이라 피지가 많은 피부에서는 답답함이나 모공 막힘이 느껴질 수 있어요. 소량을 건조한 부위에만 쓰는 편이 무난해요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('7a99d815-ab6a-4867-98ef-d6f6804c3647', 'skin_type', '지성', '파라핀', 'caution', '피부 표면에 막을 형성해 유분감이 남기 쉬워요. 지성 피부라면 가벼운 제형을 고르거나 건조한 부위에 국소적으로 쓰는 것이 좋아요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('03f7d0e2-b99e-4c2f-ae84-c7b3160f6c44', 'skin_type', '지성', '시어버터', 'caution', '보습력이 높지만 리치한 제형이라 지성 피부에는 번들거림이 생길 수 있어요. 함량이 낮은 제품이나 밤에 소량 쓰는 방식이 무난해요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('b88fcc3f-34ac-4c29-9180-c9e7e748e00a', 'skin_type', '지성', '에틸헥실팔미테이트', 'caution', '유연제로 쓰이는데 모공을 막을 수 있는 성분으로 자주 언급돼요. 트러블이 잦다면 사용 후 피부 반응을 살펴보세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('91c7eb5b-2695-4778-9437-cd5b6733f02e', 'skin_type', '지성', '올레익애씨드', 'caution', '피지에 많은 지방산으로, 지성·트러블 피부에서는 부담이 될 수 있다고 알려져 있어요. 씻어내는 제품이나 소량 함유 제품부터 시도해 보세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('6de9e15b-c1bc-43cd-ac0f-29cb6dc7cda5', 'skin_type', '지성', '올리브오일', 'caution', '올레산 비율이 높아 무겁게 느껴질 수 있어 지성 피부는 주의가 필요해요. 클렌징 용도나 건조한 부위에 적은 양으로 쓰는 편이 무난해요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('d0313fe1-8e1b-4dfc-b05e-31ebcef2296e', 'skin_type', '복합성', '코코스누시페라(코코넛)오일', 'caution', '모공을 막기 쉬운 오일로 알려져 피지가 많은 T존에 부담이 될 수 있어요. 건조한 볼 위주로 소량만 쓰는 편이 무난해요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('130d76b8-864c-4214-9f28-760901af7fad', 'skin_type', '복합성', '페트롤라툼', 'caution', '막을 두껍게 씌우는 보습제라 유분이 많은 부위는 답답할 수 있어요. 건조한 부위에만 얇게 바르는 방법이 쓰여요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('80dee939-149b-469d-9722-51c74614817f', 'skin_type', '복합성', '라놀린', 'caution', '무거운 보습 성분이라 T존에서는 번들거림이나 트러블이 생길 수 있어요. 건조한 볼·입가에만 쓰는 편이 좋아요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('d24354c1-460e-4332-b55e-851f9db2194f', 'skin_type', '복합성', '파라핀', 'caution', '피부를 덮어 수분 증발을 막는 성분이라 피지가 많은 부위는 답답할 수 있어요. 건조한 부위 위주로 가볍게 쓰세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('df486429-5248-4138-9e8b-68c7a50249f4', 'skin_type', '복합성', '글라이콜릭애씨드', 'caution', '각질 제거에 쓰이지만 건조한 볼에는 자극이 될 수 있어요. 낮은 농도로 T존부터 주 1~2회 시작하는 편이 무난해요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('b1a19e2e-6ac2-47d4-97db-1c068cc5d8c5', 'skin_type', '민감성', '레티놀', 'caution', '초기에 건조·붉어짐·따가움이 생기기 쉽습니다. 저농도로 주 2~3회 저녁에 시작하고 보습제와 자외선 차단제를 함께 쓰세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('840e923f-b2c8-4fe9-83fb-89ec70a5022a', 'skin_type', '민감성', '살리실릭애씨드', 'caution', '각질 제거 성분이라 자극·건조를 느낄 수 있습니다. 저농도 제품을 짧게 쓰고 다른 각질 제거제와 겹치지 않게 하세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('1e21d133-a6ad-47cb-ae9e-613e887b4483', 'skin_type', '민감성', '락틱애씨드', 'caution', 'AHA 계열이라 따가움이나 붉어짐이 생길 수 있습니다. 저농도로 격일부터 쓰고 다음 날 자외선 차단을 챙기세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('e73e39c7-6c66-43d2-bc3e-e73e896d1d56', 'skin_type', '민감성', '아스코빅애씨드', 'caution', '산성 환경에서 쓰여 따가움을 느낄 수 있습니다. 저농도부터 쓰거나 유도체 형태를 고려하고 반응을 지켜보세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('ad3c2683-d603-4b14-bafe-20b023d21f7d', 'skin_type', '민감성', '리날룰', 'caution', '향 성분으로 산화되면 접촉 알레르기를 일으킬 수 있습니다. 반응 이력이 있다면 무향 제품을 고르는 것이 무난합니다.', NULL, 'seed');
INSERT IGNORE INTO ingredient_effects (id, scenario_kind, scenario, ingredient, relation, description, caution, source)
VALUES ('abe4792d-f4a4-4999-a276-d4dd560b20b2', 'skin_type', '민감성', '베르가모트오일', 'caution', '광독성 성분을 포함할 수 있어 햇빛 노출 시 자극이 생길 수 있습니다. 낮에는 피하고 패치 테스트 후 쓰세요.', NULL, 'seed');
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'conflict', 'AHA와 BHA를 겹쳐 쓰면 각질이 과하게 제거돼 붉어짐·따가움이 커질 수 있어요. 하루씩 번갈아 쓰거나 한 제품만 쓰는 것이 좋아요.', 'seed'
  FROM (SELECT CONVERT('락틱애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('살리실릭애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'conflict', '둘 다 낮은 pH의 산 성분이라 함께 쓰면 자극이 커질 수 있어요. 비타민C는 아침, 락틱애씨드는 저녁으로 나눠 쓰는 것이 좋아요.', 'seed'
  FROM (SELECT CONVERT('락틱애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('아스코빅애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'conflict', '각질 제거와 건조 작용이 겹쳐 건조함·벗겨짐·자극이 심해질 수 있어요. 아침·저녁으로 나누거나 날을 번갈아 쓰는 것이 좋아요.', 'seed'
  FROM (SELECT CONVERT('락틱애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('벤조일퍼옥사이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '둘 다 수분을 끌어당기는 보습 성분이라 함께 쓰면 촉촉함을 더 오래 유지하는 데 도움이 될 수 있어요. 세안 직후 약간 젖은 피부에 바르고 크림으로 마무리하세요.', 'seed'
  FROM (SELECT CONVERT('글리세린' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('히알루론산(소듐하이알루로네이트)' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '히알루론산이 수분을 채우고 세라마이드가 장벽을 받쳐 수분이 날아가는 것을 줄이는 데 쓰여요. 묽은 히알루론산 제품 다음에 세라마이드 크림을 아침저녁으로 바르세요.', 'seed'
  FROM (SELECT CONVERT('세라마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('히알루론산(소듐하이알루로네이트)' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '파이토스핑고신은 세라마이드의 구성 성분이라 함께 배합되어 피부 장벽 지질을 보충하는 데 쓰여요. 보습 단계에서 아침저녁 꾸준히 바르세요.', 'seed'
  FROM (SELECT CONVERT('세라마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('파이토스핑고신' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '나이아신아마이드와 징크피시에이는 모두 피지 조절에 쓰여 번들거림이 고민일 때 함께 쓰기 좋아요. 토너나 세럼 단계에서 아침저녁 바르세요.', 'seed'
  FROM (SELECT CONVERT('나이아신아마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('징크피시에이' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '나이아신아마이드는 피부 장벽 강화에 도움을 줄 수 있어 세라마이드와 함께 쓰면 보습 효과를 받쳐 줘요. 나이아신아마이드 세럼 뒤 세라마이드 크림 순서로 바르세요.', 'seed'
  FROM (SELECT CONVERT('나이아신아마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('세라마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '나이아신아마이드는 피부 톤, 아데노신은 주름 개선에 쓰여 서로 다른 고민을 함께 관리할 수 있어요. 세럼·크림 단계에서 아침저녁 바르면 됩니다.', 'seed'
  FROM (SELECT CONVERT('나이아신아마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('아데노신' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '마데카소사이드의 진정과 세라마이드의 장벽 보습이 맞물려 예민해진 피부 관리에 자주 함께 쓰여요. 세안 후 진정 세럼, 세라마이드 크림 순으로 바르세요.', 'seed'
  FROM (SELECT CONVERT('마데카소사이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('세라마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '판테놀은 보습·진정을, 세라마이드는 장벽 지질 보충을 맡아 건조하고 예민한 피부에 함께 쓰여요. 아침저녁 보습 단계에서 바르세요.', 'seed'
  FROM (SELECT CONVERT('판테놀' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('세라마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '스쿠알란이 피부를 부드럽게 감싸 세라마이드로 채운 장벽의 수분 손실을 줄이는 데 도움이 될 수 있어요. 세라마이드 크림 뒤 스쿠알란 오일을 소량 덧바르세요.', 'seed'
  FROM (SELECT CONVERT('스쿠알란' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('세라마이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '스쿠알란의 유연 효과가 레티놀 사용 시 생길 수 있는 건조함과 각질을 완화하는 데 쓰여요. 저녁에 레티놀을 바르고 스쿠알란으로 덮어 주세요.', 'seed'
  FROM (SELECT CONVERT('레티놀' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('스쿠알란' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '살리실릭애씨드는 모공 속 각질을, 티트리는 트러블 피부 관리에 쓰여 여드름성 피부용 제품에 자주 함께 들어가요. 저녁에 트러블 부위 위주로 쓰세요.', 'seed'
  FROM (SELECT CONVERT('살리실릭애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('티트리오일(티트리잎오일)' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '각질 제거 후 예민해질 수 있는 피부를 판테놀이 진정·보습해 주는 데 도움이 될 수 있어요. 살리실릭애씨드를 먼저 바르고 판테놀 크림으로 마무리하세요.', 'seed'
  FROM (SELECT CONVERT('살리실릭애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('판테놀' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '서로 다른 방식으로 멜라닌 관련 과정에 작용해 칙칙함·잡티 관리용 미백 제품에 함께 쓰여요. 세럼 단계에서 아침저녁 바르고 낮에는 자외선 차단제를 쓰세요.', 'seed'
  FROM (SELECT CONVERT('알파-알부틴' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('트라넥사믹애씨드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
INSERT IGNORE INTO ingredient_pairs (id, ingredient_a, ingredient_b, kind, description, source)
SELECT UUID(), LEAST(t.x, t.y), GREATEST(t.x, t.y), 'synergy', '티타늄디옥사이드는 UVB, 징크옥사이드는 UVA까지 넓게 막아 무기자차에 함께 쓰여요. 아침 스킨케어 마지막 단계에 충분히 바르고 수시로 덧바르세요.', 'seed'
  FROM (SELECT CONVERT('징크옥사이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS x,
               CONVERT('티타늄디옥사이드' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS y) AS t
 WHERE t.x <> t.y
   AND NOT EXISTS (SELECT 1 FROM ingredient_pairs p WHERE p.ingredient_a = LEAST(t.x, t.y) AND p.ingredient_b = GREATEST(t.x, t.y));
