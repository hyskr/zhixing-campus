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
import { relaunch } from "@tauri-apps/plugin-process";
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
  const update = useRef<Update | null>(null);
  const working = useRef(false);
  const installed = useRef(false);
  const lastCheck = useRef(0);
  const inspectRef = useRef<(automatic?: boolean) => Promise<void>>(
    async () => {},
  );
  const feedback = useFeedback();
  useEffect(() => {
    if (!isTauri()) return;
    void getVersion()
      .then(setVersion)
      .catch(() => {});
    void invoke<boolean>("supports_in_app_update")
      .then(setSupported)
      .catch(() => setSupported(false));
    return () => {
      if (!working.current) void update.current?.close();
    };
  }, []);
  async function inspect(automatic = false) {
    if (working.current || installed.current || supported === null) return;
    lastCheck.current = Date.now();
    working.current = true;
    setPhase("checking");
    try {
      await update.current?.close();
      update.current = null;
      const metadata = await latestRelease();
      setRelease(metadata);
      if (
        isTauri() &&
        supported &&
        (!automatic || isNewerVersion(metadata.version, version))
      )
        update.current = await checkUpdate();
      const available =
        !!update.current || isNewerVersion(metadata.version, version);
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
    if (!isTauri() || isAndroid || supported === null) return;
    const checkWhenDue = () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        Date.now() - lastCheck.current < 6 * 60 * 60_000
      )
        return;
      void inspectRef.current(true);
    };
    const startup = window.setTimeout(checkWhenDue, 10_000);
    const timer = window.setInterval(checkWhenDue, 60 * 60_000);
    window.addEventListener("focus", checkWhenDue);
    window.addEventListener("online", checkWhenDue);
    document.addEventListener("visibilitychange", checkWhenDue);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenDue);
      window.removeEventListener("online", checkWhenDue);
      document.removeEventListener("visibilitychange", checkWhenDue);
    };
  }, [supported]);
  async function install() {
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
    } catch (error) {
      setPhase("error");
      feedback(`更新失败：${String(error)}`, "error");
    } finally {
      working.current = false;
    }
  }
  async function restart() {
    try {
      await relaunch();
    } catch (error) {
      feedback(`重启失败，请退出并重新打开应用：${String(error)}`, "error");
    }
  }
  return {
    version,
    release,
    phase,
    supported,
    canInstall: !!update.current,
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
  if (isAndroid)
    return (
      <SettingsGroup
        id="updates"
        title="知行 Campus · Android"
        description="Android 预览版本与安装更新。"
      >
        <div className="app-update-summary">
          <ArrowUpCircle size={30} />
          <div>
            <strong>当前版本 {version}</strong>
            <p>Android 预览版</p>
          </div>
        </div>
        <p className="app-update-hint">
          Android 使用 APK 安装更新。下载新版后，由系统确认安装。
        </p>
        <Button onClick={() => void openUrl(RELEASES_URL)}>
          查看 Android 安装包
        </Button>
      </SettingsGroup>
    );
  return (
    <SettingsGroup
      id="updates"
      title="知行 Campus"
      description="版本信息、发布说明与应用内更新。"
    >
      <div className="app-update-summary">
        <ArrowUpCircle size={30} />
        <div>
          <strong>当前版本 {version}</strong>
          <p>
            {isTauri() ? "桌面应用" : "浏览器预览"}
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
            下载并安装 {release?.version}
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
        {supported
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
