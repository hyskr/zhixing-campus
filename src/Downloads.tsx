import {
  downloadAction,
  registerDownloadActions,
  requestDownload,
  showDownloads,
} from "./downloadFeedback";
import { showFeedback, dismissFeedback } from "./ui";
import { isAndroid, useCompactLayout } from "./platform";
import "./downloads.css";
import { useErrorState } from "./ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
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
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Film,
  FolderOpen,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { Account, DownloadTask } from "./types";
import { isMockMode, makeMockDownloads } from "./demo";
import { PageHeading } from "./Pages";
import { Empty, Modal } from "./ui";
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
  if (!seconds) return "不足 1 秒";
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}
const activeTask = (t: DownloadTask) =>
  t.state === "queued" || t.state === "downloading";
const Context = createContext<{
  tasks: DownloadTask[];
  error: string;
  clear: (accountId: string) => Promise<void>;
}>({ tasks: [], error: "", clear: async () => {} });
export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Record<string, DownloadTask>>(() =>
    isMockMode() && !isTauri() ? makeMockDownloads() : {},
  ),
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
      paused?: number;
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
          cancelled = b.cancelled ?? 0,
          paused = b.paused ?? 0;
        const message =
          b.count === 1
            ? completed
              ? `下载完成：${b.name}`
              : failed
                ? `下载失败：${b.name}`
                : paused
                  ? `已暂停下载：${b.name}`
                  : `已取消下载：${b.name}`
            : `下载结束：完成 ${completed} 个${failed ? `，失败 ${failed} 个` : ""}${cancelled ? `，取消 ${cancelled} 个` : ""}${paused ? `，暂停 ${paused} 个` : ""}`;
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
                : paused
                  ? "可在下载管理中继续下载。"
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

const filters = [
  { value: "all", label: "全部" },
  { value: "active", label: "进行中" },
  { value: "paused", label: "已暂停" },
  { value: "completed", label: "已完成" },
  { value: "unsuccessful", label: "失败／取消" },
] as const;

const taskStatus = {
  queued: { label: "排队中", icon: Clock },
  downloading: { label: "下载中", icon: Download },
  paused: { label: "已暂停", icon: Pause },
  completed: { label: "已完成", icon: Check },
  failed: { label: "下载失败", icon: AlertCircle },
  cancelled: { label: "已取消", icon: X },
} satisfies Record<
  DownloadTask["state"],
  { label: string; icon: typeof Clock }
>;

