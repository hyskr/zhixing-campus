import { useFeedback } from "./ui";
import {
  FileUpload,
  createFileUploadItem,
  type FileUploadItem,
} from "@/components/motion/file-upload";
import { ErrorAlert } from "./ui";
import { Checkbox } from "@/components/motion/checkbox";
// 参考来源：参考上传记录保存、链接复制及附件复用的功能组织；界面与存储由本项目实现。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/saved-uploads.js
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/index.js
import { useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import {
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { useFilePreview } from "./FilePreview";
import type { Account, UploadedFile } from "./types";
import { usePreferences } from "./preferences";
import { copyLinks, downloadFiles, uploadFile, useUploads } from "./learning";
import { formatBytes } from "./Downloads";
import { fullDate } from "./ui";
export default function UploadPanel({
  account,
  noteId,
  selection,
  onSelection,
}: {
  account: Account;
  noteId?: string;
  selection?: UploadedFile[];
  onSelection?: (files: UploadedFile[]) => void;
}) {
  const setMessage = useFeedback("success");
  const preview = useFilePreview();
  const { preferences } = usePreferences();
  const { files, update } = useUploads(account.id);
  const [queue, setQueue] = useState<FileUploadItem[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(values: File[], added?: FileUploadItem[]) {
    if (busy || !values.length) return;
    const batch =
      added ?? values.map((file, index) => createFileUploadItem(file, index));
    if (!added) setQueue((current) => [...current, ...batch]);
    setQueue((current) =>
      current.map((item) =>
        batch.some((entry) => entry.id === item.id)
          ? { ...item, status: "queued", progress: 0, error: undefined }
          : item,
      ),
    );
    setBusy(true);
    setError("");
    let records = [...files];
    let selected = [...(selection ?? [])];
    try {
      for (let i = 0; i < values.length; i++) {
        const file = values[i];
        setQueue((current) =>
          current.map((item) =>
            item.id === batch[i].id
              ? { ...item, status: "uploading", error: undefined }
              : item,
          ),
        );
        setMessage(`正在上传 ${i + 1}/${values.length} · ${file.name}`, "info");
        const known = preferences.reuseUploads
          ? records.find(
              (v) =>
                v.name === file.name &&
                v.size === file.size &&
                v.lastModified === file.lastModified,
            )
          : undefined;
        const result =
          known &&
          window.confirm(
            `“${file.name}”已有上传记录，是否直接复用？\n取消将重新上传。`,
          )
            ? known
            : await uploadFile(account, file, noteId);
        if (!records.some((f) => f.id === result.id)) {
          records = [result, ...records];
          update(records, preferences.saveUploads);
        }
        if (!selected.some((f) => f.id === result.id)) selected.push(result);
        onSelection?.(selected);
        setQueue((current) =>
          current.map((item) =>
            item.id === batch[i].id
              ? { ...item, status: "success", progress: 100 }
              : item,
          ),
        );
      }
      setMessage(`已处理 ${values.length} 个文件`);
    } catch (e) {
      setQueue((current) =>
        current.map((item) =>
          batch.some((added) => added.id === item.id) &&
          item.status !== "success"
            ? { ...item, status: "error", error: String(e) }
            : item,
        ),
      );
      setError(String(e));
      setMessage("");
    } finally {
      setBusy(false);
    }
  }
  function paste(data: DataTransfer) {
    const values = Array.from(data.files);
    if (values.length) {
      void upload(values);
      return;
    }
    const text = data.getData("text/plain");
    if (text.trim())
      void upload([
        new File(
          [text],
          `粘贴文本-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`,
          { type: "text/plain" },
        ),
      ]);
  }
  function toggle(file: UploadedFile) {
    if (!onSelection) return;
    onSelection(
      selection?.some((f) => f.id === file.id)
        ? selection.filter((f) => f.id !== file.id)
        : [...(selection ?? []), file],
    );
  }
  async function action(fn: () => Promise<unknown>, success: string) {
    setError("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="upload-area">
      <div
        className="upload-drop"
        tabIndex={0}
        role="group"
        aria-label="文件上传，支持拖放与粘贴"
        onPaste={(event) => {
          event.preventDefault();
          paste(event.clipboardData);
        }}
      >
        <FileUpload
          value={queue}
          onValueChange={setQueue}
          onFilesAdded={(items, files) => void upload(files, items)}
          onRetry={(item) => {
            if (item.file) void upload([item.file], [item]);
          }}
          disabled={busy}
          multiple
          title="拖放文件，或选择文件"
          description="也可在此按 ⌘V / Ctrl+V 粘贴文件；粘贴文字会转为 TXT 上传。"
          browseLabel="选择文件"
          className="campus-upload"
        />
      </div>
      {busy && <progress className="upload-wait" aria-label="正在上传文件" />}
      
      {error && <ErrorAlert message={String(error)} />}
      <div className="upload-record-heading">
        <h3>
          已上传文件 <span className="count-pill">{files.length}</span>
        </h3>
        {onSelection && <span>勾选作为本次作业附件</span>}
      </div>
      {!files.length && (
        <p className="quiet-empty">上传成功的文件会显示在这里。</p>
      )}
      <div className="upload-records">
        {files.map((file) => (
          <div className="uploaded-row" key={file.id}>
            {onSelection && (
              <Checkbox
                aria-label={`选择附件 ${file.name}`}
                checked={!!selection?.some((f) => f.id === file.id)}
                onCheckedChange={() => toggle(file)}
              />
            )}
            <FileText size={18} />
            <div className="file-row-info">
              <strong>{file.name}</strong>
              <small>
                {formatBytes(file.size)} · {fullDate(file.uploadedAt)}
              </small>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => preview(file, account)}
            >
              查看
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`复制 ${file.name} 链接`}
              onClick={() =>
                action(() => copyLinks(account, [file]), "链接已复制")
              }
            >
              <Copy size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`下载 ${file.name}`}
              onClick={() =>
                action(() => downloadFiles(account, [file]), "已加入下载")
              }
            >
              <Download size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`移除 ${file.name} 的本地记录`}
              onClick={() => {
                update(
                  files.filter((f) => f.id !== file.id),
                  preferences.saveUploads,
                );
                onSelection?.(
                  (selection ?? []).filter((f) => f.id !== file.id),
                );
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
