import MobileRefreshSurface, { usePageRefresh } from "./MobileRefreshSurface";
import {
  SwipeableList,
  type SwipeableListValue,
} from "@/components/motion/swipeable-list";
import { useCompactLayout } from "./platform";
import MailCompose from "./MailCompose";
import {
  beginMail,
  loadSent,
  type SentPage,
  markMail,
  prepareMailHtml,
  readMail,
  type MailDetail,
  type MailDraft,
} from "./mailbox";
import { useFeedback } from "./ui";
import { useFilePreview } from "./FilePreview";
import { downloadFiles } from "./learning";
import { Checkbox } from "@/components/motion/checkbox";
import { Loader } from "@/components/motion/loader";
import { PenLine, Reply, Download, Eye, MailCheck, Send } from "lucide-react";
import { useErrorState } from "./ui";
// 页面布局参考：https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail.tsx
// 邮件列表与阅读区参考：https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail-list.tsx
// https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail-display.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowUpRight,
  ChevronLeft,
  Inbox,
  Mail as MailIcon,
  Paperclip,
  RefreshCw,
  Search,
} from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Tooltip } from "@/components/motion/tooltip";
import type { Account, MailMessage } from "./types";
import { PageHeading } from "./Pages";
import { Empty, fullDate } from "./ui";
import { openSchoolPage, ManualCaptchaRequired } from "./service";

function mailDate(value: string) {
  const raw = /^\d{10,13}$/.test(value)
    ? Number(value) * (value.length === 10 ? 1000 : 1)
    : value;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? value || "未提供时间"
    : fullDate(parsed.toISOString());
}

function listDate(value: string) {
  const raw = /^\d{10,13}$/.test(value)
    ? Number(value) * (value.length === 10 ? 1000 : 1)
    : value;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return value || "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(parsed);
}

