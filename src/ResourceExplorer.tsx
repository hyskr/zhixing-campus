// BeUI 组件来源：https://beui.dev/r/file-tree.json
import { ActionSwapBlurButton } from "@/components/motion/action-swap-blur";
import { Loader } from "@/components/motion/loader";
import { useMotionValue } from "motion/react";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Presentation,
  RefreshCw,
  Video,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import { Checkbox } from "@/components/motion/checkbox";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/motion/file-tree";
import { OverflowActions } from "@/components/motion/overflow-actions";
import type { Resource } from "./types";
import { useFeedback } from "./ui";

type Entry = { key: string; node: Resource; children: Entry[] };
function entries(nodes: Resource[], parent = ""): Entry[] {
  return nodes.map((node, index) => {
    const key = `${parent}/${index}-${node.id}`;
    return { key, node, children: entries(node.children, key) };
  });
}
function allEntries(nodes: Entry[]): Entry[] {
  return nodes.flatMap((entry) => [entry, ...allEntries(entry.children)]);
}
function hasMatch(entry: Entry, query: string): boolean {
  return (
    !query ||
    entry.node.name.includes(query) ||
    entry.children.some((child) => hasMatch(child, query))
  );
}
function icon(node: Resource) {
  if (node.kind === "course") return <BookOpen size={16} />;
  if (node.kind === "folder") {
    if (node.docType === "1") return <Presentation size={16} />;
    if (node.docType === "10") return <FileSpreadsheet size={16} />;
    return <Folder size={16} />;
  }
  const ext = node.name.split(".").at(-1)?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || ""))
    return <FileImage size={16} />;
  if (["ppt", "pptx", "key"].includes(ext || ""))
    return <Presentation size={16} />;
  if (["mp4", "mov", "m4v"].includes(ext || "")) return <Video size={16} />;
  if (["zip", "rar", "7z"].includes(ext || ""))
    return <FileArchive size={16} />;
  return <FileText size={16} />;
}
function fileCount(node: Resource): number {
  return node.kind === "file"
    ? 1
    : node.children.reduce((sum, child) => sum + fileCount(child), 0);
}

