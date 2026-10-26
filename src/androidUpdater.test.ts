import { afterEach, expect, it, vi } from "vitest";
import {
  canInstall,
  install,
  requestInstallPermission,
} from "tauri-plugin-android-installer-api";
import { openAndroidInstaller } from "./androidUpdater";
import { androidManifest } from "../scripts/android-manifest";
vi.mock("tauri-plugin-android-installer-api", () => ({
  canInstall: vi.fn(),
  install: vi.fn(),
  requestInstallPermission: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("未授权时引导授权，返回后允许才打开安装界面", async () => {
  vi.mocked(canInstall)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem });
  expect(await openAndroidInstaller("/cache/update.apk", "0.18.0")).toBe(true);
  expect(requestInstallPermission).toHaveBeenCalledOnce();
  expect(install).toHaveBeenCalledWith("/cache/update.apk");
  expect(setItem).toHaveBeenCalledWith(
    "zhixing.android-update-target",
    "0.18.0",
  );
});
it("拒绝授权保留下载，不启动安装", async () => {
  vi.mocked(canInstall).mockResolvedValue(false);
  expect(await openAndroidInstaller("/cache/update.apk", "0.18.0")).toBe(false);
  expect(install).not.toHaveBeenCalled();
});
it("已授权直接安装，启动失败传递错误", async () => {
  vi.mocked(canInstall).mockResolvedValue(true);
  vi.mocked(install).mockRejectedValue(Error("无法打开安装器"));
  await expect(
    openAndroidInstaller("/cache/update.apk", "0.18.0"),
  ).rejects.toThrow("无法打开安装器");
  expect(requestInstallPermission).not.toHaveBeenCalled();
});
it("Android 清单使用独立正式 tag 和 APK 原生版本号", () => {
  expect(
    androidManifest(
      "0.18.0",
      18000,
      123,
      "android-v0.18.0",
      "说明",
      "2026-10-26",
    ),
  ).toMatchObject({
    versionCode: 18000,
    size: 123,
    apkUrl:
      "https://github.com/hyskr/zhixing-campus/releases/download/android-v0.18.0/zhixing-campus_0.18.0_android-arm64.apk",
  });
  expect(() =>
    androidManifest("0.18.0", 18000, 123, "android-v0.18.0-preview.1", ""),
  ).toThrow("stable");
});