export default function Mail({
  account,
  rows = [],
  total = 0,
  onRefresh,
  onLoginRequired,
  onRead,
  sentRows = [],
  sentTotal,
  onSentLoaded,
  refreshedAt,
  target,
}: {
  account: Account;
  rows?: MailMessage[];
  total?: number;
  onRefresh: () => Promise<void>;
  onLoginRequired?: () => void;
  onRead: (ids: string[], read: boolean, displayedRows: MailMessage[]) => void;
  sentRows?: MailMessage[];
  sentTotal?: number;
  onSentLoaded: (page: SentPage) => void;
  refreshedAt?: string;
  target?: { id: string; folder: "inbox" | "sent" };
}) {
  const [folder, setFolder] = useState<"inbox" | "sent">(
    target?.folder ?? "inbox",
  );
  const [sentRevision, setSentRevision] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const isSent = folder === "sent";
  const sourceRows = isSent ? sentRows : rows;
  function chooseFolder(next: "inbox" | "sent", nextFilter = "all") {
    setFolder(next);
    setFilter(nextFilter);
    setSelectedId(null);
    setMobileReading(false);
    setChecked([]);
    setSelecting(false);
    setSwipeOpen(null);
    setQuery("");
  }
  const compactLayout = useCompactLayout();
  const [mobileReading, setMobileReading] = useState(!!target);
  const [selecting, setSelecting] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState<SwipeableListValue | null>(null);
  useEffect(() => {
    const reset = (event: Event) => {
      if ((event as CustomEvent).detail !== "mail") return;
      setMobileReading(false);
      setSelecting(false);
      setChecked([]);
      setSwipeOpen(null);
    };
    window.addEventListener("campus:tab-reselect", reset);
    return () => window.removeEventListener("campus:tab-reselect", reset);
  }, []);

  useEffect(() => {
    if (!compactLayout || (!mobileReading && !selecting && !swipeOpen)) return;
    const back = (event: Event) => {
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      if (swipeOpen) setSwipeOpen(null);
      else if (selecting) {
        setSelecting(false);
        setChecked([]);
      } else setMobileReading(false);
    };
    window.addEventListener("campus:before-back", back);
    return () => window.removeEventListener("campus:before-back", back);
  }, [compactLayout, mobileReading, selecting, swipeOpen]);

  const [selectedId, setSelectedId] = useState<string | null>(
    target?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useErrorState();
  const feedback = useFeedback();
  const preview = useFilePreview();
  const [checked, setChecked] = useState<string[]>([]);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [body, setBody] = useState("");
  const [reading, setReading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [composing, setComposing] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (target) {
      setFolder(target.folder);
      setSelectedId(target.id);
      setMobileReading(true);
      setFilter("all");
      setQuery("");
      setChecked([]);
    }
  }, [target?.id, target?.folder]);
  useEffect(() => {
    if (!rows.length && !refreshedAt && !compactLayout) {
      setBusy(true);
      void onRefresh()
        .catch((reason) => setError(String(reason)))
        .finally(() => setBusy(false));
    }
  }, [account.id]);

  useEffect(() => {
    if (!isSent) return;
    let active = true;
    setBusy(true);
    void loadSent(account)
      .then((value) => {
        if (active) onSentLoaded(value);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [account.id, folder, sentRevision, refreshedAt]);
  async function moreSent() {
    if (moreBusy) return;
    setMoreBusy(true);
    try {
      const next = await loadSent(account, sentRows.length);
      const unique = new Map(
        [...sentRows, ...next.rows].map((row) => [row.id, row]),
      );
      onSentLoaded({ rows: [...unique.values()], total: next.total });
    } catch (error) {
      setError(String(error));
    } finally {
      setMoreBusy(false);
    }
  }
  const unread = rows.filter((item) => !item.read).length;
  const items = sourceRows.filter(
    (item) =>
      (filter !== "unread" || !item.read) &&
      `${item.subject}${item.from}${item.to ?? ""}${item.summary}`.includes(
        query,
      ),
  );
  const selected = sourceRows.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!selected || (compactLayout && !mobileReading)) return;
    let active = true;
    setReading(true);
    setDetail(null);
    setBody("");
    void readMail(account, selected)
      .then(async (value) => {
        if (!active) return;
        setDetail(value);
        if (!isSent) onRead([value.id], true, rows);
        const html = await prepareMailHtml(account, value);
        if (active) setBody(html);
      })
      .catch((reason) => {
        if (active) {
          setError(String(reason));
          if (reason instanceof ManualCaptchaRequired) onLoginRequired?.();
        }
      })
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [
    account.id,
    selected?.id,
    folder,
    revision,
    compactLayout,
    mobileReading,
  ]);
  async function mark(ids: string[], read: boolean) {
    if (!ids.length || marking) return;
    setMarking(true);
    try {
      await markMail(account, ids, read);
      onRead(ids, read, rows);
      setChecked([]);
      feedback(`已将 ${ids.length} 封邮件标为${read ? "已读" : "未读"}`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setMarking(false);
    }
  }
  async function compose(reply?: MailDetail) {
    setComposing(true);
    try {
      setDraft(await beginMail(account, reply));
    } catch (reason) {
      setError(String(reason));
      if (reason instanceof ManualCaptchaRequired) onLoginRequired?.();
    } finally {
      setComposing(false);
    }
  }

  async function open(message?: MailMessage) {
    if (opening) return;
    setError("");
    try {
      if (account.demo) throw Error("请连接校园账号后打开学校邮箱。");
      setOpening(true);
      await openSchoolPage(account.id, "mail", message?.id);
    } catch (reason) {
      setError(String(reason));
      if (
        reason instanceof ManualCaptchaRequired ||
        String(reason).includes("登录状态已失效")
      )
        onLoginRequired?.();
    } finally {
      setOpening(false);
    }
  }

  async function refresh() {
    if (busy) return;
    setSwipeOpen(null);
    setBusy(true);
    setError("");
    try {
      if (isSent) onSentLoaded(await loadSent(account));
      else await onRefresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  usePageRefresh(refresh);
  function messageRow(message: MailMessage) {
    return (
      <div className="mail-selectable-row" key={message.id}>
        {!isSent && (!compactLayout || selecting) && (
          <Checkbox
            aria-label={`选择邮件 ${message.subject}`}
            checked={checked.includes(message.id)}
            onCheckedChange={(value) =>
              setChecked((ids) =>
                value
                  ? [...ids, message.id]
                  : ids.filter((id) => id !== message.id),
              )
            }
          />
        )}
        <button
          className={`mail-list-item ${selected?.id === message.id && !compactLayout ? "selected" : ""} ${message.read ? "read" : "unread"}`}
          key={message.id}
          onClick={() => {
            setSelectedId(message.id);
            setMobileReading(true);
          }}
          aria-current={selected?.id === message.id ? "true" : undefined}
        >
          {compactLayout && (
            <span className="mobile-mail-avatar" aria-hidden="true">
              {(isSent ? message.to : message.from)
                ?.replace(/["'<\s-]/g, "")
                .slice(0, 1) || "邮"}
            </span>
          )}
          <span className="mail-list-top">
            <span className="mail-sender-name">
              {isSent
                ? `收件人：${message.to || "未提供"}`
                : compactLayout
                  ? message.from
                      ?.replace(/\s*<[^>]*>/g, "")
                      .replace(/^"|"$/g, "") || "未知发件人"
                  : message.from || "未知发件人"}
            </span>
            <time>{listDate(message.date)}</time>
          </span>
          <span className="mail-list-subject">
            {!message.read && (
              <span className="mail-unread-indicator" aria-label="未读" />
            )}
            <strong>{message.subject || "无主题"}</strong>
            {message.attached && <Paperclip size={13} aria-label="有附件" />}
          </span>
          <span className="mail-list-excerpt">
            {message.summary || "该邮件没有摘要"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mail-page">
      {compactLayout && !mobileReading && (
        <Button
          className="mobile-compose-fab"
          aria-label="写邮件"
          disabled={composing}
          onClick={() => void compose()}
        >
          <PenLine size={20} />
          {composing ? "准备中…" : "写信"}
        </Button>
      )}
      <PageHeading
        eyebrow="MAIL"
        title="校园邮箱"
        description="完整阅读、写信与已读状态同步"
      />
      <section
        className={`mail-workspace ${mobileReading ? "mobile-reading" : ""} ${selecting ? "is-selecting" : ""}`}
        aria-label="校园邮箱工作区"
      >
        <aside className="mail-folder-rail" aria-label="邮箱导航">
          <div className="mail-folder-account">
            <span className="mail-folder-avatar">
              <MailIcon size={17} />
            </span>
            <span>
              <strong>校园邮箱</strong>
              <small>{account.demo ? "演示账户" : account.studentId}</small>
            </span>
          </div>
          <Button
            className="mail-new-button"
            size="sm"
            disabled={composing}
            onClick={() => void compose()}
          >
            <PenLine size={14} />
            {composing ? "准备写信…" : "写邮件"}
          </Button>
          <span className="mail-folder-label">邮箱</span>
          <button
            className={`mail-folder-item ${!isSent && filter === "all" ? "active" : ""}`}
            onClick={() => chooseFolder("inbox")}
          >
            <Inbox size={16} />
            <span>收件箱</span>
            <small>{total || rows.length}</small>
          </button>
          <button
            className={`mail-folder-item ${!isSent && filter === "unread" ? "active" : ""}`}
            onClick={() => chooseFolder("inbox", "unread")}
          >
            <span className="mail-folder-unread-dot" />
            <span>未读邮件</span>
            <small>{unread}</small>
          </button>
          <button
            className={`mail-folder-item ${isSent ? "active" : ""}`}
            onClick={() => chooseFolder("sent")}
          >
            <Send size={16} />
            <span>已发送</span>
            <small>{sentTotal ?? "—"}</small>
          </button>
          <div className="mail-folder-end">
            <p>已读状态与学校邮箱同步。其他文件夹可在学校邮箱中查看。</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={opening}
              onClick={() => void open()}
            >
              {opening ? "更新登录状态…" : "打开学校邮箱"}{" "}
              <ArrowUpRight size={14} />
            </Button>
          </div>
        </aside>
        <section className="mail-index" aria-label="邮件列表">
          {compactLayout && (
            <div className="mobile-mail-controls">
              <Tabs
                value={isSent ? "sent" : filter === "unread" ? "unread" : "all"}
                onValueChange={(next) =>
                  chooseFolder(
                    next === "sent" ? "sent" : "inbox",
                    next === "unread" ? "unread" : "all",
                  )
                }
                variant="segment"
                className="mobile-mail-folders"
              >
                <TabsList aria-label="邮件文件夹">
                  <TabsTrigger value="all">收件箱</TabsTrigger>
                  <TabsTrigger value="unread">未读 {unread || ""}</TabsTrigger>
                  <TabsTrigger value="sent">已发送</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mobile-mail-actions">
                <span>
                  {isSent
                    ? (sentTotal ?? sentRows.length)
                    : filter === "unread"
                      ? unread
                      : total || rows.length}{" "}
                  封邮件
                </span>
                <div>
                  {!isSent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelecting(!selecting);
                        setChecked([]);
                      }}
                    >
                      {selecting ? "取消选择" : "选择"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="mail-index-heading">
            <div>
              <span className="home-section-kicker">
                {isSent ? "SENT" : "INBOX"}
              </span>
              <h2>{isSent ? "已发送" : "收件箱"}</h2>
            </div>
            <Tooltip content={isSent ? "刷新已发送" : "刷新收件箱"}>
              <Button
                size="icon"
                variant="ghost"
                aria-label={isSent ? "刷新已发送" : "刷新收件箱"}
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} className={busy ? "spin" : ""} />
              </Button>
            </Tooltip>
          </div>
          <div className="mail-index-search">
            <Input
              type="search"
              enterKeyHint="search"
              aria-label="搜索邮件"
              placeholder={
                isSent ? "搜索主题、收件人或摘要" : "搜索主题、发件人或摘要"
              }
              value={query}
              onChange={setQuery}
              leftIcon={<Search size={15} />}
            />
          </div>
          {!isSent && !compactLayout && (
            <Tabs
              value={filter}
              onValueChange={setFilter}
              variant="underline"
              className="mail-filter-tabs"
            >
              <TabsList>
                <TabsTrigger value="all">全部邮件</TabsTrigger>
                <TabsTrigger value="unread">
                  未读 <span className="mail-tab-count">{unread}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {!isSent && (!compactLayout || selecting) && (
            <div className="mail-batch-toolbar">
              <Checkbox
                aria-label="选择当前列表邮件"
                checked={
                  items.length > 0 &&
                  items.every((item) => checked.includes(item.id))
                }
                onCheckedChange={(value) =>
                  setChecked(value ? items.map((item) => item.id) : [])
                }
              />
              <span>
                {checked.length ? `已选 ${checked.length} 封` : "选择邮件"}
              </span>
              {checked.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={marking}
                    onClick={() => void mark(checked, true)}
                  >
                    标为已读
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={marking}
                    onClick={() => void mark(checked, false)}
                  >
                    标为未读
                  </Button>
                </>
              )}
            </div>
          )}
          {isSent && (
            <div className="mail-sent-caption">
              已加载 {sentRows.length} / {sentTotal ?? "…"} 封
            </div>
          )}
          <MobileRefreshSurface
            className="mail-message-list"
            refresh={compactLayout ? refresh : undefined}
            refreshing={busy}
          >
            {busy && !sourceRows.length ? (
              <p className="quiet-empty">
                {isSent ? "正在读取已发送…" : "正在读取收件箱…"}
              </p>
            ) : items.length ? (
              compactLayout && !selecting && !isSent ? (
                <SwipeableList
                  value={swipeOpen}
                  onValueChange={setSwipeOpen}
                  className="mobile-mail-swipe"
                  classNames={{
                    item: "rounded-none",
                    rail: "rounded-none",
                    surface: "p-0 rounded-none shadow-none border-0",
                    root: "gap-0",
                  }}
                  items={items.map((message) => ({
                    id: message.id,
                    title: message.subject,
                    disabled: marking,
                    content: messageRow(message),
                    rightActions: [
                      {
                        id: message.read ? "unread" : "read",
                        label: message.read ? "标为未读" : "标为已读",
                        icon: <MailCheck size={20} />,
                        tone: "neutral",
                      },
                    ],
                  }))}
                  onAction={({ item, action }) =>
                    void mark([item.id], action.id === "read")
                  }
                />
              ) : (
                items.map(messageRow)
              )
            ) : (
              <Empty
                title={query ? "没有匹配的邮件" : "暂无邮件"}
                detail={
                  query
                    ? "试试其他关键词。"
                    : isSent
                      ? "刷新后显示学校邮箱的发送记录。"
                      : "刷新后显示学校邮箱收件箱。"
                }
              />
            )}
            {isSent && sentRows.length < (sentTotal ?? 0) && (
              <Button
                className="mail-load-more"
                size="sm"
                variant="ghost"
                disabled={moreBusy || busy}
                onClick={() => void moreSent()}
              >
                {moreBusy ? "正在加载…" : "加载更多发送记录"}
              </Button>
            )}
          </MobileRefreshSurface>
        </section>
        <article className="mail-reader" aria-label="邮件正文">
          {selected ? (
            <>
              <div className="mail-reader-toolbar">
                <Button
                  variant="ghost"
                  className="mobile-mail-back"
                  aria-label="返回邮件列表"
                  onClick={() => setMobileReading(false)}
                >
                  <ChevronLeft size={18} />
                  邮箱
                </Button>
                <span className="home-section-kicker">MESSAGE</span>
                <AnimatedBadge
                  status={selected.read ? "neutral" : "info"}
                  size="sm"
                  showIcon={false}
                >
                  {isSent ? "已发送" : selected.read ? "已读" : "未读"}
                </AnimatedBadge>
                {!isSent && (
                  <>
                    {" "}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={marking}
                      onClick={() => void mark([selected.id], !selected.read)}
                    >
                      <MailCheck size={14} />
                      {selected.read ? "标为未读" : "标为已读"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reading || !detail || composing}
                      onClick={() => detail && void compose(detail)}
                    >
                      <Reply size={14} />
                      回复
                    </Button>
                  </>
                )}
              </div>
              <h2>{selected.subject || "无主题"}</h2>
              <div className="mail-reader-sender">
                <span className="mail-sender-avatar">
                  {selected.from?.slice(0, 1) || "邮"}
                </span>
                <span>
                  <strong>{selected.from || "未知发件人"}</strong>
                  <small>{mailDate(selected.date)}</small>
                </span>
                {selected.attached && (
                  <AnimatedBadge
                    status="neutral"
                    size="sm"
                    icon={<Paperclip size={12} />}
                  >
                    附件
                  </AnimatedBadge>
                )}
              </div>
              {detail && (
                <div className="mail-recipient-line">
                  收件人：{detail.to.join("；") || "未提供"}
                  {detail.cc.length > 0 && (
                    <span> · 抄送：{detail.cc.join("；")}</span>
                  )}
                </div>
              )}
              <div className="mail-reader-body">
                {reading ? (
                  <div className="mail-body-loading">
                    <Loader size={18} label="正在读取完整邮件" />
                    正在读取完整邮件…
                  </div>
                ) : body ? (
                  <iframe
                    title="完整邮件正文"
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={body}
                  />
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRevision((v) => v + 1)}
                  >
                    重新读取正文
                  </Button>
                )}
              </div>
              {!!detail?.attachments.length && (
                <div className="mail-attachments">
                  <strong>附件 · {detail.attachments.length}</strong>
                  {detail.attachments.map((file) => (
                    <div key={file.id}>
                      <Paperclip size={14} />
                      <span>{file.name}</span>
                      <small>{Math.ceil(file.size / 1024)} KB</small>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          preview(
                            { ...file, id: `${selected.id}-${file.id}` },
                            account,
                          )
                        }
                      >
                        <Eye size={13} />
                        预览
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void downloadFiles(account, [file]).catch((error) =>
                            setError(String(error)),
                          )
                        }
                      >
                        <Download size={13} />
                        下载
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mail-reader-footer">
                <Button disabled={opening} onClick={() => void open(selected)}>
                  {opening ? "更新登录状态…" : "在学校邮箱中阅读"}{" "}
                  <ArrowUpRight size={15} />
                </Button>
                <span>使用当前账号的学校登录状态打开原邮件。</span>
              </div>
            </>
          ) : (
            <Empty
              title="选择一封邮件"
              detail="点击左侧邮件读取完整正文，并同步已读状态。"
            />
          )}
        </article>
      </section>
      {draft && (
        <MailCompose
          account={account}
          initial={draft}
          onClose={() => setDraft(null)}
          onSent={() => {
            chooseFolder("sent");
            setSentRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
