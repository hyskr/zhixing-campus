import {
  downloadAction,
  registerDownloadActions,
  requestDownload,
  showDownloads,
} from "./downloadFeedback";
import { showFeedback, dismissFeedback } from "./ui";
import { isAndroid } from "./platform";
import { useFeedback } from "./ui";
import { useErrorState } from "./ui";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Input } from "@/components/motion/input";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/motion/button";
import { Download, FolderOpen, RefreshCw, Search, Trash2 } from "lucide-react";
import type { Account, DownloadTask } from "./types";
import { Empty } from "./ui";
import { PageHeading } from "./Pages";
export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1073741824) return `${(value / 1048576).toFixed(1)} MB`;
  return `${(value / 1073741824).toFixed(2)} GB`;
}
function formatDownloadTime(value: number) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
function downloadDuration(task: DownloadTask): string {
  if (!task.startedAt) return "";
  const end = task.finishedAt ?? task.updatedAt;
  if (!end) return "";
  const seconds = Math.max(0, Math.floor((end - task.startedAt) / 1000));
  if (!seconds) return "耗时不足 1 秒";
  const minutes = Math.floor(seconds / 60);
  return minutes
    ? `耗时 ${minutes} 分 ${seconds % 60} 秒`
    : `耗时 ${seconds} 秒`;
}
const activeTask = (t: DownloadTask) =>
  t.state === "queued" || t.state === "downloading";
