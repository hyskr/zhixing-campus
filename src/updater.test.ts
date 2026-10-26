import { invoke, isTauri } from "@tauri-apps/api/core";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  installUpdate,
  latestRelease,
  isNewerVersion,
  shouldRemindUpdate,
} from "./updater";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(invoke).mockReset();
});
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it("从正式发布读取版本号、说明和发布页面", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: "0.12.0",
        notes: "更新说明",
        html_url:
          "https://github.com/hyskr/zhixing-campus/releases/tag/v0.12.0",
        pub_date: "2026-10-23T00:00:00Z",
      }),
    }),
  );
  expect(await latestRelease()).toMatchObject({
    version: "0.12.0",
    notes: "更新说明",
    date: "2026-10-23T00:00:00Z",
  });
});
it("更新信息失败保留 HTTP 状态", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(latestRelease()).rejects.toThrow("HTTP 503");
});
it("下载完成后才进入安装，下载失败不安装", async () => {
  const order: string[] = [];
  const download = vi.fn(async () => {
    order.push("download");
  });
  const install = vi.fn(async () => {
    order.push("install");
  });
  const update = { download, install } as unknown as Update;
  await installUpdate(update, vi.fn(), () => {
    order.push("installing");
  });
  expect(order).toEqual(["download", "installing", "install"]);
  expect(download).toHaveBeenCalledWith(expect.any(Function), {
    timeout: 1_800_000,
  });
  download.mockRejectedValueOnce(Error("签名无效"));
  install.mockClear();
  await expect(installUpdate(update, vi.fn(), vi.fn())).rejects.toThrow(
    "签名无效",
  );
  expect(install).not.toHaveBeenCalled();
});

it("桌面版本信息走原生静态清单，绕开 GitHub API 和 WebView 请求", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue({
    version: "0.13.1",
    notes: "修复版本查询",
    date: "2026-10-23T00:00:00Z",
    url: "https://github.com/hyskr/zhixing-campus/releases/latest",
  });
  const fetch = vi.fn().mockRejectedValue(Error("HTTP 403"));
  vi.stubGlobal("fetch", fetch);
  expect((await latestRelease()).version).toBe("0.13.1");
  expect(invoke).toHaveBeenCalledWith("update_release");
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["0.17.1", "0.17.0", true],
  ["0.17.0", "0.17.0", false],
  ["0.16.9", "0.17.0", false],
  ["0.10.0", "0.9.9", true],
  ["1.0.0", "1.0.0-beta.2", true],
  ["1.0.0-beta.10", "1.0.0-beta.2", true],
  ["1.0.0-beta.2", "1.0.0", false],
])("比较新版 %s 与已安装 %s", (next, current, expected) => {
  expect(isNewerVersion(next, current)).toBe(expected);
});
it("同一版本一天内不重复提醒，新版本立即提醒", () => {
  const now = 1_000_000_000,
    previous = { version: "0.17.1", at: now };
  expect(shouldRemindUpdate("0.17.1", null, now)).toBe(true);
  expect(shouldRemindUpdate("0.17.1", previous, now + 6 * 60 * 60_000)).toBe(
    false,
  );
  expect(shouldRemindUpdate("0.17.1", previous, now + 24 * 60 * 60_000)).toBe(
    true,
  );
  expect(shouldRemindUpdate("0.17.2", previous, now + 60_000)).toBe(true);
});
