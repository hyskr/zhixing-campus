import { useEffect, useState } from "react";
import type { Homework } from "./types";
export type HomeworkState = "pending" | "submitted" | "overdue";
// 参考来源：参考待完成、已提交、已逾期的分组及排序思路，以 React 状态计算实现。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/app/app.js
export function homeworkState(item: Homework, now = Date.now()): HomeworkState {
  if (
    /已提交|已交|已完成|已批改|已批阅/.test(item.status) ||
    !!item.submittedAt?.trim()
  )
    return "submitted";
  const deadline = new Date(item.deadline).getTime();
  return Number.isFinite(deadline) && deadline <= now ? "overdue" : "pending";
}
export function byDeadline(a: Homework, b: Homework) {
  return (
    (new Date(a.deadline).getTime() || Infinity) -
    (new Date(b.deadline).getTime() || Infinity)
  );
}
// 参考来源：参考持续更新截止倒计时的交互；采用普通文字和本项目时间格式。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/UI/deadline-countdown.js
export function timeRemaining(date: string, now = Date.now()) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return "未提供截止时间";
  const difference = timestamp - now;
  if (difference <= 0) return "已截止";
  const minutes = Math.max(1, Math.ceil(difference / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return days > 0
    ? `剩余 ${days} 天 ${hours % 24} 小时`
    : hours > 0
      ? `剩余 ${hours} 小时 ${minutes % 60} 分钟`
      : `剩余 ${minutes} 分钟`;
}
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return now;
}
