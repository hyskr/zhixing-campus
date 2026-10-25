import { useCompactLayout } from "./platform";
import { DiscardDraft } from "./ui";
import { useErrorState } from "./ui";
import { useFeedback } from "./ui";
import { Loader } from "@/components/motion/loader";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button";
import { Copy, Download, LoaderCircle, RefreshCw, Send } from "lucide-react";
import type {
  Account,
  Attachment,
  Homework,
  HomeworkDetailData,
  UploadedFile,
} from "./types";
import {
  attachmentLinks,
  copyLinks,
  downloadFiles,
  homeworkIds,
  loadHomeworkDetail,
  submitHomework,
} from "./learning";
import { useFilePreview } from "./FilePreview";
import RichContent from "./RichContent";
import UploadPanel from "./UploadPanel";
import { DetailRow, fullDate, Modal } from "./ui";
import { formatBytes } from "./Downloads";
export default function HomeworkDetail({
  account,
  item,
  onClose,
  onUpdated,
}: {
  account: Account;
  item: Homework;
  onClose: () => void;
  onUpdated?: (courseId: string) => Promise<void>;
}) {
  const compactLayout = useCompactLayout();
  const [discard, setDiscard] = useState(false);
  const setMessage = useFeedback("success");
  const preview = useFilePreview();
  const [detail, setDetail] = useState<HomeworkDetailData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useErrorState();
  const [tab, setTab] = useState("作业要求"),
    [content, setContent] = useState(""),
    [files, setFiles] = useState<UploadedFile[]>([]),
    [confirm, setConfirm] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadHomeworkDetail(account, item)
      .then((d) => {
        if (active) setDetail(d);
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
  }, [account.id, item.id, version]);
  const submitted = (detail?.status ?? item.status) === "已提交";
  const canSubmit = !submitted || detail?.repeatAllowed !== false;
  async function act(fn: () => Promise<unknown>, msg: string) {
    setError("");
    try {
      await fn();
      setMessage(msg);
    } catch (e) {
      setError(String(e));
    }
  }
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await submitHomework(account, item, content, files);
      setMessage("作业提交成功");
      if (compactLayout) {
        setContent("");
        setFiles([]);
      }
      setConfirm(false);
      setTab("提交记录");
      setVersion((v) => v + 1);
      await onUpdated?.(homeworkIds(item).courseId);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }
  function attachments(rows: Attachment[]) {
    return (
      <div className="attachment-list">
        {rows.map((f) => (
          <div className="attachment-row" key={f.id || f.url}>
            <div>
              <strong>{f.name}</strong>
              {f.size > 0 && <small>{formatBytes(f.size)}</small>}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => preview(f, account)}
            >
              在线查看
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`复制附件 ${f.name} 链接`}
              onClick={() =>
                act(
                  () => copyLinks(account, attachmentLinks([f])),
                  "链接已复制",
                )
              }
            >
              <Copy size={14} />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                act(() => downloadFiles(account, attachmentLinks([f])), "")
              }
            >
              <Download size={14} />
              下载
            </Button>
          </div>
        ))}
      </div>
    );
  }
  function requestClose() {
    if (submitting) return;
    if (compactLayout && confirm) {
      setConfirm(false);
      return;
    }
    if (compactLayout && (content.trim() || files.length)) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  if (discard)
    return (
      <DiscardDraft
        title="放弃本次作业编辑？"
        detail="已填写的正文和附件选择将被清空；已上传的文件记录仍会保留。"
        onKeep={() => setDiscard(false)}
        onDiscard={onClose}
      />
    );
  return (
    <Modal
      title={item.title}
      subtitle={item.course}
      onClose={requestClose}
      wide
    >
      <div className="detail-tags">
        <span className="soft-tag blue">{item.type}</span>
        <span className={`soft-tag ${submitted ? "teal" : "orange"}`}>
          {detail?.status ?? item.status}
        </span>
        {detail?.score && (
          <span className="soft-tag purple">成绩 {detail.score}</span>
        )}
      </div>
      <div className="homework-time-grid">
        <DetailRow label="开放时间">
          {fullDate(detail?.openedAt || item.openedAt || "")}
        </DetailRow>
        <DetailRow label="截止时间">
          {fullDate(detail?.deadline || item.deadline)}
        </DetailRow>
      </div>
      <div className="homework-extra-meta">
        <span>
          提交人数 {detail?.submitCount ?? item.submitCount ?? "—"} /{" "}
          {detail?.allCount ?? item.allCount ?? "—"}
        </span>
        <span>
          批改状态 {detail?.reviewStatus ?? item.reviewStatus ?? "待同步"}
        </span>
        <span>分数 {detail?.score ?? item.score ?? "尚未公布"}</span>
      </div>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next);
          setConfirm(false);
        }}
        variant="underline"
        className="homework-detail-tabs"
      >
        <TabsList>
          {["作业要求", "提交记录", "提交作业"].map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {loading && (
        <div className="inline-loading">
          <Loader variant="spinner" size={18} label="正在加载" />
          正在读取完整作业信息…
        </div>
      )}
      {!loading && detail && (
        <>
          {tab === "作业要求" && (
            <>
              <RichContent
                account={account}
                content={detail.content || item.rawContent || item.content}
              />
              {detail.attachments.length > 0 && (
                <>
                  <h3 className="detail-section-heading">教师附件</h3>
                  {attachments(detail.attachments)}
                </>
              )}
            </>
          )}
          {tab === "提交记录" &&
            (submitted ? (
              <>
                <DetailRow label="提交时间">
                  {fullDate(detail.submittedAt || item.submittedAt || "")}
                </DetailRow>
                <h3 className="detail-section-heading">已交正文</h3>
                {detail.submittedContent ? (
                  <RichContent
                    account={account}
                    content={detail.submittedContent}
                  />
                ) : (
                  <p className="quiet-empty">
                    {detail.reviewError || "未填写正文"}
                  </p>
                )}
                {detail.submittedAttachments.length > 0 && (
                  <>
                    <h3 className="detail-section-heading">已交附件</h3>
                    {attachments(detail.submittedAttachments)}
                  </>
                )}
                <div className="review-card">
                  <h3>成绩与批改意见</h3>
                  <strong>{detail.score || "尚未公布成绩"}</strong>
                  <p>{detail.comment || "暂无批改意见"}</p>
                </div>
              </>
            ) : (
              <p className="quiet-empty">这项作业尚未提交。</p>
            ))}
          {tab === "提交作业" &&
            (canSubmit ? (
              <>
                {!confirm ? (
                  <>
                    <label className="submission-content-label">
                      文字说明
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="填写作业正文或说明，也可以只提交附件。"
                        rows={5}
                      />
                    </label>
                    <UploadPanel
                      account={account}
                      noteId={homeworkIds(item).sourceId}
                      selection={files}
                      onSelection={setFiles}
                    />
                    <div className="modal-actions">
                      <Button
                        disabled={!content.trim() && !files.length}
                        onClick={() => setConfirm(true)}
                      >
                        <Send size={14} />
                        核对并提交
                        {files.length ? ` (${files.length} 个附件)` : ""}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="submission-confirm">
                    <h3>确认提交至「{item.course}」</h3>
                    <p>{item.title}</p>
                    <div className="submission-preview">
                      {content || "未填写文字说明"}
                    </div>
                    <ul>
                      {files.map((f) => (
                        <li key={f.id}>
                          {f.name} · {formatBytes(f.size)}
                        </li>
                      ))}
                    </ul>
                    {!detail.repeatAllowed && (
                      <p className="orange-text">
                        此作业不允许重复提交，提交后可能无法修改。
                      </p>
                    )}
                    <div className="modal-actions">
                      <Button
                        variant="secondary"
                        disabled={submitting}
                        onClick={() => setConfirm(false)}
                      >
                        返回修改
                      </Button>
                      <Button disabled={submitting} onClick={submit}>
                        {submitting ? (
                          <Loader
                            variant="spinner"
                            size={14}
                            label="正在加载"
                          />
                        ) : (
                          <Send size={14} />
                        )}
                        确认提交
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="quiet-empty">此作业已提交，平台不允许重复提交。</p>
            ))}
        </>
      )}

      <div className="modal-actions">
        <Button
          size="sm"
          variant="ghost"
          disabled={loading || submitting}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={14} />
          刷新详情
        </Button>
      </div>
    </Modal>
  );
}