const Context = createContext<{
  tasks: DownloadTask[];
  error: string;
  clear: (accountId: string) => Promise<void>;
}>({ tasks: [], error: "", clear: async () => {} });
export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Record<string, DownloadTask>>({}),
    [error, setError] = useErrorState();
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const off = listen<DownloadTask>(
      "campus-download-progress",
      ({ payload }) => {
        if (active) {
          setTasks((prev) => ({ ...prev, [payload.id]: payload }));
        }
      },
    );
    void off
      .then(() => invoke<DownloadTask[]>("download_history"))
      .then((rows) => {
        if (active)
          setTasks((prev) => ({
            ...Object.fromEntries(rows.map((t) => [t.id, t])),
            ...prev,
          }));
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      void off.then((stop) => stop());
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const off = listen<{
      phase: string;
      id: string;
      accountId: string;
      name: string;
      count: number;
      completed?: number;
      failed?: number;
      cancelled?: number;
    }>("campus-download-batch", ({ payload: b }) => {
      if (!active) return;
      if (b.phase === "queued") {
        showFeedback(
          b.count === 1
            ? `已加入下载队列：${b.name}`
            : `${b.count} 个文件已加入下载队列`,
          "info",
          downloadAction(b.accountId),
          "download-request",
          {
            description: "正在准备地址与保存位置，可随时查看进度。",
            duration: 7000,
          },
        );
      } else {
        dismissFeedback("download-request");
        const completed = b.completed ?? 0,
          failed = b.failed ?? 0,
          cancelled = b.cancelled ?? 0;
        const message =
          b.count === 1
            ? completed
              ? `下载完成：${b.name}`
              : failed
                ? `下载失败：${b.name}`
                : `已取消下载：${b.name}`
            : `下载结束：完成 ${completed} 个${failed ? `，失败 ${failed} 个` : ""}${cancelled ? `，取消 ${cancelled} 个` : ""}`;
        const action =
          b.count === 1 && completed === 1
            ? {
                label: isAndroid ? "打开文件" : "显示文件",
                onClick: () => {
                  void invoke("open_download", { id: b.id }).catch((reason) =>
                    showFeedback(
                      `无法打开文件：${String(reason)}`,
                      "error",
                      downloadAction(b.accountId),
                    ),
                  );
                },
              }
            : downloadAction(b.accountId);
        showFeedback(
          message,
          failed ? "error" : completed ? "success" : "info",
          action,
          `download-result-${b.id}`,
          {
            duration: 0,
            description: failed
              ? "打开下载管理查看失败原因并重试。"
              : completed
                ? isAndroid
                  ? "文件已保存在应用内，可打开或导出到系统下载目录。"
                  : "文件已保存到选定目录。"
                : "此批下载已取消。",
          },
        );
      }
    });
    const tap = import("@tauri-apps/plugin-notification").then(async (api) => {
      await registerDownloadActions();
      return api.onAction((event) => {
        const extra = event.notification?.extra;
        if (active && extra?.destination === "downloads")
          showDownloads(
            typeof extra.accountId === "string" ? extra.accountId : undefined,
          );
      });
    });
    void off.catch((reason) => {
      if (active) setError(String(reason));
    });
    void tap.catch(() => {});
    return () => {
      active = false;
      void off.then((stop) => stop()).catch(() => {});
      void tap.then((listener) => listener?.unregister()).catch(() => {});
    };
  }, []);
  async function clear(accountId: string) {
    if (isTauri())
      await invoke("clear_download_history", { username: accountId });
    setTasks((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(
          ([, t]) => t.accountId !== accountId || activeTask(t),
        ),
      ),
    );
  }
  return (
    <Context.Provider value={{ tasks: Object.values(tasks), error, clear }}>
      {children}
    </Context.Provider>
  );
}
export const useDownloads = () => useContext(Context);
export default function Downloads({ account }: { account?: Account }) {
  const showDownloadError = useFeedback("error");
  const { tasks, error: loadError, clear } = useDownloads();
  const [filter, setFilter] = useState("全部"),
    [query, setQuery] = useState(""),
    [error, setError] = useErrorState();
  const all = tasks
    .filter((t) => !account || t.accountId === account.id)
    .sort(
      (a, b) =>
        Number(activeTask(b)) - Number(activeTask(a)) ||
        (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
  const active = all.filter(activeTask),
    completed = all.filter((t) => t.state === "completed"),
    failed = all.filter((t) => t.state === "failed");
  const rows = all.filter(
    (t) =>
      t.name.includes(query) &&
      (filter === "全部" ||
        (filter === "进行中" && activeTask(t)) ||
        (filter === "已完成" && t.state === "completed") ||
        (filter === "失败 / 已取消" &&
          (t.state === "failed" || t.state === "cancelled"))),
  );
  const loaded = active.reduce((sum, t) => sum + t.loaded, 0),
    speed = active.reduce((sum, t) => sum + (t.speed ?? 0), 0);
  async function action(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="DOWNLOADS"
        title="下载管理"
        description="查看下载进度，找回已经保存的资料。"
      />
      <div className="download-stats">
        <section className="surface">
          <Download size={21} />
          <strong>{active.length}</strong>
          <span>进行中</span>
        </section>
        <section className="surface">
          <FolderOpen size={21} />
          <strong>{completed.length}</strong>
          <span>已完成</span>
        </section>
        <section className="surface">
          <strong>{formatBytes(speed)}/s</strong>
          <span>当前总速度</span>
        </section>
        <section className="surface">
          <strong>{failed.length}</strong>
          <span>失败记录</span>
        </section>
      </div>
      <section className="surface downloads-page">
        <div className="download-toolbar">
          <Tabs
            value={filter}
            onValueChange={(next) => setFilter(next)}
            variant="underline"
            className=""
          >
            <TabsList>
              {["全部", "进行中", "已完成", "失败 / 已取消"].map((value) => (
                <TabsTrigger key={value} value={value}>
                  {value}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <label className="download-search">
            <Search size={15} />
            <Input
              aria-label="搜索下载记录"
              value={String(query)}
              onChange={(e) => setQuery(e)}
              type="search"
              enterKeyHint="search"
              placeholder="搜索文件名"
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={!all.some((t) => !activeTask(t))}
            onClick={() => action(() => clear(account?.id ?? ""))}
          >
            <Trash2 size={14} />
            清除已结束记录
          </Button>
        </div>
        {active.length > 0 && (
          <div className="download-running-summary">
            {active.length} 个任务 · 当前已接收 {formatBytes(loaded)}
            <span>下载会在切换页面后继续</span>
          </div>
        )}
        {!rows.length ? (
          <Empty
            title={all.length ? "没有匹配的下载记录" : "还没有下载记录"}
            detail="下载课程资料、作业附件或回放后，记录会保存在这里。"
          />
        ) : (
          <div className="download-history">
            {rows.map((t) => (
              <article className="download-history-row" key={t.id}>
                <div className="download-file-icon">
                  <Download size={22} />
                </div>
                <div className="download-file-body">
                  <div className="download-file-title">
                    <strong title={t.name}>{t.name}</strong>
                    <AnimatedBadge
                      status={
                        t.state === "completed"
                          ? "success"
                          : t.state === "failed"
                            ? "danger"
                            : t.state === "downloading"
                              ? "loading"
                              : "neutral"
                      }
                      size="sm"
                      showIcon={false}
                    >
                      {t.state === "queued"
                        ? "等待下载"
                        : t.state === "downloading"
                          ? "下载中"
                          : t.state === "completed"
                            ? "已完成"
                            : t.state === "cancelled"
                              ? "已取消"
                              : "失败"}
                    </AnimatedBadge>
                  </div>
                  <progress
                    aria-label={`${t.name} 下载进度`}
                    max={t.total || 1}
                    value={
                      t.state === "completed"
                        ? t.total || 1
                        : t.total
                          ? t.loaded
                          : t.state === "downloading"
                            ? undefined
                            : 0
                    }
                  />
                  <div className="download-file-meta">
                    <span>
                      {formatBytes(t.loaded)}
                      {t.total ? ` / ${formatBytes(t.total)}` : ""}
                    </span>
                    {t.state === "downloading" && (
                      <>
                        <span>{formatBytes(t.speed ?? 0)}/s</span>
                        {t.eta && t.eta > 0 ? (
                          <span>剩余 {Math.ceil(t.eta)} 秒</span>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="download-time">
                    {t.startedAt || t.createdAt || t.updatedAt ? (
                      <time
                        dateTime={new Date(
                          (t.startedAt ?? t.createdAt ?? t.updatedAt)!,
                        ).toISOString()}
                      >
                        {t.startedAt
                          ? "开始"
                          : t.createdAt
                            ? "加入"
                            : "记录更新"}
                        ：
                        {formatDownloadTime(
                          (t.startedAt ?? t.createdAt ?? t.updatedAt)!,
                        )}
                      </time>
                    ) : (
                      <span>下载时间未记录</span>
                    )}
                    {t.finishedAt && (
                      <time dateTime={new Date(t.finishedAt).toISOString()}>
                        {t.state === "completed" ? "完成" : "结束"}：
                        {formatDownloadTime(t.finishedAt)}
                      </time>
                    )}
                    {t.startedAt && <span>{downloadDuration(t)}</span>}
                  </div>
                  {t.error ? (
                    <button
                      className="download-task-error"
                      onClick={() => showDownloadError(t.error!)}
                    >
                      查看失败原因
                    </button>
                  ) : (
                    <p
                      className="download-path"
                      title={t.path ?? t.folder ?? ""}
                    >
                      {t.path ?? t.folder ?? "保存位置将在下载完成后显示"}
                    </p>
                  )}
                </div>
                {activeTask(t) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      action(() => invoke("cancel_download", { id: t.id }))
                    }
                  >
                    取消
                  </Button>
                ) : t.state === "completed" ? (
                  <div className="download-android-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        action(() => invoke("open_download", { id: t.id }))
                      }
                    >
                      <FolderOpen size={14} />
                      {isAndroid ? "打开" : "显示文件"}
                    </Button>
                    {isAndroid && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          action(async () => {
                            await invoke("export_download", { id: t.id });
                            window.dispatchEvent(
                              new CustomEvent("campus:feedback", {
                                detail: {
                                  message: "已导出到系统下载目录 · 知行Campus",
                                  variant: "success",
                                },
                              }),
                            );
                          })
                        }
                      >
                        导出
                      </Button>
                    )}
                  </div>
                ) : t.state === "failed" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      action(() =>
                        requestDownload(
                          () =>
                            invoke("retry_download", {
                              username: t.accountId,
                              id: t.id,
                            }),
                          t.accountId,
                          `正在重试：${t.name}`,
                        ),
                      )
                    }
                  >
                    <RefreshCw size={14} />
                    重试
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
