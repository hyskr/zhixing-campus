import { useEffect, useState } from "react";
import { Switch } from "@/components/motion/switch";
import {
  autoRestartEnabled,
  canRestartApplication,
  setAutoRestart,
} from "./restart";
export default function UpdateRestartSettings() {
  const [enabled, setEnabled] = useState(autoRestartEnabled),
    [supported, setSupported] = useState(false);
  useEffect(() => {
    let active = true;
    void canRestartApplication()
      .then((value) => {
        if (active) setSupported(value);
      })
      .catch(() => {});
    const sync = () => setEnabled(autoRestartEnabled());
    window.addEventListener("campus:auto-restart-changed", sync);
    return () => {
      active = false;
      window.removeEventListener("campus:auto-restart-changed", sync);
    };
  }, []);
  return (
    <div className="setting-row">
      <span>
        <strong>更新后自动重启</strong>
        <small>
          {supported
            ? "界面更新下载完成或桌面更新安装完成后自动重启；开始更新前请保存编辑内容。"
            : "Android 安装新版后支持自动重启；当前版本请退出并重新打开。"}
        </small>
      </span>
      <Switch
        checked={enabled}
        disabled={!supported}
        onCheckedChange={(value) => {
          setEnabled(value);
          setAutoRestart(value);
        }}
        aria-label="更新后自动重启"
      />
    </div>
  );
}
