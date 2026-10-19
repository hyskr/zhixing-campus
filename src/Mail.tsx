import { useErrorState } from "./ui";
// 页面布局参考：https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail.tsx
// 邮件列表与阅读区参考：https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail-list.tsx
// https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail-display.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowUpRight,
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
}: {
  account: Account;
  rows?: MailMessage[];
  total?: number;
  onRefresh: () => Promise<void>;
  onLoginRequired?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useErrorState();

  useEffect(() => {
    if (!rows.length) {
      setBusy(true);
      void onRefresh()
        .catch((reason) => setError(String(reason)))
        .finally(() => setBusy(false));
    }
  }, [account.id]);

  const unread = rows.filter((item) => !item.read).length;
  const items = rows.filter(
    (item) =>
      (filter !== "unread" || !item.read) &&
      `${item.subject}${item.from}${item.summary}`.includes(query),
  );
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

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
    setBusy(true);
    setError("");
    try {
      await onRefresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mail-page">
      <PageHeading
        eyebrow="MAIL"
        title="校园邮箱"
        description="查看收件箱摘要；完整邮件在学校邮箱窗口中阅读。"
      />
      <section className="mail-workspace" aria-label="校园邮箱工作区">
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
          <span className="mail-folder-label">邮箱</span>
          <button
            className={`mail-folder-item ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            <Inbox size={16} />
            <span>收件箱</span>
            <small>{total || rows.length}</small>
          </button>
          <button
            className={`mail-folder-item ${filter === "unread" ? "active" : ""}`}
            onClick={() => setFilter("unread")}
          >
            <span className="mail-folder-unread-dot" />
            <span>未读邮件</span>
            <small>{unread}</small>
          </button>
          <div className="mail-folder-end">
            <p>
              这里显示最近的收件记录。其他文件夹和完整邮件可在学校邮箱中查看。
            </p>
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
          <div className="mail-index-heading">
            <div>
              <span className="home-section-kicker">INBOX</span>
              <h2>收件箱</h2>
            </div>
            <Tooltip content="刷新收件箱">
              <Button
                size="icon"
                variant="ghost"
                aria-label="刷新收件箱"
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
              aria-label="搜索邮件"
              placeholder="搜索主题、发件人或摘要"
              value={query}
              onChange={setQuery}
              leftIcon={<Search size={15} />}
            />
          </div>
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
          <div className="mail-message-list">
            {busy && !rows.length ? (
              <p className="quiet-empty">正在读取收件箱…</p>
            ) : items.length ? (
              items.map((message) => (
                <button
                  className={`mail-list-item ${selected?.id === message.id ? "selected" : ""} ${message.read ? "read" : "unread"}`}
                  key={message.id}
                  onClick={() => setSelectedId(message.id)}
                  aria-current={
                    selected?.id === message.id ? "true" : undefined
                  }
                >
                  <span className="mail-list-top">
                    <span className="mail-sender-name">
                      {message.from || "未知发件人"}
                    </span>
                    <time>{listDate(message.date)}</time>
                  </span>
                  <span className="mail-list-subject">
                    {!message.read && (
                      <span
                        className="mail-unread-indicator"
                        aria-label="未读"
                      />
                    )}
                    <strong>{message.subject || "无主题"}</strong>
                    {message.attached && (
                      <Paperclip size={13} aria-label="有附件" />
                    )}
                  </span>
                  <span className="mail-list-excerpt">
                    {message.summary || "该邮件没有摘要"}
                  </span>
                </button>
              ))
            ) : (
              <Empty
                title={query ? "没有匹配的邮件" : "暂无邮件"}
                detail={
                  query ? "试试其他关键词。" : "刷新后显示学校邮箱收件箱。"
                }
              />
            )}
          </div>
        </section>
        <article className="mail-reader" aria-label="邮件摘要">
          {selected ? (
            <>
              <div className="mail-reader-toolbar">
                <span className="home-section-kicker">MESSAGE PREVIEW</span>
                <AnimatedBadge
                  status={selected.read ? "neutral" : "info"}
                  size="sm"
                  showIcon={false}
                >
                  {selected.read ? "已读" : "未读"}
                </AnimatedBadge>
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
              <div className="mail-reader-body">
                <span className="home-section-kicker">邮件摘要</span>
                <p>{selected.summary || "该邮件没有提供摘要。"}</p>
              </div>
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
              detail="左侧列表会显示主题、发件人和时间。"
            />
          )}
        </article>
      </section>
    </div>
  );
}
