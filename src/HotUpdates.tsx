import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  check,
  download,
  currentBundle,
  notifyAppReady,
  onDownloadProgress,
  type CheckOutcome,
  type CurrentBundle,
} from "tauri-plugin-hot-update-api";
import { SettingsGroup } from "./SettingsGroups";
import { Button } from "@/components/motion/button";
import { showFeedback, dismissFeedback, useFeedback } from "./ui";
function useHotUpdates() {
  const [bundle, setBundle] = useState<CurrentBundle>(),
    [outcome, setOutcome] = useState<CheckOutcome>(),
    [busy, setBusy] = useState(false),
    [staged, setStaged] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const working = useRef(false),
    lastCheck = useRef(0),
    inspectRef = useRef<(automatic?: boolean) => Promise<void>>(async () => {});
  const feedback = useFeedback();
  async function inspect(automatic = false) {
    if (working.current || staged) return;
    working.current = true;
    lastCheck.current = Date.now();
    setBusy(true);
    setError("");
    try {
      const value = await check();
      setOutcome(value);
      if (value.status === "alreadyStaged") setStaged(value.version);
      if (automatic && value.status === "available") {
        const key = `zhixing.hot-update-reminder.${value.manifest.version}`;
        let reminded = false;
        try {
          reminded = !!sessionStorage.getItem(key);
          sessionStorage.setItem(key, "1");
        } catch {}
        if (!reminded)
          showFeedback(
            `可更新界面 ${value.manifest.version}`,
            "info",
            {
              label: "查看更新",
              onClick: () => {
                dismissFeedback("frontend-update");
                window.dispatchEvent(new Event("campus:open-updates"));
              },
            },
            "frontend-update",
            { description: "下载后在下次重新打开应用时生效。", duration: 0 },
          );
      }
    } catch (reason) {
      if (!automatic) {
        setError(String(reason));
        feedback(String(reason), "error");
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  inspectRef.current = inspect;
  useEffect(() => {
    if (!isTauri()) return;
    let stopped = false;
    // 挂载后的确认独立于学校接口与登录结果。
    const ready = window.setTimeout(() => {
      void notifyAppReady()
        .then(() => currentBundle())
        .then((value) => {
          if (!stopped) setBundle(value);
        })
        .catch((reason) => {
          if (!stopped) setError(String(reason));
        });
    }, 0);
    const due = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        Date.now() - lastCheck.current >= 6 * 60 * 60_000
      )
        void inspectRef.current(true);
    };
    const startup = window.setTimeout(due, 20_000),
      timer = window.setInterval(due, 60 * 60_000);
    window.addEventListener("focus", due);
    window.addEventListener("online", due);
    document.addEventListener("visibilitychange", due);
    return () => {
      stopped = true;
      window.clearTimeout(ready);
      window.clearTimeout(startup);
      window.clearInterval(timer);
      window.removeEventListener("focus", due);
      window.removeEventListener("online", due);
      document.removeEventListener("visibilitychange", due);
    };
  }, []);
  async function stage() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setProgress(0);
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await onDownloadProgress((value) =>
        setProgress(
          value.total
            ? Math.min(100, Math.floor((value.downloaded / value.total) * 100))
            : 0,
        ),
      );
      const value = await download();
      if (value.status === "staged" || value.status === "alreadyStaged") {
        setStaged(value.version);
        feedback("界面更新已下载，下次重新打开应用时生效");
      } else {
        setOutcome(value);
        feedback("当前没有可应用的界面更新", "info");
      }
    } catch (reason) {
      setError(String(reason));
      feedback(`界面更新失败：${String(reason)}`, "error");
    } finally {
      unlisten?.();
      working.current = false;
      setBusy(false);
    }
  }
  return { bundle, outcome, busy, staged, progress, error, inspect, stage };
}
const Context = createContext<ReturnType<typeof useHotUpdates> | null>(null);
export function HotUpdateProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={useHotUpdates()}>{children}</Context.Provider>
  );
}
export default function HotUpdateSettings() {
  const state = useContext(Context)!;
  if (!isTauri()) return null;
  const outcome = state.outcome;
  const message = state.staged
    ? `界面 ${state.staged} 已就绪，退出并重新打开应用后生效。`
    : outcome?.status === "available"
      ? `可用界面更新 ${outcome.manifest.version}`
      : outcome?.status === "shellTooOld"
        ? `请先将应用升级到 ${outcome.required}，再获取界面更新。`
        : outcome?.status === "blacklisted"
          ? "该界面更新曾启动失败，已保留可用版本。"
          : outcome?.status === "upToDate"
            ? "当前界面已是最新版本。"
            : "检查可独立下载的界面、样式与交互修正。";
  return (
    <SettingsGroup
      id="updates"
      title="界面更新"
      description="更新前端资源；原生功能与权限改动通过完整安装包提供。"
    >
      <div className="setting-row">
        <span>
          <strong>当前界面 {state.bundle?.version ?? "读取中…"}</strong>
          <small>
            {state.bundle?.source === "ota"
              ? "使用已下载的界面资源"
              : "使用应用内置界面"}
          </small>
        </span>
      </div>
      <p role="status">{message}</p>
      {state.error && <p role="alert">{state.error}</p>}
      <div className="app-update-actions">
        <Button
          variant="secondary"
          disabled={state.busy || !!state.staged}
          onClick={() => void state.inspect()}
        >
          检查界面更新
        </Button>
        {outcome?.status === "available" && !state.staged && (
          <Button disabled={state.busy} onClick={() => void state.stage()}>
            {state.busy ? `正在下载 ${state.progress}%` : "下载界面更新"}
          </Button>
        )}
      </div>
    </SettingsGroup>
  );
}
