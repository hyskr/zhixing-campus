import { invoke, isTauri } from "@tauri-apps/api/core";
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
  apkUrl?: string;
  versionCode?: number;
  downloadedPath?: string;
}
export async function latestRelease(): Promise<ReleaseInfo> {
  if (isTauri()) return invoke<ReleaseInfo>("update_release");
  const response = await fetch(
    "https://github.com/hyskr/zhixing-campus/releases/latest/download/latest.json",
    {
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw Error(`获取更新信息失败（HTTP ${response.status}）`);
  const data = await response.json();
  return {
    version: data.version,
    notes: data.notes ?? "",
    url: RELEASES_URL + "/latest",
    date: data.pub_date ?? "",
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
  await update.download(onEvent, { timeout: 30 * 60_000 });
  onInstalling();
  await update.install();
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) =>
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(value);
  const next = parse(candidate),
    installed = parse(current);
  if (!next || !installed) return false;
  for (let index = 1; index <= 3; index++) {
    if (+next[index] !== +installed[index])
      return +next[index] > +installed[index];
  }
  if (!next[4] || !installed[4]) return !next[4] && !!installed[4];
  const a = next[4].split("."),
    b = installed[4].split(".");
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === undefined) return false;
    if (b[index] === undefined) return true;
    if (a[index] === b[index]) continue;
    const numericA = /^\d+$/.test(a[index]),
      numericB = /^\d+$/.test(b[index]);
    if (numericA && numericB) return +a[index] > +b[index];
    if (numericA !== numericB) return !numericA;
    return a[index] > b[index];
  }
  return false;
}
export function shouldRemindUpdate(
  version: string,
  previous: { version: string; at: number } | null,
  now = Date.now(),
) {
  return (
    !previous ||
    previous.version !== version ||
    now - previous.at >= 24 * 60 * 60_000
  );
}
