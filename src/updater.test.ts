import { afterEach, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { installUpdate, latestRelease } from "./updater";
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it("从正式发布读取版本号、说明和发布页面", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: "v0.12.0",
          body: "更新说明",
          html_url:
            "https://github.com/hyskr/zhixing-campus/releases/tag/v0.12.0",
          published_at: "2026-10-23T00:00:00Z",
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
  expect(download).toHaveBeenCalledWith(expect.any(Function), { timeout: 1_800_000 });
  download.mockRejectedValueOnce(Error("签名无效"));
  install.mockClear();
  await expect(installUpdate(update, vi.fn(), vi.fn())).rejects.toThrow(
    "签名无效",
  );
  expect(install).not.toHaveBeenCalled();
});
