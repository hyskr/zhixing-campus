import {
  check,
  type Update,
  type DownloadEvent,
} from "@tauri-apps/plugin-updater";

export const RELEASES_URL = "https://github.com/hyskr/zhixing-campus/releases";
export interface ReleaseInfo {
  version: string;
  notes: string;
  url: string;
  date: string;
}
export async function latestRelease(): Promise<ReleaseInfo> {
  const response = await fetch(
    "https://api.github.com/repos/hyskr/zhixing-campus/releases/latest",
    {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw Error(`获取更新信息失败（HTTP ${response.status}）`);
  const data = await response.json();
  return {
    version: data.tag_name.replace(/^v/, ""),
    notes: data.body ?? "",
    url: data.html_url,
    date: data.published_at,
  };
}
export async function checkUpdate() {
  return check({ timeout: 20_000 });
}
// 使用 Tauri 官方签名验证与安装流程：https://v2.tauri.app/plugin/updater/
export async function installUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void,
  onInstalling: () => void,
) {
  await update.download(onEvent);
  onInstalling();
  await update.install();
}