export default function ResourceExplorer({
  roots,
  query,
  selected,
  onSelectionChange,
  onLoad,
  onDetail,
  onDownload,
  onCopy,
  onPreview,
  onTreeDownload,
  onCalendar,
  busy,
  compact = false,
}: {
  roots: Resource[];
  query: string;
  selected: Record<string, Resource>;
  onSelectionChange: (files: Record<string, Resource>) => void;
  onLoad: (node: Resource) => Promise<Resource[]>;
  onDetail: (node: Resource) => void;
  onDownload: (nodes: Resource[]) => void;
  onCopy: (nodes: Resource[]) => Promise<boolean> | boolean;
  onPreview: (node: Resource) => void;
  onTreeDownload: (node: Resource) => Promise<void>;
  onCalendar: (node: Resource) => Promise<void>;
  busy: boolean;
  compact?: boolean;
}) {
  const tree = entries(roots);
  const nodes = allEntries(tree);
  const byKey = new Map(nodes.map((entry) => [entry.key, entry]));
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>(
    tree[0] ? [tree[0].key] : [],
  );
  const requests = useRef(new Map<string, Promise<Resource[] | undefined>>());
  const [selectingKey, setSelectingKey] = useState("");
  const [selectionProgress, setSelectionProgress] = useState("");
  const selectionRunning = useRef(false);
  const notify = useFeedback("info");
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState("");
  useEffect(() => {
    if (!copiedKey) return;
    const timer = setTimeout(() => setCopiedKey(""), 2200);
    return () => clearTimeout(timer);
  }, [copiedKey]);
  const scrollHost = useRef<HTMLElement>(null);
  const scrollProgress = useMotionValue(0);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const host = scrollHost.current;
    if (!host) return;
    const update = () => {
      const height = host.scrollHeight - host.clientHeight;
      setScrollable(height > 1);
      scrollProgress.set(height > 0 ? host.scrollTop / height : 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    if (host.firstElementChild) observer.observe(host.lastElementChild!);
    host.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      host.removeEventListener("scroll", update);
    };
  }, [expanded.join("|"), nodes.length, scrollProgress]);

  const effectiveKey =
    currentKey && byKey.has(currentKey) ? currentKey : (tree[0]?.key ?? null);
  const current = effectiveKey ? byKey.get(effectiveKey)?.node : undefined;
  const files = nodes
    .filter((entry) => entry.node.kind === "file")
    .map((entry) => entry.node);
  const picked = Object.values(selected);
  const expandedIds = query
    ? nodes
        .filter((entry) => entry.node.kind !== "file")
        .map((entry) => entry.key)
    : expanded;

  async function load(entry: Entry): Promise<Resource[] | undefined> {
    if (entry.node.kind === "file") return [];
    const pending = requests.current.get(entry.key);
    if (pending) return pending;
    setErrors((current) => ({ ...current, [entry.key]: "" }));
    const request = Promise.resolve().then(() => onLoad(entry.node)).catch((reason) => {
      setErrors((current) => ({ ...current, [entry.key]: String(reason) }));
      notify(String(reason), "error");
      return undefined;
    }).finally(() => {
      requests.current.delete(entry.key);
      setLoadingKeys(new Set(requests.current.keys()));
    });
    requests.current.set(entry.key, request);
    setLoadingKeys(new Set(requests.current.keys()));
    return request;
  }
  function changeExpanded(next: string[]) {
    const added = next.find((key) => !expandedIds.includes(key));
    setExpanded(next);
    const entry = added && byKey.get(added);
    if (entry && entry.node.loaded === false) void load(entry);
  }
  function selectEntry(key: string) {
    setCurrentKey(key);
    const entry = byKey.get(key);
    if (!entry || entry.node.kind === "file") return;
    if (entry.node.loaded === false) void load(entry);
  }
  const currentEntry = effectiveKey ? byKey.get(effectiveKey) : undefined;
  const firstCategory = currentEntry?.node.kind === "course" ? currentEntry.children.find((child) => child.node.docType === "1") : undefined;
  useEffect(() => {
    if (!currentEntry || currentEntry.node.kind !== "course") return;
    if (currentEntry.node.loaded === false || !currentEntry.children.length) {
      void load(currentEntry);
    } else if (firstCategory) {
      setExpanded((current) => [...new Set([...current, currentEntry.key, firstCategory.key])]);
      if (firstCategory.node.loaded === false) void load(firstCategory);
    }
  }, [effectiveKey, currentEntry?.node.loaded, firstCategory?.key, firstCategory?.node.loaded]);
  function descendantFiles(node: Resource): Resource[] {
    return node.kind === "file" ? [node] : node.children.flatMap(descendantFiles);
  }
  async function toggleSelection(entry: Entry | null, checked: boolean) {
    if (selectionRunning.current) return;
    const next = { ...selected };
    if (!checked || entry?.node.kind === "file") {
      if (!entry) { onSelectionChange({}); return; }
      for (const file of descendantFiles(entry.node)) {
        if (checked) next[file.id] = file;
        else delete next[file.id];
      }
      onSelectionChange(next);
      return;
    }
    selectionRunning.current = true;
    setSelectingKey(entry?.key ?? "__all");
    let failures = 0;
    async function collect(directory: Entry): Promise<Resource[]> {
      setSelectionProgress(`正在读取：${directory.node.name}`);
      const children = await load(directory);
      if (!children) { failures++; return []; }
      const files: Resource[] = [];
      for (const child of entries(children, directory.key)) {
        if (child.node.kind === "file") files.push(child.node);
        else files.push(...await collect(child));
      }
      return files;
    }
    try {
      const targets = entry ? [entry] : tree;
      const files: Resource[] = [];
      for (const target of targets) files.push(...await collect(target));
      for (const target of targets) for (const oldFile of descendantFiles(target.node)) delete next[oldFile.id];
      for (const file of files) next[file.id] = file;
      onSelectionChange(next);
      notify(failures ? `已选择 ${files.length} 个文件，${failures} 个目录读取失败，可在目录中重试。` : files.length ? `目录已刷新，已选择 ${files.length} 个文件` : "目录已刷新，暂无可选文件");
    } finally {
      selectionRunning.current = false;
      setSelectingKey("");
      setSelectionProgress("");
    }
  }
  function render(entry: Entry): React.ReactNode {
    if (!hasMatch(entry, query)) return null;
    const node = entry.node;
    if (node.kind === "file")
      return (
        <FileTreeFile
          key={entry.key}
          value={entry.key}
          name={node.name}
          icon={icon(node)}
        />
      );
    return (
      <FileTreeFolder
        key={entry.key}
        value={entry.key}
        name={`${node.name}${loadingKeys.has(entry.key) ? " · 加载中" : errors[entry.key] ? " · 加载失败" : ""}`}
        icon={icon(node)}
      >
        {entry.children.map(render)}
        {!entry.children.length && (
          <FileTreeFile
            value={`${entry.key}/not-loaded`}
            name={loadingKeys.has(entry.key) ? "正在读取子目录…" : errors[entry.key] ? "加载失败，点击右侧重试" : node.loaded === false ? "点击目录读取内容" : "此目录暂无资料"}
            disabled
            icon={<FolderOpen size={16} />}
          />
        )}
      </FileTreeFolder>
    );
  }
  return (
    <section
      className={`surface resource-explorer ${compact ? "compact" : ""}`}
    >
      <div className="resource-explorer-toolbar">
        <div>
          <h2>课程文件</h2>
          <p>
            {roots.length} 门课程 · 已加载 {files.length} 个文件
          </p>
        </div>
        <div className="resource-explorer-toolbar-actions">
          <Checkbox
            aria-label="全选课程文件，读取全部目录"
            checked={!!files.length && files.every((node) => !!selected[node.id])}
            indeterminate={picked.length > 0 && !files.every((node) => !!selected[node.id])}
            disabled={!roots.length || !!selectingKey || busy}
            onCheckedChange={(checked) => void toggleSelection(null, checked)}
          />
          <span role="status">{selectingKey ? selectionProgress || "正在读取目录…" : `${picked.length} 个已选`}</span>
          <OverflowActions
            size="sm"
            openLabel="更多文件操作"
            primaryActions={[
              {
                id: "download",
                label: "下载选中",
                icon: <Download size={14} />,
                disabled: !picked.length || busy || !!selectingKey,
                onClick: () => onDownload(picked),
              },
            ]}
            overflowActions={[
              {
                id: "copy",
                label: "复制选中链接",
                icon: <Copy size={14} />,
                disabled: !picked.length || busy || !!selectingKey,
                onClick: () => onCopy(picked),
              },
            ]}
          />
        </div>
      </div>
      <div className="resource-explorer-body">
        <aside ref={scrollHost} className="resource-explorer-tree">
          {scrollable && (
            <ScrollProgress
              progress={scrollProgress}
              fixed={false}
              spring={false}
              height={2}
            />
          )}
          <div className="resource-explorer-caption">勾选文件直接选择；勾选目录先读取全部子目录</div>
          {tree.length ? (
            <FileTree
              ariaLabel="课程资料目录"
              value={effectiveKey}
              onValueChange={selectEntry}
              expandOnSelect
              expandedIds={expandedIds}
              onExpandedChange={changeExpanded}
              renderAccessory={(key) => {
                const entry = byKey.get(key);
                if (!entry) return null;
                const descendants = descendantFiles(entry.node);
                const count = descendants.filter((file) => !!selected[file.id]).length;
                if (selectingKey === key) return <Loader size={17} label="读取目录后选择文件" />;
                return <Checkbox
                  aria-label={entry.node.kind === "file" ? `选择文件 ${entry.node.name}` : `选择 ${entry.node.name}，刷新并读取全部子目录`}
                  checked={!!descendants.length && count === descendants.length}
                  indeterminate={count > 0 && count < descendants.length}
                  disabled={!!selectingKey || busy}
                  onCheckedChange={(checked) => void toggleSelection(entry, checked)}
                />;
              }}
              className="campus-file-tree"
            >
              {tree.map(render)}
            </FileTree>
          ) : (
            <p className="quiet-empty">暂无课程资料。</p>
          )}
        </aside>
        <article className="resource-explorer-detail">
          {current ? (
            <>
              <div className="resource-detail-icon">{icon(current)}</div>
              <p className="resource-detail-kind">
                {current.kind === "course"
                  ? "课程"
                  : current.kind === "folder"
                    ? "文件夹"
                    : "课程文件"}
              </p>
              <h2>{current.name}</h2>
              <p className="resource-detail-course">
                {current.kind === "course" ? "课程目录" : current.course}
              </p>
              <div className="resource-detail-facts">
                {current.kind === "file" ? (
                  <>
                    <span>文件大小</span>
                    <strong>{current.size || "未知"}</strong>
                  </>
                ) : (
                  <>
                    <span>已加载文件</span>
                    <strong>{fileCount(current)} 个</strong>
                  </>
                )}
                {effectiveKey && loadingKeys.has(effectiveKey) ? <p role="status">正在读取子目录{current.children.length ? "，保留已有内容…" : "…"}</p> : current.loaded === false ? <p>尚未读取此目录。点击目录可加载内容。</p> : current.kind !== "file" && !current.children.length ? <p>此目录已读取，学校未返回文件或子目录。</p> : null}
              </div>
              {current.kind === "file" ? (
                <>
                  <div className="resource-detail-actions">
                    <Button size="sm" onClick={() => onPreview(current)}>
                      <Eye size={15} />
                      在线查看
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onDownload([current])}
                    >
                      <Download size={15} />
                      下载
                    </Button>
                    <ActionSwapBlurButton
                      size="sm"
                      variant="ghost"
                      cycle={false}
                      value={copiedKey === effectiveKey ? "copied" : "copy"}
                      items={[
                        {
                          id: "copy",
                          label: "复制链接",
                          icon: <Copy size={15} />,
                        },
                        {
                          id: "copied",
                          label: "已复制",
                          icon: <Check size={15} />,
                        },
                      ]}
                      onClick={async () => {
                        if (await onCopy([current]))
                          setCopiedKey(effectiveKey ?? "");
                      }}
                    />
                  </div>
                  <button
                    className="resource-detail-more"
                    onClick={() => onDetail(current)}
                  >
                    查看文件详情与原始链接
                  </button>
                </>
              ) : (
                <div className="resource-detail-actions">
                  <Button
                    size="sm"
                    onClick={() => {
                      const entry = effectiveKey && byKey.get(effectiveKey);
                      if (entry) void load(entry);
                    }}
                    disabled={!!effectiveKey && loadingKeys.has(effectiveKey)}
                  >
                    {!!effectiveKey && loadingKeys.has(effectiveKey) ? (
                      <Loader size={15} label="加载目录" />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                    {!!effectiveKey && loadingKeys.has(effectiveKey)
                      ? "加载中"
                      : current.loaded === false
                        ? "加载目录"
                        : "刷新目录"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void onTreeDownload(current)}
                    disabled={busy}
                  >
                    <Download size={15} />
                    递归下载
                  </Button>
                  {current.kind === "course" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onCalendar(current)}
                    >
                      <CalendarDays size={15} />
                      教学日历
                    </Button>
                  )}
                </div>
              )}
              {current.kind === "file" && selected[current.id] && (
                <div className="resource-detail-selected">
                  <Check size={14} />
                  已加入批量选择
                </div>
              )}
            </>
          ) : (
            <div className="resource-detail-empty">
              选择左侧课程或文件查看操作。
            </div>
          )}
          
        </article>
      </div>
    </section>
  );
}
