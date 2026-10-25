import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Mail,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import { Card } from "@/components/motion/card";
import type {
  CampusData,
  Change,
  Course,
  Homework,
  MailMessage,
  Page,
} from "./types";
import { periodTimes, remaining, shortDate } from "./ui";
export default function MobileHome({
  data,
  now,
  today,
  pending,
  mail,
  changes,
  navigate,
  onCourse,
  onHomework,
  onMail,
  onChange,
  showChanges,
}: {
  data: CampusData;
  now: number;
  today: Course[];
  pending: Homework[];
  mail: MailMessage[];
  changes: Change[];
  navigate: (page: Page) => void;
  onCourse: (name: string) => void;
  onHomework: (item: Homework) => void;
  onMail: (id?: string) => void;
  onChange: (change: Change) => void;
  showChanges: () => void;
}) {
  const date = new Date(now),
    minutes = date.getHours() * 60 + date.getMinutes();
  const next = today.find((c) => {
    const end = periodTimes[c.period - 1]
      ?.split("–")[1]
      ?.split(":")
      .map(Number);
    return end && end[0] * 60 + end[1] > minutes;
  });
  return (
    <div className="mobile-home">
      <Card className="mobile-next-course">
        <Button
          variant="ghost"
          onClick={() => (next ? onCourse(next.name) : navigate("schedule"))}
        >
          <span className="mobile-next-icon">
            <CalendarDays size={24} />
          </span>
          <span>
            <small>
              {next ? `今日课程 · ${periodTimes[next.period - 1]}` : "今日课程"}
            </small>
            <strong>
              {next?.name ??
                (today.length ? "今天的课程已结束" : "今天没有课程")}
            </strong>
            <em>
              {next
                ? [next.place, next.teacher].filter(Boolean).join(" · ")
                : today.length
                  ? "查看完整课表，安排接下来的学习"
                  : "今天没有课程，查看本周安排"}
            </em>
          </span>
          <ChevronRight size={19} />
        </Button>
      </Card>
      <section className="mobile-home-section">
        <header>
          <h2>
            <Mail size={19} />
            邮箱
          </h2>
          <Button variant="ghost" onClick={() => onMail()}>
            {data.mailCount > 0 ? `${data.mailCount} 封未读` : "收件箱"}
            <ChevronRight size={16} />
          </Button>
        </header>
        <div className="mobile-home-list">
          {mail.length ? (
            mail.map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                onClick={() => onMail(item.id)}
              >
                <i className={item.read ? "read" : ""} />
                <span>
                  <strong>{item.subject || "无主题"}</strong>
                  <small>
                    {item.from
                      .replace(/<[^>]*>/g, "")
                      .replaceAll('"', "")
                      .trim() || item.from}
                  </small>
                </span>
                <time>
                  {shortDate(
                    /^\d{10,13}$/.test(item.date)
                      ? new Date(
                          Number(item.date) *
                            (item.date.length === 10 ? 1000 : 1),
                        ).toISOString()
                      : item.date,
                  )}
                </time>
              </Button>
            ))
          ) : (
            <p>暂无邮件，刷新后查看最新消息。</p>
          )}
        </div>
      </section>
      <section className="mobile-home-section">
        <header>
          <h2>
            <BookOpen size={19} />
            待办作业
          </h2>
          <Button variant="ghost" onClick={() => navigate("homework")}>
            {pending.length ? `${pending.length} 项` : "全部作业"}
            <ChevronRight size={16} />
          </Button>
        </header>
        <div className="mobile-home-list">
          {pending.length ? (
            pending.slice(0, 1).map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                onClick={() => onHomework(item)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.course}</small>
                  <em>{remaining(item.deadline)}</em>
                </span>
                <ChevronRight size={17} />
              </Button>
            ))
          ) : (
            <p>当前没有待完成作业。</p>
          )}
        </div>
      </section>
      <section className="mobile-home-section">
        <header>
          <h2>
            <RefreshCw size={18} />
            最近动态
          </h2>
          <Button variant="ghost" onClick={showChanges}>
            全部
            <ChevronRight size={16} />
          </Button>
        </header>
        <div className="mobile-home-list mobile-home-updates">
          {changes.length ? (
            changes.slice(0, 1).map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                onClick={() => onChange(item)}
              >
                <small className="mobile-update-category">
                  {item.category}
                </small>
                <span>
                  <strong>{item.title}</strong>
                  <small>{shortDate(item.time)}</small>
                </span>
                <ChevronRight size={16} />
              </Button>
            ))
          ) : (
            <p>同步后查看课表、邮件、作业与成绩更新。</p>
          )}
        </div>
      </section>
    </div>
  );
}
