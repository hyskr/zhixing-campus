import { queueDownloads, requestDownload } from "./downloadFeedback";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleIndicator,
} from "@/components/motion/collapsible";
import ReplayViewer from "./ReplayViewer";
import { useErrorState } from "./ui";
import { resourceDirectory } from "./resourcePaths";
import { sameCourseName } from "./courseMatching";
import { useFeedback } from "./ui";
import { Loader } from "@/components/motion/loader";
import ResourceExplorer from "./ResourceExplorer";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { Input } from "@/components/motion/input";
import { Checkbox } from "@/components/motion/checkbox";
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button";
import { listen } from "@tauri-apps/api/event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  Check,
  Copy,
  Eye,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import type {
  Account,
  CampusData,
  DownloadItem,
  Replay,
  ReplayLink,
  Resource,
} from "./types";
import { DetailRow, Empty, fullDate, Modal } from "./ui";
import { PageHeading } from "./Pages";
import { loadReplays, loadReplayLinks } from "./service";
import { useFilePreview } from "./FilePreview";
import { withCampusSession } from "./service";
import { copyLinks, copyText, getLinks, downloadFiles } from "./learning";
export const resourceTypes = [
  ["1", "电子课件"],
  ["5", "教案设计"],
  ["10", "实验"],
  ["12", "教材教辅"],
  ["13", "MOOC 资源"],
] as const;
export default function LearningResources({
  account,
  data,
  query,
  onLoad,
  focusCourse,
  compact = false,
  onReplayCache,
  onRefresh,
}: {
  account: Account;
  data: CampusData;
  query: string;
  onLoad: (node: Resource) => Promise<Resource[]>;
  onRefresh?: () => Promise<void>;
  focusCourse?: string;
  compact?: boolean;
  onReplayCache: (id: string, list: Replay[]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, Resource>>({});
  const [detail, setDetail] = useState<Resource | null>(null);
  const [error, setError] = useErrorState();
  const preview = useFilePreview();
  const [picking, setPicking] = useState(false);
  const setNotice = useFeedback("success");
  const [collectingLabel, setCollectingLabel] = useState("");
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [mappedCourse, setMappedCourse] = useState("auto");
  const [refreshing, setRefreshing] = useState(false);
  const matches = data.resources.filter(
    (root) => !focusCourse || sameCourseName(root.name, focusCourse),
  );
  const available =
    mappedCourse === "auto"
      ? matches
      : data.resources.filter((root) => root.id === mappedCourse);
  const roots = available;
  async function download(nodes: Resource[]) {
    if (account.demo || !isTauri()) {
      setError("请连接校园账号，在桌面应用中下载真实课程文件。");
      return;
    }
    if (!nodes.length) return;
    setPicking(true);
    setError("");
    try {
      const items: DownloadItem[] = nodes.map((node) => {
        if (!node.rpId || !node.courseId)
          throw new Error("请刷新此目录后再下载文件");
        return {
          id: crypto.randomUUID(),
          name: node.name,
          courseId: node.courseId,
          rpId: node.rpId,
          url: node.url,
          downloadAllowed: node.downloadAllowed,
          relativePath:
            nodes.length > 1 ? resourceDirectory(data.resources, node.id) : [],
          kind: "resource",
        };
      });
      await queueDownloads(account.id, items);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPicking(false);
    }
  }
  async function treeDownload(node: Resource) {
    setPicking(true);
    setError("");
    let stop: (() => void) | undefined;
    try {
      if (account.demo) throw Error("请连接校园账号后下载课程资料。");
      setCollectingLabel("正在递归读取资料目录…");
      stop = await listen<{ accountId: string; label: string }>(
        "campus-sync-progress",
        ({ payload }) => {
          if (payload.accountId === account.id)
            setCollectingLabel(payload.label);
        },
      );
      await requestDownload(
        () =>
          withCampusSession(account.id, () =>
            invoke("download_resource_tree", {
              username: account.id,
              courseId: node.courseId,
              parentId: node.sourceId ?? "0",
              docType: node.docType ?? null,
              folderName: node.name,
              relativePath: resourceDirectory(data.resources, node.id),
            }),
          ),
        account.id,
        "正在读取目录并准备下载…",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      stop?.();
      setCollectingLabel("");
      setPicking(false);
    }
  }
  async function calendar(node: Resource) {
    setError("");
    try {
      if (account.demo) throw Error("请连接校园账号后获取教学日历。");
      const value = await withCampusSession(account.id, () =>
        invoke<{ id: string; name: string; url: string }>("teaching_calendar", {
          username: account.id,
          courseId: node.courseId,
        }),
      );
      preview(value, account);
    } catch (e) {
      setError(String(e));
    }
  }
  async function copy(nodes: Resource[]) {
    setError("");
    try {
      await copyLinks(account, nodes);
      setNotice(`已复制 ${nodes.length} 个链接`);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  return (
    <>
      {!compact && (
        <PageHeading
          eyebrow="COURSE MATERIALS"
          title="课程资料"
          description="查看课程文件、教学日历和课堂回放。"
        />
      )}
      {focusCourse && (
        <div className="course-resource-match">
          <span>智慧课程</span>
          <Select value={mappedCourse} onValueChange={setMappedCourse}>
            <SelectTrigger aria-label="选择对应的智慧课程">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                {matches.length
                  ? `自动匹配：${matches.map((root) => root.name).join("、")}`
                  : "请选择对应的智慧课程"}
              </SelectItem>
              {data.resources.map((root) => (
                <SelectItem key={root.id} value={root.id}>
                  {root.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {focusCourse && !available.length ? (
        <div className="surface course-resource-unmatched">
          <BookOpen size={25} />
          <h3>
            {data.resources.length
              ? "尚未匹配到智慧课程"
              : "智慧课程列表尚未同步"}
          </h3>
          <p>
            {data.resources.length
              ? `课表中的“${focusCourse}”没有对应的课程名称，请在上方选择智慧课程。`
              : "先同步课程列表，再读取这门课程的文件和回放。"}
          </p>
          {onRefresh && (
            <Button
              size="sm"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw size={14} />
              {refreshing ? "同步中" : "同步课程列表"}
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: "contents" }}>
          {collectingLabel && (
            <p className="inline-loading">
              <Loader variant="spinner" size={15} label="正在加载" />
              {collectingLabel}
            </p>
          )}

          <ResourceExplorer
            key={`${account.id}:${roots.map((root) => root.id).join("|")}`}
            roots={roots}
            query={query}
            selected={selected}
            onSelectionChange={setSelected}
            onLoad={onLoad}
            onDetail={setDetail}
            onDownload={download}
            onCopy={copy}
            onPreview={(node) => preview(node, account)}
            onTreeDownload={treeDownload}
            onCalendar={calendar}
            renderReplay={(courseRoot) => (
              <CourseReplayView
                key={courseRoot.id}
                account={account}
                root={courseRoot}
                cache={data.replays ?? {}}
                onCache={onReplayCache}
              />
            )}
            replayCounts={Object.fromEntries(
              Object.entries(data.replays ?? {}).map(([id, list]) => [
                id,
                list.length,
              ]),
            )}
            busy={picking}
            compact={compact}
          />
        </div>
      )}
      {detail && (
        <Modal
          title={detail.name}
          subtitle={detail.course}
          onClose={() => {
            setDetail(null);
            setResolvedUrl("");
          }}
        >
          <div className="file-preview">
            <FileText size={46} />
            <strong>{detail.name.split(".").at(-1)?.toUpperCase()} 文档</strong>
          </div>
          <DetailRow label="所属课程">{detail.course}</DetailRow>
          <DetailRow label="资源分类">
            {resourceTypes.find(([id]) => id === detail.docType)?.[1] ??
              "电子课件"}
          </DetailRow>
          <DetailRow label="文件大小">{detail.size || "未提供"}</DetailRow>
          {detail.downloadAllowed === false && (
            <p className="setting-foot">
              学校页面标记未开放下载，可尝试获取接口提供的链接。
            </p>
          )}

          {resolvedUrl && (
            <div className="raw-link-box">
              <Input
                aria-label="课件原始链接"
                readOnly
                value={String(resolvedUrl)}
              />
            </div>
          )}
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => preview(detail, account)}
            >
              <Eye size={14} />
              在线查看
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const links = await getLinks(account, [detail]);
                  setResolvedUrl(links[0].url);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              获取原始链接
            </Button>
            <Button variant="secondary" onClick={() => copy([detail])}>
              <Copy size={14} />
              复制链接
            </Button>
            <Button disabled={picking} onClick={() => download([detail])}>
              <Download size={14} />
              下载文件
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function demoReplays(root: Resource): Replay[] {
  return [
    {
      id: "demo-replay-1",
      videoId: "demo-1",
      courseId: root.courseId ?? root.id,
      name: "第七周 · 核心知识与课堂练习",
      startTime: "2026-10-13T10:10:00",
      endTime: "2026-10-13T12:00:00",
      room: "思源楼 302",
      teacher: "王老师",
      teacherId: "",
      content: "本节课回顾核心概念，结合实例讲解应用方法。",
    },
    {
      id: "demo-replay-2",
      videoId: "",
      courseId: root.courseId ?? root.id,
      name: "第八周 · 课程讨论",
      startTime: "2026-10-20T10:10:00",
      endTime: "2026-10-20T12:00:00",
      room: "思源楼 302",
      teacher: "王老师",
      teacherId: "",
      content: "录制完成后可查看回放。",
    },
  ];
}
function replayDisplayTitle(replay: Replay) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(replay.name)) return replay.name;
  const date = new Date(replay.startTime);
  return Number.isNaN(date.getTime())
    ? replay.name
    : new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(date);
}
function replayTimeRange(replay: Replay) {
  const time = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(date);
  };
  return [time(replay.startTime), time(replay.endTime)]
    .filter(Boolean)
    .join("–");
}
function replayDateLabel(replay: Replay) {
  if (/^\d{4}-\d{2}-\d{2}/.test(replay.name)) return "";
  const date = new Date(replay.startTime);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
      }).format(date);
}
function CourseReplayView({
  account,
  root,
  cache,
  onCache,
}: {
  account: Account;
  root: Resource;
  cache: Record<string, Replay[]>;
  onCache: (id: string, list: Replay[]) => void;
}) {
  const [rootList, setRootList] = useState<Replay[]>(() => cache[root.id] ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useErrorState();
  const [refresh, setRefresh] = useState(0);
  const [player, setPlayer] = useState<{
    replay: Replay;
    links: ReplayLink[];
  } | null>(null);
  const [fetching, setFetching] = useState("");
  const playableCount = rootList.filter((item) => Boolean(item.videoId)).length;
  useEffect(() => {
    let current = true;
    setError("");
    setRootList(cache[root.id] ?? []);
    setLoading(true);
    const task = account.demo
      ? Promise.resolve(demoReplays(root))
      : loadReplays(account.id, root.courseId!);
    void task
      .then((list) => {
        if (current) {
          setRootList(list);
          onCache(root.id, list);
        }
      })
      .catch((reason) => {
        if (current) setError(String(reason));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [account.id, root.id, refresh]);
  async function play(replay: Replay) {
    if (account.demo) {
      setError("回放列表为演示数据，连接校园账号后可播放真实回放。");
      return;
    }
    setFetching(replay.id);
    setError("");
    try {
      const links = await loadReplayLinks(account.id, replay);
      setPlayer({ replay, links });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setFetching("");
    }
  }
  return (
    <>
      <div className="resource-detail-header">
        <div className="resource-detail-title">
          <div className="resource-detail-icon">
            <Video size={16} />
          </div>
          <div>
            <h2>课程回放</h2>
            <p className="resource-detail-sub">
              {[
                root.name,
                rootList.length > 0
                  ? `${rootList.length} 节回放 · ${playableCount} 节可播放`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="resource-detail-actions">
          <Button
            className="replay-refresh-button"
            variant="secondary"
            size="sm"
            aria-label="刷新回放"
            title="刷新回放"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            刷新
          </Button>
        </div>
      </div>

      {loading && !rootList.length && (
        <div className="replay-loading">
          <Loader variant="spinner" size={23} label="正在加载" />
          <p>正在读取这门课的回放安排…</p>
        </div>
      )}
      {!loading && !rootList.length && !error && (
        <Empty
          icon={<Video size={26} />}
          title="暂无课程回放"
          detail="录制完成并发布后，回放会显示在这里。"
        />
      )}
      {rootList.length > 0 && (
        <div className="replay-list is-embedded">
          {rootList.map((replay) => {
            const playable = Boolean(replay.videoId);
            const meta =
              [
                replayDateLabel(replay),
                replayTimeRange(replay),
                replay.room,
                replay.teacher,
              ]
                .filter(Boolean)
                .join(" · ") || "课程回放";
            return (
              <Button
                className={`replay-session-row${playable ? "" : " is-unpublished"}`}
                variant="ghost"
                key={replay.id}
                disabled={!playable || !!fetching}
                onClick={() => void play(replay)}
                aria-label={
                  playable
                    ? `播放 ${replayDisplayTitle(replay)} ${replayTimeRange(replay)}`
                    : `${replayDisplayTitle(replay)} 未发布`
                }
              >
                <span
                  className={`replay-session-icon${playable ? " is-playable" : ""}`}
                  aria-hidden="true"
                >
                  {playable ? <Play size={15} /> : <Video size={15} />}
                </span>
                <span className="replay-session-copy">
                  <strong className="replay-session-title">
                    {replayDisplayTitle(replay)}
                  </strong>
                  <span className="replay-session-meta">{meta}</span>
                </span>
                <span className="replay-session-action">
                  {fetching === replay.id ? (
                    <span className="replay-status-pill is-loading">
                      <Loader variant="spinner" size={14} label="正在加载" />
                      加载中
                    </span>
                  ) : playable ? (
                    <span className="replay-play-pill">
                      <Play size={13} />
                      播放
                    </span>
                  ) : (
                    <span className="replay-status-pill is-pending">未发布</span>
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      )}
      {player && (
        <ReplayPlayer
          account={account}
          {...player}
          onClose={() => setPlayer(null)}
        />
      )}
    </>
  );
}
function ReplayPlayer({
  account,
  replay,
  links: initialLinks,
  onClose,
}: {
  account: Account;
  replay: Replay;
  links: ReplayLink[];
  onClose: () => void;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [view, setView] = useState(
    initialLinks.find((link) => link.view === "teacher")?.view ??
      initialLinks[0]?.view ??
      "teacher",
  );
  const [, setError] = useErrorState();
  const feedback = useFeedback();
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const link = links.find((item) => item.view === view);
  async function refreshLinks() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await loadReplayLinks(account.id, replay);
      if (!next.length) throw Error("这节课暂未提供可播放的回放链接");
      setLinks(next);
      if (!next.some((item) => item.view === view)) setView(next[0].view);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRefreshing(false);
    }
  }
  async function copy(url: string) {
    try {
      await copyText(url);
      feedback("回放链接已复制");
    } catch (reason) {
      setError(String(reason));
    }
  }
  async function download() {
    if (!link) return;
    setPicking(true);
    try {
      await queueDownloads(account.id, [
        {
          id: crypto.randomUUID(),
          name: `${replay.name}-${link.label}.mp4`,
          courseId: replay.courseId,
          rpId: replay.videoId,
          kind: "replay",
          view,
          teacherId: replay.teacherId,
        },
      ]);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPicking(false);
    }
  }
  return (
    <Modal
      title={replayDisplayTitle(replay)}
      subtitle={[replayTimeRange(replay), replay.room, replay.teacher]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
      wide
      pageable="always"
    >
      <div className="replay-player-page">
        {link ? (
          <ReplayViewer
            key={revision}
            links={links}
            view={view}
            onViewChange={setView}
            onRefresh={refreshLinks}
            refreshing={refreshing}
          />
        ) : (
          <p className="quiet-empty">此课程尚未提供可播放的回放。</p>
        )}
        <div className="replay-primary-actions">
          <Button
            variant="secondary"
            disabled={refreshing}
            onClick={() => void refreshLinks()}
          >
            <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            {refreshing ? "正在获取" : "刷新播放地址"}
          </Button>
          <Button disabled={picking || !link || link.streamOnly} onClick={() => void download()}>
            <Download size={16} />
            {picking ? "正在加入" : link?.streamOnly ? "此视角仅供播放" : "下载此视角"}
          </Button>
        </div>
        {replay.content && (
          <p className="replay-description">{replay.content}</p>
        )}
        <Collapsible className="replay-more">
          <CollapsibleTrigger className="replay-more-trigger">
            链接与外部播放
            <CollapsibleIndicator />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="replay-link-list">
              {links.map((item) => (
                <label key={item.view}>
                  <span>{item.label}</span>
                  <textarea
                    aria-label={`${item.label}原始链接`}
                    readOnly
                    rows={3}
                    value={item.url}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copy(item.url)}
                  >
                    <Copy size={14} />
                    复制链接
                  </Button>
                </label>
              ))}
            </div>
            <div className="replay-secondary-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  void copy(links.map((item) => item.url).join("\n"))
                }
              >
                <Copy size={15} />
                复制全部链接
              </Button>
              <Button
                variant="secondary"
                disabled={!link}
                onClick={() => {
                  if (link)
                    void openUrl(link.url).catch((reason) =>
                      setError(String(reason)),
                    );
                }}
              >
                <ExternalLink size={15} />
                外部打开
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Modal>
  );
}
