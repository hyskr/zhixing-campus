import { useCompactLayout } from "./platform";
import { DiscardDraft } from "./ui";
import { useErrorState } from "./ui";
import { useFeedback } from "./ui";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Loader } from "@/components/motion/loader";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button";
import {
  Clock3,
  Copy,
  Download,
  FileCheck2,
  RefreshCw,
  Send,
} from "lucide-react";
import type {
  Account,
  Attachment,
  Homework,
  HomeworkDetailData,
  UploadedFile,
} from "./types";
import { timeRemaining, useNow } from "./homework";
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
import { fullDate, Modal } from "./ui";
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
  const now = useNow();
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
      setContent("");
      setFiles([]);
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
    if (confirm) {
      setConfirm(false);
      return;
    }
    if (content.trim() || files.length) {
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
  const reviewStatus = detail?.reviewStatus ?? item.reviewStatus;
  const hasSubmitCount =
    detail?.submitCount !== undefined || item.submitCount !== undefined;
  return (
    <Modal
      title={item.title}
      subtitle={item.course}
      onClose={requestClose}
      wide
      pageable
    >
      <div
        className={`homework-detail-shell${compactLayout ? " is-compact" : ""}`}
        data-tab-swipe-surface=""
      >
        <div className="homework-detail-header-meta">
          <div className="detail-tags">
            <AnimatedBadge status="info" size="sm" showIcon={false}>
              {item.type}
            </AnimatedBadge>
            <AnimatedBadge
              status={submitted ? "success" : "warning"}
              size="sm"
              showIcon={false}
            >
              {detail?.status ?? item.status}
            </AnimatedBadge>
            {detail?.score && (
              <AnimatedBadge status="neutral" size="sm" showIcon={false}>
                成绩 {detail.score}
              </AnimatedBadge>
            )}
          </div>
          <div className="homework-detail-facts">
            <span>
              <Clock3 size={13} />
              截止 {fullDate(detail?.deadline || item.deadline)}
            </span>
            {!submitted && (
              <span>
                {timeRemaining(detail?.deadline || item.deadline, now)}
              </span>
            )}
            {hasSubmitCount && (
              <span>
                已交 {detail?.submitCount ?? item.submitCount ?? "—"}/
                {detail?.allCount ?? item.allCount ?? "—"}
              </span>
            )}
            {reviewStatus && <span>{reviewStatus}</span>}
          </div>
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

        <div className="homework-detail-body">
          {loading && (
            <div className="homework-detail-loading">
              <Loader variant="spinner" size={20} label="正在加载" />
              <span>正在读取完整作业信息…</span>
            </div>
          )}
          {!loading && !detail && error && (
            <div className="homework-detail-empty">
              <p>加载作业详情失败，可点击下方刷新重试。</p>
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
                    <div className="homework-review-grid">
                      <div>
                        <span>提交时间</span>
                        <strong>
                          {fullDate(
                            detail.submittedAt || item.submittedAt || "",
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>批改成绩</span>
                        <strong>{detail.score || "尚未公布"}</strong>
                      </div>
                      <div className="homework-review-comment">
                        <span>批改意见</span>
                        <p>{detail.comment || "暂无批改意见"}</p>
                      </div>
                    </div>
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
                  </>
                ) : (
                  <div className="homework-detail-empty">
                    <FileCheck2 size={28} strokeWidth={1.5} />
                    <strong>尚未提交这项作业</strong>
                    {canSubmit && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setTab("提交作业")}
                      >
                        前往提交
                      </Button>
                    )}
                  </div>
                ))}
              {tab === "提交作业" &&
                (canSubmit ? (
                  !confirm ? (
                    <>
                      <label className="submission-content-label">
                        文字说明
                        <textarea
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          placeholder="填写作业正文或说明，也可以只提交附件。"
                          rows={6}
                        />
                      </label>
                      <UploadPanel
                        account={account}
                        noteId={homeworkIds(item).sourceId}
                        selection={files}
                        onSelection={setFiles}
                      />
                    </>
                  ) : (
                    <div className="submission-confirm">
                      <h3>确认提交至「{item.course}」</h3>
                      <p>{item.title}</p>
                      <div className="submission-preview">
                        {content || "未填写文字说明"}
                      </div>
                      {files.length > 0 && (
                        <ul>
                          {files.map((f) => (
                            <li key={f.id}>
                              {f.name} · {formatBytes(f.size)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!detail.repeatAllowed && (
                        <p className="orange-text">
                          此作业不允许重复提交，提交后可能无法修改。
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <div className="homework-detail-empty">
                    <strong>此作业已提交，平台不允许重复提交。</strong>
                  </div>
                ))}
            </>
          )}
        </div>

        <div className="homework-detail-footer">
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || submitting}
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            刷新详情
          </Button>
          <div className="homework-detail-footer-actions">
            {!loading && detail && tab === "作业要求" && canSubmit && (
              <Button size="sm" onClick={() => setTab("提交作业")}>
                <Send size={14} />
                {submitted ? "重新提交" : "去提交"}
              </Button>
            )}
            {!loading &&
              detail &&
              tab === "提交作业" &&
              canSubmit &&
              !confirm && (
                <Button
                  size="sm"
                  disabled={!content.trim() && !files.length}
                  onClick={() => setConfirm(true)}
                >
                  <Send size={14} />
                  核对并提交
                  {files.length ? ` (${files.length} 个附件)` : ""}
                </Button>
              )}
            {!loading && detail && tab === "提交作业" && canSubmit && confirm && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => setConfirm(false)}
                >
                  返回修改
                </Button>
                <Button size="sm" disabled={submitting} onClick={submit}>
                  {submitting ? (
                    <Loader variant="spinner" size={14} label="正在提交" />
                  ) : (
                    <Send size={14} />
                  )}
                  确认提交
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
