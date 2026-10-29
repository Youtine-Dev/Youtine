"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";

import { api } from "@/api/client";
import { load, remove } from "@/lib/storage/local";
import type {
  Product,
  Routine,
  RoutineRun,
  SkinProfile,
} from "@/types/skincare";

/**
 * 서버로 옮기기 전에 쓰던 **옛 localStorage 키**들이다.
 *
 * 이 컴포넌트가 유일한 소비처라 상수 파일 대신 여기 둔다(`storage/products.ts`·
 * `storage/routines.ts` 는 이관과 함께 삭제됐다).
 * ⚠️ 값을 고치면 옛 데이터를 못 찾고 **조용히 이관이 안 된다.** `local.ts` 가
 * `al:v1:` 접두사를 붙이므로 여기는 접두사 없는 원래 키만 적는다.
 */
const OLD_KEYS = {
  products: "products",
  routines: "routines",
  profile: "skin-profile",
  runs: "runs",
} as const;

type Counts = Record<"products" | "routines" | "profile" | "runs", number>;

/**
 * localStorage → 서버 1회 이관.
 *
 * 저장소를 서버로 바꾸기 전에 쓰던 사용자는 기기 안에 제품·루틴·기록을 갖고 있다.
 * 그대로 두면 앱을 열었을 때 **전부 사라진 것처럼 보인다.**
 *
 * 화면을 그리지 않는다(`null`). 대부분의 사용자는 옮길 데이터가 없어 아무 일도 일어나지 않고,
 * 있더라도 사용자가 할 수 있는 일이 없어 알림이 방해만 된다.
 *
 * ⚠️ **성공했을 때만 로컬을 비운다.** 실패하면 그대로 두고 다음 진입 때 다시 시도한다 —
 * 여기서 비우면 서버에도 없고 기기에도 없는 상태가 된다.
 *
 * `RunStart`(수행 중 표시)는 옮기지도, 지우지도 않는다. 기기별 임시 상태다.
 */
export function MigrateLocalData() {
  // StrictMode 는 effect 를 두 번 실행한다. 이관은 멱등하지만 왕복을 두 번 할 이유는 없다.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const products = load<Product[]>(OLD_KEYS.products, []);
    const routines = load<Routine[]>(OLD_KEYS.routines, []);
    const runs = load<RoutineRun[]>(OLD_KEYS.runs, []);
    const profile = load<SkinProfile | null>(OLD_KEYS.profile, null);

    const empty =
      products.length === 0 &&
      routines.length === 0 &&
      runs.length === 0 &&
      profile === null;
    if (empty) return;

    void (async () => {
      try {
        const { migrated, rejected } = await api.post<{
          ok: boolean;
          // 키 이름은 api/migrate/route.ts 의 반환 모양과 같다.
          migrated: Counts;
          // 검증 탈락(손상·길이·개수 초과) — 다시 보내도 같은 결과다(3라운드 m9).
          rejected: Counts;
        }>("/migrate", { products, routines, runs, profile });

        /*
         * 서버가 **모든 항목을 판정했을 때만**(받음 + 탈락 = 보낸 수) 지운다.
         * 판정되지 않은 항목이 있으면 지우지 않는다 — 여기서 지우면 복구 불가 손실이다.
         * 예전엔 받음만 비교해서 탈락 1건에도 로컬이 남아 방문마다 전체를 재이관했다.
         */
        const expected = [
          ["products", products.length],
          ["routines", routines.length],
          ["runs", runs.length],
          ["profile", profile === null ? 0 : 1], // 프로필은 단일 객체라 0/1 로 센다
        ] as const;
        const missing = expected
          .filter(([key, count]) => migrated[key] + rejected[key] < count)
          .map(
            ([key, count]) =>
              `${key} ${count - migrated[key] - rejected[key]}건`,
          );

        if (missing.length > 0) {
          console.warn(
            `[migrate] 서버가 일부만 판정했습니다(${missing.join(", ")} 누락) — 로컬을 유지합니다.`,
          );
          return;
        }
        if (Object.values(rejected).some((count) => count > 0)) {
          console.warn("[migrate] 검증에서 탈락해 옮기지 못한 항목:", rejected);
        }

        // 전량 서버에 들어갔다. 이제 로컬은 지운다 — 두 곳에 두면 어느 쪽이 최신인지 알 수 없다.
        // 성공은 조용히 지나간다(사용자가 할 일이 없다). 실패만 아래에서 알린다.
        for (const key of Object.values(OLD_KEYS)) remove(key);

        // 화면은 이미 서버 데이터(SWR)를 그린 뒤다. 재검증하지 않으면 이관분이
        // 재포커스 전까지 안 보인다. 키 문자열은 src/lib/data.ts 의 KEYS 와 같다.
        await Promise.all(
          ["/products", "/routines", "/runs", "/profile"].map((key) =>
            mutate(key),
          ),
        );
      } catch (error: unknown) {
        // 로컬은 그대로 남는다. 다음 진입 때 다시 시도된다.
        console.warn(
          "[migrate] 이관 실패 — 다음 접속 때 다시 시도합니다:",
          error,
        );
      }
    })();
  }, []);

  return null;
}
