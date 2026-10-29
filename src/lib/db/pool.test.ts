import type { Pool } from "mysql2/promise";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withTransaction } from "@/lib/db/pool";

// getPool() 은 이 전역이 있으면 그대로 쓴다 — 실 DB 없이 트랜잭션 제어 흐름만 본다.
const globalForPool = globalThis as typeof globalThis & { __alPool?: Pool };

function fakeConnection(rollback: () => Promise<void> = async () => {}) {
  const conn = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(rollback),
    release: vi.fn(),
    destroy: vi.fn(),
  };
  globalForPool.__alPool = {
    getConnection: async () => conn,
  } as unknown as Pool;
  return conn;
}

const conflict = (errno: number) =>
  Object.assign(new Error(`conflict ${errno}`), { errno });

afterEach(() => {
  delete globalForPool.__alPool;
  vi.restoreAllMocks();
});

describe("withTransaction", () => {
  // 3라운드 m19 — 신규 제품 동시 등록의 ER_CHECKREAD(1020)·데드락(1213)
  it.each([1020, 1213])(
    "충돌 %i 은 콜백을 처음부터 한 번 더 돌린다",
    async (errno) => {
      const conn = fakeConnection();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(conflict(errno))
        .mockResolvedValueOnce("ok");

      await expect(withTransaction(fn)).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
      expect(conn.beginTransaction).toHaveBeenCalledTimes(2);
      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    },
  );

  it("재시도는 한 번뿐 — 두 번째 충돌은 그대로 던진다", async () => {
    fakeConnection();
    const second = conflict(1020);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(conflict(1020))
      .mockRejectedValueOnce(second);

    await expect(withTransaction(fn)).rejects.toBe(second);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("충돌이 아닌 오류는 재시도하지 않는다", async () => {
    fakeConnection();
    const fn = vi.fn().mockRejectedValueOnce(conflict(1062));

    await expect(withTransaction(fn)).rejects.toThrow("conflict 1062");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // 3라운드 m10 — rollback 오류가 원래 오류를 덮던 문제
  it("rollback 이 실패해도 원래 오류를 던지고 커넥션은 풀에 돌려주지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const conn = fakeConnection(async () => {
      throw new Error("connection lost");
    });
    const original = conflict(1020);

    await expect(
      withTransaction(async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    // 롤백 상태를 모르는 커넥션으로 재시도하지 않는다.
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
  });
});
