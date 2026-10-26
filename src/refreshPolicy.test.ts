import { expect, it } from "vitest";
import { needsRefresh } from "./refreshPolicy";
import { emptyData } from "./types";
const now = Date.parse("2026-10-26T12:00:00+08:00");
it("首次启动没有缓存时刷新", () => {
  expect(needsRefresh(emptyData(), "all", now)).toBe(true);
});
it("完整同步后复用新鲜模块缓存", () => {
  const data = emptyData();
  data.syncedAt = { all: new Date(now - 30_000).toISOString() };
  expect(needsRefresh(data, "mail", now)).toBe(false);
});
it("模块使用自己的时间和刷新间隔", () => {
  const data = emptyData();
  data.syncedAt = {
    all: new Date(now).toISOString(),
    mail: new Date(now - 60_000).toISOString(),
    schedule: new Date(now - 60_000).toISOString(),
  };
  expect(needsRefresh(data, "mail", now)).toBe(true);
  expect(needsRefresh(data, "schedule", now)).toBe(false);
});
it("无效时间触发刷新", () => {
  const data = emptyData();
  data.lastSync = "invalid";
  expect(needsRefresh(data, "all", now)).toBe(true);
});
