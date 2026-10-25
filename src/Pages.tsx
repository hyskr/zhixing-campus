import MobileWeekSchedule from "./MobileWeekSchedule";
import { useCompactLayout } from "./platform";
import { currentCourseSlot } from "./currentCourse";
import { isInWeek } from "./courseWeeks";
import HomeShortcuts from "./HomeShortcuts";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/motion/tabs";
import { Card, CardContent } from "@/components/motion/card";
import { Tooltip } from "@/components/motion/tooltip";
import { useState } from "react";
import HomeworkDetail from "./HomeworkDetail";
import { byDeadline, homeworkState, useNow } from "./homework";
import { Button } from "@/components/motion/button";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  File,
  FileText,
  Folder,
  GraduationCap,
  Info,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";
import type {
  Account,
  CampusData,
  Course,
  Homework,
  Page,
  Resource,
} from "./types";
import {
  DetailRow,
  Empty,
  fullDate,
  Location,
  Modal,
  periodTimes,
  remaining,
  SectionTitle,
  shortDate,
} from "./ui";

export { default as Overview } from "./HomeDashboard";
const NotebookIcon = FileText;

export function Schedule({
  data,
  query,
  onCourse,
}: {
  data: CampusData;
  query: string;
  onCourse: (name: string) => void;
}) {
  const compactLayout = useCompactLayout();
  const now = useNow();
  const [selection, setSelection] = useState(false);
  const [week, setWeek] = useState(data.currentWeek);
  const [selected, setSelected] = useState<Course | null>(null);
  const monday = new Date();
  monday.setDate(
    monday.getDate() -
      ((monday.getDay() + 6) % 7) +
      (week - data.currentWeek) * 7,
  );
  const courses = data.courses.filter(
    (c) =>
      c.selection === selection &&
      c.name.includes(query) &&
      isInWeek(c.weeks, week),
  );
  const slot =
    !selection && week === data.currentWeek
      ? currentCourseSlot(now, periodTimes)
      : null;
  const ongoing = slot
    ? courses.filter((c) => c.day === slot.day && c.period === slot.period)
    : [];
  return (
    <div className="schedule-page">
      <PageHeading
        eyebrow="TIMETABLE"
        title="我的课表"
        description="按教学周查看课程，点击课程进入它的学习空间。"
      />
      <div className="page-toolbar">
        <Tabs
          value={selection ? "selection" : "current"}
          onValueChange={(v) => setSelection(v === "selection")}
          variant={compactLayout ? "segment" : "underline"}
          className="schedule-type-tabs"
        >
          <TabsList aria-label="课表类型">
            <TabsTrigger value="current">
              {compactLayout ? "学期课表" : "本学期课表"}
            </TabsTrigger>
            <TabsTrigger value="selection">
              {compactLayout ? "选课课表" : "选课任务课表"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="week-controls">
          <Button
            size="icon"
            variant="ghost"
            aria-label="上一周"
            disabled={week <= 1}
            onClick={() => setWeek((w) => w - 1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <span>第 {week} 周</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="下一周"
            disabled={week >= 30}
            onClick={() => setWeek((w) => w + 1)}
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setWeek(data.currentWeek)}
          >
            本周
          </Button>
        </div>
      </div>
      {compactLayout && (
        <MobileWeekSchedule
          courses={courses}
          monday={monday}
          week={week}
          current={slot}
          onCourse={onCourse}
        />
      )}
      <section
        className={`surface timetable ${compactLayout ? "desktop-timetable" : ""}`}
      >
        <div className="table-corner">
          <span>教学周</span>
          <strong>{String(week).padStart(2, "0")}</strong>
        </div>
        {["一", "二", "三", "四", "五", "六", "日"].map((name, i) => {
          const date = new Date(monday);
          date.setDate(date.getDate() + i);
          const active = date.toDateString() === new Date().toDateString();
          return (
            <div key={name} className={`day-head ${active ? "today" : ""}`}>
              <span>周{name}</span>
              <strong>{selection ? "—" : date.getDate()}</strong>
            </div>
          );
        })}
        {periodTimes.map((time, row) => (
          <div className="schedule-row" key={time}>
            <div className="period-head">
              <strong>{String(row + 1).padStart(2, "0")}</strong>
              <span>
                {time.split("–")[0]}
                <br />
                {time.split("–")[1]}
              </span>
            </div>
            {Array.from({ length: 7 }, (_, col) => (
              <div
                className={`schedule-cell ${col > 4 ? "weekend" : ""} ${slot?.day === col + 1 && slot?.period === row + 1 && ongoing.length ? "current-slot" : ""}`}
                key={col}
              >
                {courses
                  .filter((c) => c.day === col + 1 && c.period === row + 1)
                  .map((c) => (
                    <Tooltip
                      key={c.id}
                      content={`${slot?.day === c.day && slot.period === c.period ? "上课中 · " : ""}${c.name} · ${c.place} · ${c.teacher}`}
                    >
                      <button
                        className={`schedule-course ${c.color}`}
                        aria-current={
                          slot?.day === c.day && slot.period === c.period
                            ? "time"
                            : undefined
                        }
                        aria-label={`${c.name}，${c.place || "地点待定"}，${c.teacher || "教师待定"}`}
                        onClick={() => onCourse(c.name)}
                      >
                        <strong>{c.name}</strong>
                        <span>{c.place || "地点待定"}</span>
                        <small>{c.teacher || "教师待定"}</small>
                      </button>
                    </Tooltip>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </section>
      <p className="table-caption">
        {ongoing.length && slot
          ? `上课中 · 第 ${slot.period} 节 · 北京时间`
          : "点击课程查看详情"}
        <span>{courses.length} 个上课时段</span>
      </p>
      {selected && (
        <ItemDetail item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

export { default as Grades } from "./Grades";

export function Accounts({
  accounts,
  activeId,
  onSwitch,
  onAdd,
  onRemove,
  onLogin,
  onLogout,
}: {
  accounts: Account[];
  activeId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onLogin: (a: Account) => void;
  onLogout: (a: Account) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="ACCOUNTS"
        title="账号与本地数据"
        description="管理校园账号及其本地数据。"
      />
      <section className="surface account-panel">
        <SectionTitle
          title="我的账号"
          subtitle="各账号的登录状态与缓存独立保存"
        />
        <div className="account-list">
          {accounts.map((a) => (
            <div key={a.id} className="account-row">
              <div className={`avatar ${a.color}`}>{a.name.slice(0, 1)}</div>
              <div className="account-row-info">
                <h3>
                  {a.name}
                  {a.demo && <span className="demo-label">演示</span>}
                  {a.id === activeId && (
                    <span className="soft-tag blue">当前账号</span>
                  )}
                </h3>
                <p>
                  {a.studentId} · {a.department}
                </p>
              </div>
              <div className="account-actions">
                {a.id !== activeId && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSwitch(a.id)}
                  >
                    切换账号
                  </Button>
                )}
                {!a.demo && (
                  <Button variant="ghost" size="sm" onClick={() => onLogin(a)}>
                    重新登录
                  </Button>
                )}
                {!a.demo && (
                  <Button variant="ghost" size="sm" onClick={() => onLogout(a)}>
                    退出登录
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="remove-button"
                  onClick={() => onRemove(a.id)}
                >
                  移除
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="add-account-button"
          onClick={onAdd}
        >
          <Plus size={16} />
          添加校园账号
        </Button>
      </section>
      <div className="local-note">
        <span className="local-note-icon">
          <ArrowDownLeft size={21} />
        </span>
        <div>
          <h3>数据保存在本机</h3>
          <p>
            已同步的数据可离线查看。移除账号会同时清除它在本机的登录状态与缓存。
          </p>
        </div>
      </div>
    </>
  );
}
export function PageHeading({
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      <p>{description}</p>
      <Tooltip content={description}>
        <button
          type="button"
          className="page-heading-help"
          aria-label="页面说明"
        >
          <Info size={15} />
        </button>
      </Tooltip>
    </div>
  );
}
export function ItemDetail({
  item,
  onClose,
}: {
  item: Course | Homework;
  onClose: () => void;
}) {
  return "deadline" in item ? (
    <Modal title={item.title} subtitle={item.course} onClose={onClose}>
      <div className="detail-tags">
        <span className="soft-tag blue">{item.type}</span>
        <span
          className={`soft-tag ${item.status === "已提交" ? "teal" : "orange"}`}
        >
          {item.status}
        </span>
      </div>
      <DetailRow label="截止时间">{fullDate(item.deadline)}</DetailRow>
      {item.content && <div className="detail-note">{item.content}</div>}
    </Modal>
  ) : (
    <Modal title={item.name} subtitle="课程详情" onClose={onClose}>
      <div className={`detail-course-icon ${item.color}`}>
        <BookOpen size={32} />
      </div>
      <DetailRow label="任课教师">{item.teacher}</DetailRow>
      <DetailRow label="上课地点">{item.place}</DetailRow>
      <DetailRow label="上课时间">
        星期{["一", "二", "三", "四", "五", "六", "日"][item.day - 1]} · 第{" "}
        {item.period} 节 · {periodTimes[item.period - 1]}
      </DetailRow>
      <DetailRow label="教学周次">{item.weeks}</DetailRow>
      <DetailRow label="课表类型">
        {item.selection ? "选课任务课表" : "本学期课表"}
      </DetailRow>
    </Modal>
  );
}
