import {
  canInstall,
  requestInstallPermission,
  install,
} from "tauri-plugin-android-installer-api";
export async function openAndroidInstaller(
  path: string,
  version: string,
): Promise<boolean> {
  if (!(await canInstall())) await requestInstallPermission();
  if (!(await canInstall())) return false;
  try {
    localStorage.setItem("zhixing.android-update-target", version);
  } catch {}
  // 完成表示系统安装界面已打开，实际升级在下次启动核对。
  await install(path);
  return true;
}
