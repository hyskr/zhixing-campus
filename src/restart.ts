import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { isAndroid } from "./platform";
import { isNewerVersion } from "./updater";
export function autoRestartEnabled() {
  try {
    return localStorage.getItem("zhixing.update-auto-restart") !== "false";
  } catch {
    return true;
  }
}
export function setAutoRestart(enabled: boolean) {
  try {
    localStorage.setItem("zhixing.update-auto-restart", String(enabled));
  } catch {}
  window.dispatchEvent(new Event("campus:auto-restart-changed"));
}
export async function canRestartApplication() {
  if (!isTauri()) return false;
  if (!isAndroid) return true;
  const version = await getVersion();
  return version === "0.19.0" || isNewerVersion(version, "0.19.0");
}
export async function restartApplication() {
  if (!(await canRestartApplication()))
    throw Error(
      "当前 Android 安装版需要先升级完整安装包，暂请退出并重新打开应用",
    );
  if (isAndroid) await invoke("restart_application");
  else await relaunch();
}
