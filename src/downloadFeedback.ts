import { invoke, isTauri } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";
import { showFeedback, dismissFeedback } from "./ui";
import type { DownloadItem } from "./types";
export function showDownloads(accountId?: string) {
  const open = () =>
    window.dispatchEvent(
      new CustomEvent("campus:open-downloads", { detail: { accountId } }),
    );
  if (document.fullscreenElement)
    void document.exitFullscreen().then(open, open);
  else open();
}
export const downloadAction = (accountId?: string) => ({
  label: "查看下载",
  onClick: () => showDownloads(accountId),
});
let notificationSetup: Promise<void> | undefined;
let actionsSetup: Promise<void> | undefined;
export function registerDownloadActions() {
  if (!isTauri()) return Promise.resolve();
  actionsSetup ??= import("@tauri-apps/plugin-notification").then((api) =>
    api.registerActionTypes([
      {
        id: "campus-downloads",
        actions: [
          { id: "view-downloads", title: "查看下载", foreground: true },
        ],
      },
    ]),
  );
  return actionsSetup;
}
async function prepareNotifications() {
  if (!isTauri() || !isAndroid) return;
  notificationSetup ??= (async () => {
    try {
      const api = await import("@tauri-apps/plugin-notification");
      await registerDownloadActions();
      const granted =
        (await api.isPermissionGranted()) ||
        (await api.requestPermission()) === "granted";
      if (!granted)
        showFeedback(
          "下载会继续；允许系统通知后可收到完成提醒",
          "info",
          downloadAction(),
          "download-permission",
        );
    } catch {
      showFeedback(
        "无法获取系统通知权限，下载结果仍可在应用中查看",
        "info",
        downloadAction(),
        "download-permission",
      );
    }
  })();
  await notificationSetup;
}
export async function requestDownload<T>(
  task: () => Promise<T>,
  accountId: string,
  message = "正在准备下载…",
) {
  showFeedback(
    message,
    "loading",
    downloadAction(accountId),
    "download-request",
    { duration: 0, description: "可以继续浏览，任务会显示在下载管理中。" },
  );
  void prepareNotifications();
  let result: T;
  try {
    result = await task();
  } catch (error) {
    dismissFeedback("download-request");
    throw error;
  }
  if (result === false)
    showFeedback("已取消选择下载位置", "info", undefined, "download-request");
  return result;
}
export function queueDownloads(username: string, items: DownloadItem[]) {
  return requestDownload(
    () => invoke<boolean>("download_items", { username, items }),
    username,
    items.length === 1
      ? `正在准备下载：${items[0].name}`
      : `正在准备 ${items.length} 个文件…`,
  );
}