function DownloadRow({
  task,
  run,
}: {
  task: DownloadTask;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { label, icon: StatusIcon } = taskStatus[task.state];
  const FileIcon = task.item?.kind === "replay" ? Film : FileText;
  const resume = task.item?.kind === "replay" || task.state === "paused";
  const showProgress = activeTask(task) || task.state === "paused";
  const knownSize = task.total > 0;
  const percent = knownSize
    ? Math.min(100, Math.floor((task.loaded / task.total) * 100))
    : undefined;
  const time =
    task.finishedAt ?? task.startedAt ?? task.createdAt ?? task.updatedAt;
  const location = task.path || task.folder;
  const duration = downloadDuration(task);
  const hasDetails = !!(location || time || duration);

  async function exportFile() {
    await invoke("export_download", { id: task.id });
    showFeedback("已导出到系统下载目录 · 知行Campus");
  }

  return (
    <article
      className="transfer-row"
      data-state={task.state}
      aria-label={task.name}
    >
      <div className="transfer-file-icon">
        <FileIcon size={20} aria-hidden="true" />
      </div>
      <div className="transfer-info">
        <div className="transfer-title">
          <h3>{task.name}</h3>
          <span className="transfer-state">
            <StatusIcon size={13} aria-hidden="true" /> {label}
          </span>
        </div>
        {showProgress && (
          <div className="transfer-progress">
            <progress
              aria-label={`${task.name} 下载进度`}
              max={knownSize ? task.total : 1}
              value={
                knownSize
                  ? Math.min(task.loaded, task.total)
                  : task.state === "downloading"
                    ? undefined
                    : 0
              }
            />
            {percent !== undefined && <span>{percent}%</span>}
          </div>
        )}
        <div className="transfer-meta">
          {showProgress && (task.loaded > 0 || knownSize) && (
            <span>
              {formatBytes(task.loaded)}
              {knownSize ? ` / ${formatBytes(task.total)}` : ""}
            </span>
          )}
          {task.state === "completed" && (
            <span>{formatBytes(task.total || task.loaded)}</span>
          )}
          {task.state === "downloading" && (task.speed ?? 0) > 0 && (
            <span>{formatBytes(task.speed!)}/s</span>
          )}
          {task.state === "downloading" && task.eta && task.eta > 0 ? (
            <span>
              约剩{" "}
              {task.eta >= 60
                ? `${Math.ceil(task.eta / 60)} 分钟`
                : `${Math.ceil(task.eta)} 秒`}
            </span>
          ) : null}
          {task.state === "completed" && time !== undefined && (
            <time dateTime={new Date(time).toISOString()}>
              {formatDownloadTime(time)}
            </time>
          )}
        </div>
        {task.error && <p className="transfer-error">{task.error}</p>}
        {hasDetails && (
          <details className="transfer-details">
            <summary>
              <ChevronDown size={14} aria-hidden="true" /> 文件详情
            </summary>
            <dl>
              {location && (
                <div>
                  <dt>保存位置</dt>
                  <dd>{location}</dd>
                </div>
              )}
              {task.createdAt && (
                <div>
                  <dt>加入时间</dt>
                  <dd>{formatDownloadTime(task.createdAt)}</dd>
                </div>
              )}
              {task.startedAt && (
                <div>
                  <dt>开始时间</dt>
                  <dd>{formatDownloadTime(task.startedAt)}</dd>
                </div>
              )}
              {task.finishedAt && (
                <div>
                  <dt>结束时间</dt>
                  <dd>{formatDownloadTime(task.finishedAt)}</dd>
                </div>
              )}
              {duration && (
                <div>
                  <dt>耗时</dt>
                  <dd>{duration}</dd>
                </div>
              )}
            </dl>
          </details>
        )}
      </div>
      {task.state !== "cancelled" && (
        <div className="transfer-actions">
          {activeTask(task) ? (
            <>
              {task.item?.kind === "replay" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void run(() => invoke("pause_download", { id: task.id }))
                  }
                >
                  <Pause size={14} aria-hidden="true" /> 暂停
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void run(() => invoke("cancel_download", { id: task.id }))
                }
              >
                取消
              </Button>
            </>
          ) : task.state === "completed" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void run(() => invoke("open_download", { id: task.id }))
                }
              >
                <FolderOpen size={14} aria-hidden="true" />{" "}
                {isAndroid ? "打开文件" : "显示文件"}
              </Button>
              {isAndroid && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void run(exportFile)}
                >
                  导出
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void run(() =>
                  requestDownload(
                    () =>
                      invoke("retry_download", {
                        username: task.accountId,
                        id: task.id,
                      }),
                    task.accountId,
                    `正在${resume ? "恢复下载" : "重试"}：${task.name}`,
                  ),
                )
              }
            >
              {resume ? (
                <Play size={14} aria-hidden="true" />
              ) : (
                <RefreshCw size={14} aria-hidden="true" />
              )}
              {resume ? "继续下载" : "重试"}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

export default function Downloads({
  account,
  embedded = false,
}: {
  account?: Account;
  embedded?: boolean;
}) {
  const compact = useCompactLayout();
  const { tasks, error: loadError, clear } = useDownloads();
  const [filter, setFilter] = useState("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [, setError] = useErrorState();
  const all = tasks
    .filter((task) => !account || task.accountId === account.id)
    .sort(
      (a, b) =>
        (b.createdAt ?? b.updatedAt ?? 0) - (a.createdAt ?? a.updatedAt ?? 0),
    );
  const active = all.filter(activeTask);
  const speed = active.reduce((sum, task) => sum + (task.speed ?? 0), 0);
  const removable = all.filter((task) => !activeTask(task));
  const rows = all.filter(
    (task) =>
      filter === "all" ||
      (filter === "active" && activeTask(task)) ||
      (filter === "unsuccessful" &&
        (task.state === "failed" || task.state === "cancelled")) ||
      task.state === filter,
  );
  const current = rows.filter(activeTask);
  const history = rows.filter((task) => !activeTask(task));
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(String(error));
    }
  }

  function list(items: DownloadTask[]) {
    return items.map((task) => (
      <DownloadRow key={task.id} task={task} run={run} />
    ));
  }

  return (
    <div className="transfer-workspace">
      {!embedded && !compact && (
        <PageHeading
          eyebrow="DOWNLOADS"
          title="下载管理"
          description="查看课程资料、邮件附件与回放视频的下载进度与记录。"
        />
      )}
      <section className="transfer-panel" aria-label="下载任务">
        <div className="transfer-toolbar">
          <Tabs value={filter} onValueChange={setFilter} variant="underline">
            <TabsList aria-label="下载状态">
              {filters.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                  {value === "active" && active.length > 0 && (
                    <span className="transfer-tab-count">{active.length}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="transfer-tools">
            {active.length > 0 && speed > 0 && (
              <span className="transfer-speed-pill">
                {formatBytes(speed)}/s
              </span>
            )}
            {removable.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={15} aria-hidden="true" /> 清除记录
              </Button>
            )}
          </div>
        </div>
        <div className="transfer-scroll">
          {loadError && (
            <p className="transfer-load-error" role="status">
              无法读取下载记录。{loadError}
            </p>
          )}
          {!rows.length ? (
            <Empty
              icon={<Download size={32} strokeWidth={1.4} />}
              title={all.length ? "没有匹配的下载记录" : "还没有下载记录"}
              detail={
                all.length
                  ? "当前状态下没有下载任务。"
                  : "从课程资料、邮件或回放发起下载后，任务会显示在这里。"
              }
            />
          ) : (
            <div className="transfer-group">
              {list(filter === "all" ? [...current, ...history] : rows)}
            </div>
          )}
        </div>
      </section>
      {confirmClear && (
        <Modal
          title="清除下载记录？"
          presentation="dialog"
          onClose={() => !clearing && setConfirmClear(false)}
        >
          <p>
            将清除不在进行中的下载记录，以及这些任务保留的续传文件。已下载的文件会保留。
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={clearing}
              onClick={() => setConfirmClear(false)}
            >
              取消
            </Button>
            <Button
              disabled={clearing}
              onClick={() =>
                void run(async () => {
                  setClearing(true);
                  try {
                    for (const id of new Set(
                      removable.map((task) => task.accountId),
                    ))
                      await clear(id);
                    setConfirmClear(false);
                    showFeedback("已清除下载记录");
                  } finally {
                    setClearing(false);
                  }
                })
              }
            >
              {clearing ? "正在清除…" : "清除记录"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
