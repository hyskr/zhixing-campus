import {
  FileUpload,
  type FileUploadItem,
} from "@/components/motion/file-upload";
import { useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Send } from "lucide-react";
import { Modal, useErrorState, useFeedback } from "./ui";
import {
  cancelMail,
  recipients,
  sendMail,
  uploadMail,
  type MailDraft,
} from "./mailbox";
import type { Account } from "./types";
export default function MailCompose({
  account,
  initial,
  onClose,
  onSent,
}: {
  account: Account;
  initial: MailDraft;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [, setError] = useErrorState(),
    feedback = useFeedback();
  const [queue, setQueue] = useState<FileUploadItem[]>([]);
  const attachmentIds = useRef(new Map<string, number>());
  const [to, setTo] = useState(initial.to.join("; ")),
    [cc, setCc] = useState(initial.cc.join("; ")),
    [bcc, setBcc] = useState(initial.bcc.join("; "));
  const outgoing = {
    ...draft,
    to: recipients(to),
    cc: recipients(cc),
    bcc: recipients(bcc),
  };
  async function add(files: File[], items: FileUploadItem[]) {
    if (uploading || busy) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const id = items[i].id;
        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? { ...item, status: "uploading", progress: 0 }
              : item,
          ),
        );
        try {
          const attachment = await uploadMail(account, draft.id, files[i]);
          attachmentIds.current.set(id, attachment.id);
          setDraft((d) => ({
            ...d,
            attachments: [...d.attachments, attachment],
          }));
          setQueue((q) =>
            q.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "success",
                    progress: 100,
                    error: undefined,
                  }
                : item,
            ),
          );
        } catch (error) {
          setQueue((q) =>
            q.map((item) =>
              item.id === id
                ? { ...item, status: "error", error: String(error) }
                : item,
            ),
          );
          setError(String(error));
        }
      }
    } finally {
      setUploading(false);
    }
  }
  async function send() {
    setBusy(true);
    try {
      await sendMail(account, outgoing);
      feedback("邮件已发送");
      onSent();
      onClose();
    } catch (error) {
      setError(
        `发送未确认：${String(error)}。请先在学校邮箱核对发件记录，再决定是否重试。`,
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (busy || uploading) return;
    onClose();
    try {
      await cancelMail(account, draft.id);
    } catch (error) {
      feedback(
        `写信窗口已关闭，服务器草稿取消未确认：${String(error)}`,
        "error",
      );
    }
  }
  return (
    <Modal
      title={confirm ? "确认发送邮件" : draft.replyTo ? "回复邮件" : "新建邮件"}
      subtitle={
        confirm ? draft.subject || "无主题" : "使用当前校园邮箱账号发送"
      }
      onClose={() => {
        if (confirm && !busy) setConfirm(false);
        else void close();
      }}
      wide
    >
      {confirm ? (
        <>
          <div className="mail-send-review">
            <p>收件人：{outgoing.to.join("；")}</p>
            {outgoing.cc.length > 0 && <p>抄送：{outgoing.cc.join("；")}</p>}
            {outgoing.bcc.length > 0 && <p>密送：{outgoing.bcc.join("；")}</p>}
            <p>{draft.attachments.length} 个附件</p>
            <p className="mail-text-review">{draft.text}</p>
          </div>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              返回编辑
            </Button>
            <Button disabled={busy} onClick={() => void send()}>
              {busy ? "正在发送…" : "确认发送"}
            </Button>
          </div>
        </>
      ) : (
        <div className="mail-compose">
          <label>
            收件人
            <Input
              aria-label="收件人"
              value={to}
              onChange={setTo}
              placeholder="多个地址用分号分隔"
            />
          </label>
          <label>
            抄送
            <Input aria-label="抄送" value={cc} onChange={setCc} />
          </label>
          <label>
            密送
            <Input aria-label="密送" value={bcc} onChange={setBcc} />
          </label>
          <label>
            主题
            <Input
              aria-label="邮件主题"
              value={draft.subject}
              onChange={(v) => setDraft((d) => ({ ...d, subject: v }))}
            />
          </label>
          <textarea
            aria-label="邮件正文"
            placeholder="写下邮件正文…"
            value={draft.text}
            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
            disabled={busy}
          />
          <FileUpload
            value={queue}
            onValueChange={setQueue}
            onFilesAdded={(items, files) => void add(files, items)}
            onRetry={(item) => {
              if (item.file) void add([item.file], [item]);
            }}
            onRemove={(item) => {
              const id = attachmentIds.current.get(item.id);
              setDraft((d) => ({
                ...d,
                attachments: d.attachments.filter((a) => a.id !== id),
              }));
              attachmentIds.current.delete(item.id);
            }}
            disabled={busy || uploading}
            multiple
            title="邮件附件"
            description="选择或拖入文件，上传到学校邮箱。"
            browseLabel="添加附件"
            className="campus-upload mail-upload"
          />
          <div className="modal-actions">
            <Button
              variant="ghost"
              disabled={busy || uploading}
              onClick={() => void close()}
            >
              放弃草稿
            </Button>
            <Button
              disabled={
                busy ||
                uploading ||
                !outgoing.to.length ||
                queue.some((item) => item.status === "error")
              }
              onClick={() => setConfirm(true)}
            >
              <Send size={14} />
              核对并发送
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
