import { useState } from "react";
import { Card } from "@/components/motion/card";
import { Button } from "@/components/motion/button";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  GraduationCap,
  Mail,
  RefreshCw,
} from "lucide-react";
import type { Account, CampusData, Change, Homework, Page } from "./types";
import { byDeadline, homeworkState, useNow } from "./homework";
import { isInWeek } from "./courseWeeks";
import { makeDemoMail } from "./demo";
import { periodTimes, remaining } from "./ui";
import HomeworkDetail from "./HomeworkDetail";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
function mailTime(value: string) {
  return /^\d{10,13}$/.test(value)
    ? Number(value) * (value.length === 10 ? 1000 : 1)
    : Date.parse(value);
}
function stamp(time: string) {
  const date = new Date(mailTime(time));
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}
export default function HomeDashboard({
  account,
  data,
  navigate,
  showChanges,
  showMail,
  onHomeworkUpdate,
  onCourse,
  onChange,
}: {
  account: Account;
  data: CampusData;
  navigate: (page: Page) => void;
  showChanges: () => void;
  showMail: (id?: string) => void;
  onHomeworkUpdate: (id: string) => Promise<void>;
  onCourse: (name: string) => void;
  onChange: (change: Change) => void;
}) {
  const now = useNow(),
    day = new Date(now).getDay() || 7;
  const [selected, setSelected] = useState<Homework | null>(null);
  const pending = data.homework
    .filter((item) => homeworkState(item, now) === "pending")
    .sort(byDeadline);
  const courses = data.courses.filter(
    (item) => !item.selection && isInWeek(item.weeks, data.currentWeek),
  );
  const today = courses
    .filter((item) => item.day === day)
    .sort((a, b) => a.period - b.period);
  const mail =
    data.mailInbox ??
    (account.demo ? makeDemoMail(account.id === "demo-chen") : []);
  const importantMail = [...mail]
    .sort(
      (a, b) =>
        Number(a.read) - Number(b.read) || mailTime(b.date) - mailTime(a.date),
    )
    .slice(0, 3);
  const changes = [...data.changes]
    .filter((change) =>
      ["邮箱", "课表", "作业", "成绩"].includes(change.category),
    )
    .sort(
      (a, b) =>
        new Date(b.time).getTime() - new Date(a.time).getTime() ||
        Number(b.category === "邮箱") - Number(a.category === "邮箱"),
    )
    .slice(0, 4);
  const names = [
    ...new Set([
      ...courses.map((item) => item.name),
      ...data.resources.map((item) => item.name),
    ]),
  ];
  return (
    <div className="workspace-home dashboard-home">
      <header className="home-heading">
        <div className="home-heading-copy">
          <h1>校园概览</h1>
          <p>
            {account.name} ·{" "}
            {new Intl.DateTimeFormat("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(now)}{" "}
            · 第 {data.currentWeek} 教学周
          </p>
        </div>
        <div className="home-heading-actions">
          <Select
            value=""
            onValueChange={onCourse}
            disabled={!names.length}
            className="home-course-picker"
          >
            <SelectTrigger className="home-course-picker-trigger">
              <GraduationCap size={15} aria-hidden="true" />
              <SelectValue placeholder="课程空间" />
            </SelectTrigger>
            <SelectContent className="home-course-picker-content">
              {names.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("schedule")}
          >
            <CalendarDays size={15} />
            查看课表
          </Button>
        </div>
      </header>
      <div className="home-summary" aria-label="校园数据摘要">
        <Button
          variant="ghost"
          className="home-summary-item"
          onClick={() => showMail()}
        >
          <span className="home-summary-label">未读邮件</span>
          <span className="home-summary-value">
            <strong>{data.mailCount}</strong>
            <span>封</span>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="home-summary-item"
          onClick={() => navigate("homework")}
        >
          <span className="home-summary-label">待完成作业</span>
          <span className="home-summary-value">
            <strong>{pending.length}</strong>
            <span>项</span>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="home-summary-item"
          onClick={() => navigate("schedule")}
        >
          <span className="home-summary-label">今日课程</span>
          <span className="home-summary-value">
            <strong>{today.length}</strong>
            <span>节</span>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="home-summary-item"
          onClick={showChanges}
        >
          <span className="home-summary-label">校园动态</span>
          <span className="home-summary-value">
            <strong>{data.changes.length}</strong>
            <span>条</span>
          </span>
        </Button>
      </div>
      <div className="dashboard-grid">
        <Card className="dashboard-panel dashboard-mail">
          <header>
            <h2>
              <Mail size={16} />
              校园邮箱{" "}
              <AnimatedBadge
                status={data.mailCount ? "info" : "neutral"}
                showIcon={false}
                size="sm"
              >
                {data.mailCount} 封未读
              </AnimatedBadge>
            </h2>
            <Button size="sm" variant="ghost" onClick={() => showMail()}>
              收件箱
              <ArrowUpRight size={13} />
            </Button>
          </header>
          <div className="dashboard-rows">
            {importantMail.map((item) => (
              <button
                key={item.id}
                className={`dashboard-mail-row ${item.read ? "" : "unread"}`}
                onClick={() => showMail(item.id)}
              >
                <span className="dashboard-mail-dot" />
                <span className="dashboard-row-copy">
                  <strong>{item.subject || "无主题"}</strong>
                  <small>{item.from || "未知发件人"}</small>
                </span>
                <time>{stamp(item.date)}</time>
              </button>
            ))}
            {!mail.length && (
              <div className="dashboard-empty">
                <Mail size={21} />
                <span>
                  {data.syncedAt?.mail
                    ? "收件箱暂无邮件"
                    : "同步后在这里查看最近邮件"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => showMail()}>
                  打开邮箱
                </Button>
              </div>
            )}
          </div>
        </Card>
        <Card className="dashboard-panel dashboard-tasks">
          <header>
            <h2>
              <BookOpen size={16} />
              待办作业<span>{pending.length}</span>
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate("homework")}
            >
              全部作业
              <ArrowUpRight size={13} />
            </Button>
          </header>
          <div className="dashboard-rows">
            {pending.slice(0, 3).map((item) => (
              <button key={item.id} onClick={() => setSelected(item)}>
                <span className="dashboard-row-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {item.course} · {item.type}
                  </small>
                </span>
                <span className="dashboard-deadline">
                  <Clock3 size={12} />
                  {remaining(item.deadline)}
                </span>
              </button>
            ))}
            {!pending.length && (
              <div className="dashboard-empty">目前没有尚未截止的作业。</div>
            )}
          </div>
        </Card>
        <Card className="dashboard-panel dashboard-updates">
          <header>
            <h2>
              <RefreshCw size={16} />
              校园动态
            </h2>
            <Button size="sm" variant="ghost" onClick={showChanges}>
              全部动态
              <ArrowUpRight size={13} />
            </Button>
          </header>
          <div className="dashboard-rows">
            {changes.map((change) => (
              <button key={change.id} onClick={() => onChange(change)}>
                <span
                  className={`dashboard-category ${change.category === "邮箱" ? "mail" : ""}`}
                >
                  {change.category}
                </span>
                <span className="dashboard-row-copy">
                  <strong>{change.title}</strong>
                  <small>
                    {change.kind} · {stamp(change.time)}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
            {!changes.length && (
              <div className="dashboard-empty">
                同步后，课表、作业、成绩和新邮件的变化会显示在这里。
              </div>
            )}
          </div>
        </Card>
        <Card className="dashboard-panel dashboard-schedule">
          <header>
            <h2>
              <CalendarDays size={16} />
              今日课表
              <span>
                周{["一", "二", "三", "四", "五", "六", "日"][day - 1]}
              </span>
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate("schedule")}
            >
              完整课表
              <ArrowUpRight size={13} />
            </Button>
          </header>
          <div className="dashboard-rows">
            {today.slice(0, 3).map((item) => (
              <button key={item.id} onClick={() => onCourse(item.name)}>
                <time className="dashboard-course-time">
                  {periodTimes[item.period - 1]?.split("–")[0]}
                </time>
                <span className="dashboard-row-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.place} · {item.teacher}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
            {!today.length && (
              <div className="dashboard-empty">
                <CalendarDays size={21} />
                <span>今天没有课程，查看完整课表安排接下来的时间。</span>
              </div>
            )}
          </div>
        </Card>
      </div>
      {selected && (
        <HomeworkDetail
          account={account}
          item={selected}
          onUpdated={onHomeworkUpdate}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
