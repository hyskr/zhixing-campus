import {
  updateCheckDue,
  deferUpdateCheck,
  scheduleUpdateChecks,
} from "./updateCheckPolicy";
import { listen } from "@tauri-apps/api/event";
import { openAndroidInstaller } from "./androidUpdater";
import { isAndroid } from "./platform";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { autoRestartEnabled, restartApplication } from "./restart";
import UpdateRestartSettings from "./UpdateRestartSettings";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Update } from "@tauri-apps/plugin-updater";
import { ArrowUpCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/motion/button";
import { Loader } from "@/components/motion/loader";
import { SettingsGroup } from "./SettingsGroups";
import { useFeedback, showFeedback, dismissFeedback } from "./ui";
import {
  checkUpdate,
  isNewerVersion,
  shouldRemindUpdate,
  installUpdate,
  latestRelease,
  RELEASES_URL,
  type ReleaseInfo,
} from "./updater";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import pkg from "../package.json";

type Phase =
  | "idle"
  | "checking"
  | "available"
  | "latest"
  | "downloading"
  | "installing"
  | "installed"
  | "error";
function useUpdaterState() {
  const [version, setVersion] = useState(pkg.version);
  const [release, setRelease] = useState<ReleaseInfo>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [supported, setSupported] = useState<boolean | null>(
    isTauri() ? null : false,
  );
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [checkedAt, setCheckedAt] = useState("");
  const [apkPath, setApkPath] = useState("");
  const update = useRef<Update | null>(null);
  const working = useRef(false);
  const installed = useRef(false);
  const inspectRef = useRef<(automatic?: boolean) => Promise<void>>(
    async () => {},
  );
  const feedback = useFeedback();
  useEffect(() => {
    if (!isTauri()) return;
    void getVersion()
      .then((value) => {
        setVersion(value);
        try {
          const expected = localStorage.getItem(
            "zhixing.android-update-target",
          );
          if (
            expected &&
            (value === expected || isNewerVersion(value, expected))
          ) {
            feedback(`已更新至 ${value}`);
            localStorage.removeItem("zhixing.android-update-target");
          }
        } catch {}
      })
      .catch(() => {});
    if (isAndroid) {
      setSupported(true);
      return;
    }
    void invoke<boolean>("supports_in_app_update")
      .then(setSupported)
      .catch(() => setSupported(false));
    return () => {
      if (!working.current) void update.current?.close();
    };
  }, []);
  async function inspect(automatic = false) {
    if (working.current || installed.current || supported === null) return;
    deferUpdateCheck("app", false);
    working.current = true;
    setPhase("checking");
    try {
      await update.current?.close();
      update.current = null;
      const metadata = await latestRelease();
      setRelease(metadata);
      if (isAndroid) setApkPath(metadata.downloadedPath ?? "");
      if (
        isTauri() &&
        !isAndroid &&
        supported &&
        (!automatic || isNewerVersion(metadata.version, version))
      )
        update.current = await checkUpdate();
      const available =
        !!update.current || isNewerVersion(metadata.version, version);
      deferUpdateCheck("app", true);
      setPhase(available ? "available" : "latest");
      if (automatic && available) {
        let previous: { version: string; at: number } | null = null;
        try {
          previous = JSON.parse(
            localStorage.getItem("zhixing.update-reminder.v1") ?? "null",
          );
        } catch {}
        if (shouldRemindUpdate(metadata.version, previous)) {
          showFeedback(
            `发现新版本 ${metadata.version}`,
            "info",
            {
              label: "查看更新",
              onClick: () => {
                dismissFeedback("app-update-available");
                window.dispatchEvent(new Event("campus:open-updates"));
              },
            },
            "app-update-available",
            { description: "查看更新说明并选择下载安装。", duration: 0 },
          );
          try {
            localStorage.setItem(
              "zhixing.update-reminder.v1",
              JSON.stringify({ version: metadata.version, at: Date.now() }),
            );
          } catch {}
        }
      }
      setCheckedAt(
        new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (error) {
      setPhase("error");
      if (!automatic) feedback(String(error), "error");
    } finally {
      working.current = false;
    }
  }
  inspectRef.current = inspect;
  useEffect(() => {
    if (!isTauri() || supported === null) return;
    return scheduleUpdateChecks(
      () => {
        if (
          document.visibilityState === "visible" &&
          navigator.onLine &&
          updateCheckDue("app")
        )
          void inspectRef.current(true);
      },
      isAndroid ? 30_000 : 10_000,
    );
  }, [supported]);
  async function install() {
    if (isAndroid) {
      if (working.current || !release?.apkUrl) return;
      working.current = true;
      let unlisten: (() => void) | undefined;
      try {
        let path = apkPath,
          target = release.version;
        if (!path) {
          setPhase("downloading");
          setProgress({ loaded: 0, total: 0 });
          unlisten = await listen<{ loaded: number; total: number }>(
            "app-update-download",
            ({ payload }) => setProgress(payload),
          );
          const result = await invoke<{ path: string; version: string }>(
            "download_android_update",
          );
          path = result.path;
          target = result.version;
          setApkPath(path);
          feedback("更新包下载完成，正在准备安装");
        }
        setPhase("installing");
        if (!(await openAndroidInstaller(path, target))) {
          setPhase("available");
          feedback("更新包已保留，请允许安装此来源应用后重试", "info");
          return;
        }
        setPhase("available");
        feedback("已打开系统安装界面，请确认更新", "info");
      } catch (error) {
        const cancelled = String(error).includes("已取消");
        setPhase(cancelled ? "available" : "error");
        feedback(
          cancelled ? "已取消更新下载" : `更新失败：${String(error)}`,
          cancelled ? "info" : "error",
        );
      } finally {
        unlisten?.();
        working.current = false;
      }
      return;
    }
    if (working.current || !update.current) return;
    working.current = true;
    setPhase("downloading");
    setProgress({ loaded: 0, total: 0 });
    try {
      await installUpdate(
        update.current,
        (event) => {
          if (event.event === "Started")
            setProgress({ loaded: 0, total: event.data.contentLength ?? 0 });
          if (event.event === "Progress")
            setProgress((old) => ({
              ...old,
              loaded: old.loaded + event.data.chunkLength,
            }));
        },
        () => setPhase("installing"),
      );
      installed.current = true;
      setPhase("installed");
      feedback("更新已安装，重启后生效");
      await update.current.close();
      update.current = null;
      if (autoRestartEnabled()) await restart();
    } catch (error) {
      setPhase("error");
      feedback(`更新失败：${String(error)}`, "error");
    } finally {
      working.current = false;
    }
  }
  async function restart() {
    try {
      await restartApplication();
    } catch (error) {
      feedback(`重启失败，请退出并重新打开应用：${String(error)}`, "error");
    }
  }
  return {
    version,
    release,
    phase,
    supported,
    canInstall: isAndroid ? !!release?.apkUrl : !!update.current,
    apkPath,
    cancel: () => invoke("cancel_android_update"),
    progress,
    checkedAt,
    inspect,
    install,
    restart,
  };
}
const UpdaterContext = createContext<ReturnType<typeof useUpdaterState> | null>(
  null,
);
export function AppUpdaterProvider({ children }: { children: ReactNode }) {
  return (
    <UpdaterContext.Provider value={useUpdaterState()}>
      {children}
    </UpdaterContext.Provider>
  );
}
export default function AppUpdateSettings() {
  const state = useContext(UpdaterContext)!;
  const { phase, release, supported, canInstall, version, progress } = state;
  const feedback = useFeedback();
  const busy = ["checking", "downloading", "installing"].includes(phase);
  const percent = progress.total
    ? Math.min(100, Math.floor((progress.loaded / progress.total) * 100))
    : undefined;
  async function releases() {
    try {
      if (isTauri()) await openUrl(release?.url ?? RELEASES_URL);
      else
        window.open(
          release?.url ?? RELEASES_URL,
          "_blank",
          "noopener,noreferrer",
        );
    } catch (error) {
      feedback(String(error), "error");
    }
  }
  const status = {
    idle: "检查 GitHub Release 上的最新正式版本。",
    checking: "正在检查更新…",
    available: canInstall
      ? "新版本已就绪，可下载安装。"
      : "发现新版本，请在发布页面下载安装包。",
    latest: supported ? "当前已是最新版本。" : "已获取最新发布信息。",
    downloading: `正在下载 ${percent === undefined ? `${(progress.loaded / 1048576).toFixed(1)} MB` : `${percent}%`}`,
    installing: "正在安装更新，请稍候…",
    installed: "更新已安装，重启应用后生效。",
    error: "更新未完成，可重新检查后重试。",
  }[phase];
  return (
    <SettingsGroup
      id="updates"
      title="知行 Campus"
      description={
        isAndroid
          ? "Android 正式版本、发布说明与安装更新。"
          : "版本信息、发布说明与应用内更新。"
      }
    >
      <UpdateRestartSettings />
      <div className="app-update-summary">
        <ArrowUpCircle size={30} />
        <div>
          <strong>当前版本 {version}</strong>
          <p>
            {isAndroid
              ? "Android 正式版"
              : isTauri()
                ? "桌面应用"
                : "浏览器预览"}
            {release && ` · 最新发布 ${release.version}`}
          </p>
        </div>
      </div>
      <div className="app-update-status" role="status">
        {busy && <Loader size={16} label="更新处理中" />}
        <span>{status}</span>
      </div>
      {phase === "downloading" && (
        <progress
          aria-label="更新下载进度"
          value={percent}
          max={100}
          className="app-update-progress"
        />
      )}
      <div className="app-update-actions">
        <Button
          variant="secondary"
          onClick={() => void state.inspect()}
          disabled={busy || phase === "installed" || supported === null}
        >
          <RefreshCw size={15} />
          检查更新
        </Button>
        {phase === "available" && canInstall && (
          <Button onClick={() => void state.install()}>
            {isAndroid && state.apkPath ? "安装" : "下载并安装"}{" "}
            {release?.version}
          </Button>
        )}
        {isAndroid && phase === "downloading" && (
          <Button
            variant="ghost"
            onClick={() =>
              void state
                .cancel()
                .catch((error) => feedback(String(error), "error"))
            }
          >
            取消下载
          </Button>
        )}
        {phase === "installed" && (
          <Button onClick={() => void state.restart()}>重启应用</Button>
        )}
        <Button variant="ghost" onClick={() => void releases()}>
          <ExternalLink size={14} />
          发布页面
        </Button>
      </div>
      <p className="app-update-hint">
        {isAndroid
          ? "更新包在应用内下载，首次安装需允许此来源。系统确认后覆盖升级，保留原有账号与数据。"
          : supported
            ? "下载后验证更新签名。安装时请先保存正在编辑的内容；Windows 安装器会关闭并重新打开应用，macOS 与 AppImage 安装后可点击重启。"
            : isTauri()
              ? "当前安装格式请在发布页面下载安装包更新。Linux 应用内更新需使用 AppImage。"
              : "应用内安装仅在桌面版中可用。"}
        自动检测在启动后及回到前台时执行，同一版本每天最多提醒一次。
        {state.checkedAt && ` 最近检查 ${state.checkedAt}。`}
      </p>
      {release && (
        <section className="app-release-notes">
          <h4>{release.version} 更新说明</h4>
          <time>{new Date(release.date).toLocaleDateString("zh-CN")}</time>
          <div className="app-release-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(event) => {
                      if (isTauri() && href) {
                        event.preventDefault();
                        void openUrl(href).catch((error) =>
                          feedback(String(error), "error"),
                        );
                      }
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {release.notes || "此版本未提供更新说明。"}
            </ReactMarkdown>
          </div>
        </section>
      )}
    </SettingsGroup>
  );
}
