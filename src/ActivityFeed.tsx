import {
  ArrowDownToLine,
  Bell,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  Mail,
  NotebookPen,
} from "lucide-react";
import type { Change } from "./types";
import "./activity-feed.css";

const icons = {
  邮箱: Mail,
  作业: NotebookPen,
  课表: CalendarDays,
  成绩: GraduationCap,
  资料: ArrowDownToLine,
};
const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "short",
});
const longDateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function activityGroups(changes: Change[], limit?: number) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayKey = (date: Date) => date.toDateString();
  const groups = new Map<string, { title: string; rows: Change[] }>();
  const ordered = [...changes]
    .sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0))
    .slice(0, limit);
  for (const change of ordered) {
    const date = new Date(change.time);
    const key = dayKey(date);
    let group = groups.get(key);
    if (!group) {
      const title = !Number.isFinite(date.getTime())
        ? "日期不详"
        : key === dayKey(today)
          ? "今天"
          : key === dayKey(yesterday)
            ? "昨天"
            : date.getFullYear() === today.getFullYear()
              ? dateFormat.format(date)
              : longDateFormat.format(date);
      group = { title, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(change);
  }
  return groups;
}

export default function ActivityFeed({
  changes,
  limit,
  onSelect,
}: {
  changes: Change[];
  limit?: number;
  onSelect: (change: Change) => void;
}) {
  if (!changes.length)
    return (
      <div className="activity-feed-empty">
        <span className="activity-feed-icon">
          <Bell size={19} aria-hidden="true" />
        </span>
        <strong>暂无校园动态</strong>
        <p>新邮件、作业和课表变化会在同步后显示。</p>
      </div>
    );

  return (
    <div className={limit ? "activity-feed is-preview" : "activity-feed"}>
      {[...activityGroups(changes, limit)].map(([day, { title, rows }]) => (
        <section className="activity-feed-day" key={day} aria-label={title}>
          <h3>{title}</h3>
          <ul>
            {rows.map((change) => {
              const Icon = icons[change.category as keyof typeof icons] ?? Bell;
              const date = new Date(change.time);
              return (
                <li key={change.id}>
                  <button
                    className="activity-feed-row"
                    type="button"
                    onClick={() => onSelect(change)}
                  >
                    <span
                      className="activity-feed-icon"
                      data-category={change.category}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="activity-feed-copy">
                      <strong>{change.title}</strong>
                      <span>
                        {change.category}
                        <span aria-hidden="true"> · </span>
                        <span data-removed={change.kind === "删除" || undefined}>
                          {change.kind}
                        </span>
                      </span>
                    </span>
                    {Number.isFinite(date.getTime()) && (
                      <time dateTime={change.time}>
                        {timeFormat.format(date)}
                      </time>
                    )}
                    <ChevronRight
                      size={16}
                      className="activity-feed-disclosure"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
