import { useCompactLayout } from "./platform";
import FileActionsSheet from "./FileActionsSheet";
import { useErrorState } from "./ui";
import { useFeedback } from "./ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Checkbox } from "@/components/motion/checkbox";
import { Input } from "@/components/motion/input";
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button";
import {
  Copy,
  Download,
  FileText,
  MoreVertical,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Account, SpaceFile } from "./types";
import { PageHeading } from "./Pages";
import { copyLinks, downloadFiles, loadSpace } from "./learning";
import { useFilePreview } from "./FilePreview";
import UploadPanel from "./UploadPanel";
import { Empty } from "./ui";
export default function FileSpace({ account }: { account: Account }) {
  const compactLayout = useCompactLayout();
  const [moreFile, setMoreFile] = useState<SpaceFile | null>(null);
  const setMessage = useFeedback("success");
  const preview = useFilePreview();
  const [tab, setTab] = useState("个人资源空间"),
    [query, setQuery] = useState(""),
    [request, setRequest] = useState(""),
    [version, setVersion] = useState(0),
    [files, setFiles] = useState<SpaceFile[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useErrorState();
  useEffect(() => {
    if (tab !== "个人资源空间") return;
    let active = true;
    setLoading(true);
    setError("");
    void loadSpace(account, request)
      .then((values) => {
        if (active) {
          setFiles(values);
          setSelected([]);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [account.id, request, version, tab]);
  async function action(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setMessage(msg);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const values = files.filter((f) => selected.includes(f.id));
  return (
    <>
      <PageHeading
        eyebrow="FILES"
        title="文件空间"
        description="课程资源与自己的文件，随取随用。"
      />
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next)}
        variant="underline"
        className="file-space-tabs"
      >
        <TabsList>
          {["个人资源空间", "上传与已上传文件"].map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "上传与已上传文件" ? (
        <section className="surface file-space-panel">
          <UploadPanel account={account} />
        </section>
      ) : (
        <section className="surface file-space-panel">
          <div className="file-space-toolbar">
            <form
              className="file-space-search"
              onSubmit={(e) => {
                e.preventDefault();
                setRequest(query);
                setVersion((v) => v + 1);
              }}
            >
              <Search size={15} />
              <Input
                type="search"
                enterKeyHint="search"
                aria-label="搜索个人资源"
                placeholder="搜索个人资源"
                value={String(query)}
                onChange={(e) => setQuery(e)}
              />
              <Button size="sm" type="submit">
                搜索
              </Button>
            </form>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => setVersion((v) => v + 1)}
            >
              <RefreshCw size={14} />
              刷新
            </Button>
          </div>
          <div className="file-selection-toolbar">
            <Checkbox
              className="file-select-all"
              label={`全选 · ${files.length} 个文件`}
              aria-label="全选个人资源"
              disabled={!files.length || loading || busy}
              checked={
                !!files.length && files.every((f) => selected.includes(f.id))
              }
              indeterminate={
                files.some((f) => selected.includes(f.id)) &&
                !files.every((f) => selected.includes(f.id))
              }
              onCheckedChange={(checked) =>
                setSelected(checked ? files.map((f) => f.id) : [])
              }
            />
            <span />
            <Button
              size="sm"
              variant="secondary"
              disabled={!values.length || busy}
              onClick={() =>
                action(() => copyLinks(account, values), "选中链接已复制")
              }
            >
              <Copy size={14} />
              复制选中链接
            </Button>
            <Button
              size="sm"
              disabled={!values.length || busy}
              onClick={() => action(() => downloadFiles(account, values), "")}
            >
              <Download size={14} />
              下载选中
            </Button>
          </div>
          {loading ? (
            <div className="inline-loading">
              <LoaderCircle className="spin" size={18} />
              正在读取资源空间…
            </div>
          ) : files.length ? (
            <div className="space-file-list">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="space-file-row"
                  onContextMenu={(event) => {
                    if (compactLayout) {
                      event.preventDefault();
                      setMoreFile(f);
                    }
                  }}
                >
                  <Checkbox
                    aria-label={`选择资源 ${f.name}`}
                    checked={selected.includes(f.id)}
                    onCheckedChange={(e) =>
                      setSelected((prev) =>
                        e ? [...prev, f.id] : prev.filter((id) => id !== f.id),
                      )
                    }
                  />
                  <FileText size={20} />
                  <div className="file-row-info">
                    <strong>{f.name}</strong>
                    <small>
                      {f.size} · {f.inputTime || "未提供上传时间"}
                    </small>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => preview(f, account)}
                  >
                    查看
                  </Button>
                  {compactLayout ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="mobile-file-more"
                      aria-label={`文件操作 ${f.name}`}
                      onClick={() => setMoreFile(f)}
                    >
                      <MoreVertical size={19} />
                    </Button>
                  ) : (
                    <>
                      {" "}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`复制资源 ${f.name} 链接`}
                        onClick={() =>
                          action(() => copyLinks(account, [f]), "链接已复制")
                        }
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          action(() => downloadFiles(account, [f]), "")
                        }
                      >
                        <Download size={14} />
                        下载
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !error && (
              <Empty
                title="资源空间暂无文件"
                detail="学校资源空间与本机上传记录分别展示。"
              />
            )
          )}
        </section>
      )}
      {compactLayout && (
        <FileActionsSheet
          open={!!moreFile}
          title={moreFile?.name || "文件"}
          onClose={() => setMoreFile(null)}
          actions={
            moreFile
              ? [
                  {
                    id: "copy",
                    label: "复制链接",
                    icon: <Copy size={19} />,
                    run: () =>
                      action(
                        () => copyLinks(account, [moreFile]),
                        "链接已复制",
                      ),
                  },
                  {
                    id: "download",
                    label: "下载文件",
                    icon: <Download size={19} />,
                    run: () =>
                      action(() => downloadFiles(account, [moreFile]), ""),
                  },
                ]
              : []
          }
        />
      )}
    </>
  );
}
