import { useErrorState } from "./ui";
import { useFeedback } from "./ui";
import { SettingsGroup, SettingsGroups } from "./SettingsGroups";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { useState } from "react";
import { Button } from "@/components/motion/button";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Download, FolderUp, KeyRound, RefreshCw } from "lucide-react";
import { PageHeading } from "./Pages";
import AppUpdateSettings from "./AppUpdater";
import MoreSettings from "./MoreSettings";
import AppearanceSettings from "./AppearanceSettings";
import NotificationSettings from "./NotificationSettings";
import { usePreferences } from "./preferences";
import type { Account, Preferences } from "./types";
export default function Settings({ account }: { account?: Account }) {
  const setStatus = useFeedback("info");
  const { preferences, ready, save } = usePreferences();
  const [busy, setBusy] = useState(false),
    [error, setError] = useErrorState();
  const [port, setPort] = useState<string>();
  async function update(patch: Partial<Preferences>) {
    setBusy(true);
    setError("");
    try {
      await save({ ...preferences, ...patch });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setError("");
    try {
      const r = await invoke<{
        connected: boolean;
        quickAvailable: boolean;
        elapsedMs: number;
      }>("learning_status", { username: account!.id });
      setStatus(
        `${r.connected ? "课程平台已连接" : "课程平台尚未连接"} · ${r.quickAvailable ? "已保存本人快速登录凭据" : "正常登录后可获取快速登录凭据"} · 检测 ${r.elapsedMs} ms`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = !ready || busy;
  return (
    <div className="settings-page">
      <PageHeading
        eyebrow="PREFERENCES"
        title="设置"
        description="按自己的习惯，让校园日常更顺手。"
      />
      <SettingsGroups>
        <AppUpdateSettings />
        <SettingsGroup
          id="appearance"
          title="界面风格"
          description="即时预览，选择适合自己的工作空间。"
        >
          <AppearanceSettings />
        </SettingsGroup>
        <SettingsGroup
          id="login"
          title="登录与连接"
          description="课程平台登录恢复与连接设置。"
        >
          <label className="setting-row">
            <span>
              <strong>极速恢复课程平台登录</strong>
              <small>
                使用本人正常登录时取得的凭据，快速恢复作业、课件与回放连接；失败时自动使用
                MIS。
              </small>
            </span>
            <Switch
              ariaLabel="极速恢复课程平台登录"
              checked={preferences.quickLogin}
              disabled={disabled}
              onCheckedChange={(e) => void update({ quickLogin: e })}
            />
          </label>
          <div className="setting-foot">
            <span>
              默认开启，可随时关闭。凭据仅在本机使用；勾选记住登录时存入系统凭据库。
            </span>
            {account && !account.demo && isTauri() && (
              <Button
                size="sm"
                variant="secondary"
                onClick={check}
                disabled={busy}
              >
                <RefreshCw size={13} />
                检测连接
              </Button>
            )}
          </div>
        </SettingsGroup>
        <SettingsGroup
          id="downloads"
          title="下载"
          description="并行任务数量与课件下载端口。"
        >
          <label className="setting-row">
            <span>
              <strong>同时下载数量</strong>
              <small>对之后加入的下载任务生效。</small>
            </span>
            <Select
              value={String(preferences.downloadConcurrency)}
              disabled={disabled}
              onValueChange={(e) =>
                void update({ downloadConcurrency: Number(e) })
              }
            >
              <SelectTrigger>
                <span className="sr-only">{"同时下载数量"}：</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 6, 8].map((n) => (
                  <SelectItem value={String(n)} key={n}>
                    {n} 个文件
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="setting-row">
            <span>
              <strong>未开放课件下载端口</strong>
              <small>默认 1936，使用学校课件的 /kk/rp/ 路径。</small>
            </span>
            <form
              className="port-setting"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(port ?? preferences.resourcePort);
                if (!Number.isInteger(value) || value < 1 || value > 65535) {
                  setError("请输入 1–65535 之间的端口");
                  return;
                }
                void update({ resourcePort: value });
              }}
            >
              <Input
                aria-label="未开放课件下载端口"
                type="number"
                min="1"
                max="65535"
                value={String(port ?? preferences.resourcePort)}
                onChange={(event) => setPort(event)}
                disabled={disabled}
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={disabled}
              >
                保存端口
              </Button>
            </form>
          </div>
        </SettingsGroup>
        <SettingsGroup
          id="uploads"
          title="上传与文件记录"
          description="记录保存和附件复用。"
        >
          <label className="setting-row">
            <span>
              <strong>保存已上传文件记录</strong>
              <small>保存文件名、地址与上传时间。</small>
            </span>
            <Switch
              ariaLabel="保存已上传文件记录"
              checked={preferences.saveUploads}
              disabled={disabled}
              onCheckedChange={(e) => void update({ saveUploads: e })}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>复用已上传文件</strong>
              <small>
                选择相同文件名、大小与修改时间的文件时，询问是否复用已有上传。
              </small>
            </span>
            <Switch
              ariaLabel="复用已上传文件"
              checked={preferences.reuseUploads}
              disabled={disabled}
              onCheckedChange={(e) => void update({ reuseUploads: e })}
            />
          </label>
        </SettingsGroup>
        <NotificationSettings account={account} />
        <MoreSettings account={account} />
      </SettingsGroups>
    </div>
  );
}
