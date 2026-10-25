import { isAndroid } from "./platform";
import { useErrorState } from "./ui";
import { useFeedback } from "./ui";
import { SettingsGroup } from "./SettingsGroups";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { Input } from "@/components/motion/input";
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button";
import { listen } from "@tauri-apps/api/event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Bell, KeyRound, Stethoscope, Wifi } from "lucide-react";
import type { Account } from "./types";
import { withCampusSession } from "./service";
import { usePreferences } from "./preferences";
export default function MoreSettings({ account }: { account?: Account }) {
  const setNetworkStatus = useFeedback("info");
  const setMessage = useFeedback("success");
  const { preferences, save, ready } = usePreferences();
  const [networkAccount, setNetworkAccount] = useState(
      preferences.networkAccount || (account?.demo ? "" : account?.id) || "",
    ),
    [password, setPassword] = useState(""),
    [interval, setInterval] = useState(
      String(preferences.networkInterval || 60),
    ),
    [mode, setMode] = useState("keychain"),
    [error, setError] = useErrorState(),
    [busy, setBusy] = useState(false),
    [diagnostics, setDiagnostics] = useState<
      { id: string; name: string; ok: boolean; detail: string }[]
    >([]);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const off = listen<{ message: string }>(
      "campus-network-status",
      ({ payload }) => {
        if (active) setNetworkStatus(payload.message);
      },
    );
    return () => {
      active = false;
      void off.then((stop) => stop());
    };
  }, []);
  useEffect(() => {
    if (ready) {
      setNetworkAccount(
        preferences.networkAccount || (account?.demo ? "" : account?.id) || "",
      );
      setInterval(String(preferences.networkInterval));
    }
  }, [ready, account?.id]);
  useEffect(() => {
    if (account && !account.demo && isTauri())
      void invoke<{ mode: string }>("credential_info", { username: account.id })
        .then((info) => setMode(info.mode))
        .catch(() => {});
  }, [account?.id]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function notifications() {
    if (!isTauri()) return;
    const api = await import("@tauri-apps/plugin-notification");
    if (
      !(await api.isPermissionGranted()) &&
      (await api.requestPermission()) !== "granted"
    )
      throw Error("系统通知未授权，请在系统设置中允许知行通知");
  }
  return (
    <>
      <SettingsGroup
        id="network"
        title="校园网自动重连"
        description="应用运行时按间隔认证，连接恢复后通知。"
      >
        <div className="settings-form-grid">
          <label>
            上网账号
            <Input
              aria-label="校园网上网账号"
              inputMode="numeric"
              autoComplete="username"
              value={String(networkAccount)}
              onChange={(e) => setNetworkAccount(e)}
            />
          </label>
          <label>
            上网密码
            <Input
              aria-label="校园网上网密码"
              type="password"
              autoComplete="current-password"
              value={String(password)}
              onChange={(e) => setPassword(e)}
              placeholder="保存后可留空"
            />
          </label>
          <label>
            认证间隔（秒）
            <Input
              type="number"
              min="1"
              max="3600"
              aria-label="校园网认证间隔"
              inputMode="numeric"
              value={String(interval)}
              onChange={(e) => setInterval(e)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (password)
                  await invoke("network_credentials", {
                    account: networkAccount,
                    password,
                  });
                await save({
                  ...preferences,
                  networkAccount,
                  networkInterval: Number(interval) || 60,
                });
                setPassword("");
                setMessage("校园网设置已保存");
              })
            }
          >
            保存上网设置
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (password)
                  await invoke("network_credentials", {
                    account: networkAccount,
                    password,
                  });
                await save({
                  ...preferences,
                  networkAccount,
                  networkInterval: Number(interval) || 60,
                });
                setPassword("");
                const r = await invoke<{ message: string }>(
                  "reconnect_network",
                );
                setMessage(r.message);
              })
            }
          >
            立即连接
          </Button>
        </div>
        <label className="setting-row">
          <span>
            <strong>启用自动重连</strong>
            <small>校园网密码保存在系统凭据库。</small>
          </span>
          <Switch
            ariaLabel="启用校园网自动重连"
            checked={preferences.networkReconnect}
            disabled={busy}
            onCheckedChange={(e) => {
              const checked = e;
              void run(async () => {
                if (checked) {
                  if (!networkAccount.trim())
                    throw Error("请先填写校园网上网账号");
                  if (password)
                    await invoke("network_credentials", {
                      account: networkAccount,
                      password,
                    });
                  await notifications();
                  setPassword("");
                }
                await save({
                  ...preferences,
                  networkReconnect: checked,
                  networkAccount,
                  networkInterval: Number(interval) || 60,
                });
              });
            }}
          />
        </label>
      </SettingsGroup>
      <SettingsGroup
        id="credentials"
        title="账号凭据保存方式"
        description="选择系统凭据库、本机文件或仅本次使用。"
      >
        <div className="setting-row credential-storage-row">
          <span>
            <strong>{account?.name || "当前账号"}</strong>
            <small>
              {isAndroid
                ? "使用 Android Keystore 加密保存，仅本应用可读取。"
                : "Windows 使用凭据管理器，macOS 使用钥匙串。"}
            </small>
          </span>
          <div className="port-setting credential-storage-controls">
            <Select
              className="credential-storage-picker"
              value={String(mode)}
              onValueChange={(e) => setMode(e)}
            >
              <SelectTrigger>
                <span className="sr-only">{"凭据保存方式"}：</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keychain">
                  {isAndroid
                    ? "Android 安全存储（推荐）"
                    : "系统凭据库（推荐）"}
                </SelectItem>
                <SelectItem value="file">本机文件（保存密码）</SelectItem>
                <SelectItem value="session">仅本次使用</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={busy || !account || account.demo}
              onClick={() =>
                run(async () => {
                  await invoke("change_credential_storage", {
                    username: account!.id,
                    mode,
                  });
                  setMessage("当前账号凭据保存方式已更新");
                })
              }
            >
              应用
            </Button>
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup
        id="diagnostics"
        title="环境诊断"
        description="检查学校连接、验证码、凭据和目录。"
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const rows = isTauri()
                ? await invoke<typeof diagnostics>("environment_diagnostics", {
                    username: account?.demo ? null : (account?.id ?? null),
                  })
                : [];
              try {
                const blob = await (
                  await fetch("/models/diagnostic.png")
                ).blob();
                const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.readAsDataURL(blob);
                });
                const { solveCaptcha } = await import("./captcha");
                const answer = await solveCaptcha(base64);
                rows.push({
                  id: "ocr",
                  name: "本地验证码识别",
                  ok: answer.answer === "11",
                  detail: "模型加载与样本识别正常",
                });
              } catch (e) {
                rows.push({
                  id: "ocr",
                  name: "本地验证码识别",
                  ok: false,
                  detail: String(e),
                });
              }
              setDiagnostics(rows);
            })
          }
        >
          运行诊断
        </Button>
        <div className="diagnostic-list">
          {diagnostics.map((r) => (
            <div key={r.id}>
              <strong className={r.ok ? "teal-text" : "orange-text"}>
                {r.ok ? "正常" : "需处理"} · {r.name}
              </strong>
              <span>{r.detail}</span>
            </div>
          ))}
        </div>
      </SettingsGroup>
    </>
  );
}
