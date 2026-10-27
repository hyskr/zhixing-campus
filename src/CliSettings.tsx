import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Terminal, Copy } from "lucide-react";
import { Button } from "@/components/motion/button";
import { SettingsGroup } from "./SettingsGroups";
import { useErrorState, useFeedback } from "./ui";
import { copyText } from "./learning";
import { isAndroid } from "./platform";
type CliInfo = {
  bundled: boolean;
  executable: string;
  command: string;
  dataDirectory: string;
};
export default function CliSettings() {
  const [info, setInfo] = useState<CliInfo | null>(null),
    [busy, setBusy] = useState(false);
  const [, setError] = useErrorState(),
    feedback = useFeedback();
  useEffect(() => {
    if (!isTauri() || isAndroid) return;
    void invoke<CliInfo>("cli_info")
      .then(setInfo)
      .catch((reason) => setError(String(reason)));
  }, []);
  if (isAndroid) return null;
  return (
    <SettingsGroup
      id="credentials"
      title="命令行与 AI 调用"
      description="CLI 随桌面应用一起安装，直接使用已保存的校园账号和登录态。"
    >
      <div className="setting-row">
        <span>
          <strong>
            <Terminal size={16} /> 安装终端命令
          </strong>
          <small>
            {info?.bundled
              ? "安装一次即可在终端与 AI 工具中调用 zhixing；应用更新并启动后，终端命令自动同步更新。"
              : "当前开发环境尚未包含 CLI，正式桌面安装包中会一并提供。"}
          </small>
        </span>
        <Button
          variant="secondary"
          disabled={!info?.bundled || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await invoke<{ message: string }>("install_cli");
              feedback(result.message);
            } catch (error) {
              setError(String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在安装…" : "安装 zhixing 命令"}
        </Button>
      </div>
      <div className="cli-command-example">
        <code>zhixing course list --refresh --output json</code>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void copyText("zhixing course list --refresh --output json")
              .then(() => feedback("调用命令已复制"))
              .catch((error) => setError(String(error)))
          }
        >
          <Copy size={14} />
          复制示例
        </Button>
      </div>
      {info?.executable && (
        <p className="setting-foot">CLI 路径：{info.executable}</p>
      )}
    </SettingsGroup>
  );
}
