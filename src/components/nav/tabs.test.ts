import { describe, expect, it } from "vitest";

import { isActiveTab } from "./tabs";

describe("isActiveTab", () => {
  it("하위 경로에서도 그 탭이 켜진다 (3라운드 I13 — /routine/new 에서 활성 표시 0)", () => {
    expect(isActiveTab("/routine/new", "/routine")).toBe(true);
    expect(isActiveTab("/routine", "/routine")).toBe(true);
  });

  it("홈은 정확히 / 일 때만 — 모든 경로의 접두사라서", () => {
    expect(isActiveTab("/", "/")).toBe(true);
    expect(isActiveTab("/scan", "/")).toBe(false);
  });

  it("이름이 겹치는 형제 경로는 켜지 않는다", () => {
    expect(isActiveTab("/routines", "/routine")).toBe(false);
  });
});
