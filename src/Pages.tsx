import HomeShortcuts from "./HomeShortcuts";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/motion/tabs";
import { Card, CardContent } from "@/components/motion/card";
import { Table, type TableColumn } from "@/components/motion/table";
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
  Grade,
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

export function Overview({
  account,
  data,
  navigate,
  showChanges,
  showMail,
  onHomeworkUpdate,
  onCourse,
}: {
  account: Account;
  data: CampusData;
  navigate: (page: Page) => void;
  showChanges: () => void;
  showMail: () => void;
  onHomeworkUpdate: (id: string) => Promise<void>;
  onCourse: (name: string) => void;
}) {
  const now = useNow();
  const day = new Date(now).getDay() || 7;
  const [selected, setSelected] = useState<Homework | null>(null);
  const [view, setView] = useState("tasks");
  const pending = data.homework
    .filter((item) => homeworkState(item, now) === "pending")
    .sort(byDeadline);
  const courses = data.courses.filter(
    (item) => !item.selection && isInWeek(item.weeks, data.currentWeek),
  );
  const today = courses
    .filter((item) => item.day === day)
    .sort((left, right) => left.period - right.period);
  const courseNames = [
    ...new Set([
      ...courses.map((item) => item.name),
      ...data.resources.map((item) => item.name),
    ]),
  ];
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  return (
    <div className="workspace-home">
      <header className="home-heading">
        <div className="home-heading-copy">
          <h1>校园概览</h1>
          <p>
            {account.name} · {date} · 第 {data.currentWeek} 教学周
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate("schedule")}
        >
          <CalendarDays size={15} /> 查看课表
        </Button>
      </header>
      <div className="home-summary" aria-label="校园数据摘要">
        <button onClick={() => navigate("schedule")}>
          今日课程 <strong>{today.length}</strong>
          <span>节</span>
        </button>
        <button onClick={() => navigate("homework")}>
          待完成作业 <strong>{pending.length}</strong>
          <span>项</span>
        </button>
        <button onClick={showMail}>
          未读邮件 <strong>{data.mailCount}</strong>
          <span>封</span>
        </button>
        <button onClick={() => navigate("resources")}>
          课程空间 <strong>{courseNames.length}</strong>
          <span>门</span>
        </button>
      </div>
      <div className="home-columns">
        <div className="home-main-column">
          <section className="home-activity">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">WORKSPACE</span>
                <h2>需要关注</h2>
              </div>
              <button
                onClick={() =>
                  view === "tasks" ? navigate("homework") : showChanges()
                }
              >
                查看全部 <ArrowUpRight size={15} />
              </button>
            </div>
            <Tabs
              value={view}
              onValueChange={setView}
              variant="underline"
              className="home-tabs"
            >
              <TabsList>
                <TabsTrigger value="tasks">
                  待办 <span className="home-tab-count">{pending.length}</span>
                </TabsTrigger>
                <TabsTrigger value="updates">
                  最近动态{" "}
                  <span className="home-tab-count">{data.changes.length}</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tasks" className="home-tab-panel">
                {pending.length ? (
                  pending.slice(0, 3).map((item) => (
                    <button
                      className="home-task-row"
                      key={item.id}
                      onClick={() => setSelected(item)}
                    >
                      <span className="home-task-status">
                        <Circle size={17} />
                      </span>
                      <span className="home-task-info">
                        <strong>{item.title}</strong>
                        <small>
                          {item.course} <span>·</span> {item.type}
                        </small>
                      </span>
                      <span className="home-task-deadline">
                        <Clock3 size={14} /> {remaining(item.deadline)}
                      </span>
                      <ChevronRight size={16} className="home-row-chevron" />
                    </button>
                  ))
                ) : (
                  <div className="home-list-empty">
                    <Check size={22} />
                    <strong>待办已完成</strong>
                    <span>目前没有尚未截止的作业。</span>
                  </div>
                )}
                <button
                  className="home-list-footer"
                  onClick={() => navigate("homework")}
                >
                  打开作业列表 <ArrowRight size={15} />
                </button>
              </TabsContent>
              <TabsContent value="updates" className="home-tab-panel">
                {data.changes.length ? (
                  data.changes.slice(0, 3).map((change) => (
                    <div
                      className="home-task-row home-change-row"
                      key={change.id}
                    >
                      <span className="home-update-mark">
                        <RefreshCw size={15} />
                      </span>
                      <span className="home-task-info">
                        <strong>{change.title}</strong>
                        <small>{change.category}更新</small>
                      </span>
                      <time>{shortDate(change.time)}</time>
                    </div>
                  ))
                ) : (
                  <div className="home-list-empty">
                    <RefreshCw size={22} />
                    <strong>还没有更新记录</strong>
                    <span>同步校园数据后，变化会显示在这里。</span>
                  </div>
                )}
                <button className="home-list-footer" onClick={showChanges}>
                  查看所有变更 <ArrowRight size={15} />
                </button>
              </TabsContent>
            </Tabs>
          </section>
          <section className="home-course-section">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">COURSES</span>
                <h2>课程空间</h2>
              </div>
              <button onClick={() => navigate("resources")}>
                查看资料 <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="home-course-list">
              {courseNames.slice(0, 4).map((name, index) => (
                <button
                  className="home-course-row"
                  key={name}
                  onClick={() => onCourse(name)}
                >
                  <span className="home-course-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>课程信息 · 作业 · 资料 · 回放</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              {!courseNames.length && (
                <p className="quiet-empty">同步后在这里查看课程内容。</p>
              )}
            </div>
          </section>
        </div>
        <aside className="home-right-rail" aria-label="今日信息">
          <section className="home-rail-section">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">TODAY</span>
                <h2>今日课表</h2>
              </div>
              <button onClick={() => navigate("schedule")}>
                完整课表 <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="home-week-strip">
              {["一", "二", "三", "四", "五", "六", "日"].map(
                (label, index) => (
                  <button
                    key={label}
                    className={day === index + 1 ? "active" : ""}
                    onClick={() => navigate("schedule")}
                    aria-label={`周${label}课表`}
                  >
                    <span>{label}</span>
                    <strong>
                      {courses.filter((item) => item.day === index + 1).length}
                    </strong>
                  </button>
                ),
              )}
            </div>
            <div className="home-day-list">
              {today.length ? (
                today.slice(0, 3).map((item) => (
                  <button key={item.id} onClick={() => onCourse(item.name)}>
                    <time>{periodTimes[item.period - 1]?.split("–")[0]}</time>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.place} · {item.teacher}
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))
              ) : (
                <div className="home-today-empty">
                  <CalendarDays size={20} />
                  <strong>今天没有课程</strong>
                  <span>可以安排自己的时间。</span>
                </div>
              )}
            </div>
            {today.length > 3 && <button className="home-list-footer" onClick={() => navigate("schedule")}>今日共 {today.length} 节课，查看完整课表 <ArrowRight size={14} /></button>}
          </section>
          <section className="home-rail-section home-shortcuts">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">QUICK ACCESS</span>
                <h2>快速入口</h2>
              </div>
            </div>
            <HomeShortcuts navigate={navigate} />
          </section>
          <div className="home-local-status">
            <span className="status-dot" />
            {account.demo
              ? "正在浏览演示数据"
              : data.lastSync
                ? "校园数据已保存到本机"
                : "等待首次同步"}
          </div>
        </aside>
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
          variant="underline"
        >
          <TabsList aria-label="课表类型">
            <TabsTrigger value="current">本学期课表</TabsTrigger>
            <TabsTrigger value="selection">选课任务课表</TabsTrigger>
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
      <section className="surface timetable">
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
                className={`schedule-cell ${col > 4 ? "weekend" : ""}`}
                key={col}
              >
                {courses
                  .filter((c) => c.day === col + 1 && c.period === row + 1)
                  .map((c) => (
                    <Tooltip
                      key={c.id}
                      content={`${c.name} · ${c.place} · ${c.teacher}`}
                    >
                      <button
                        className={`schedule-course ${c.color}`}
                        onClick={() => onCourse(c.name)}
                      >
                        <strong>{c.name}</strong>
                        <span>{c.place}</span>
                        <small>{c.teacher}</small>
                      </button>
                    </Tooltip>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </section>
      <p className="table-caption">
        点击课程查看详情<span>{courses.length} 个上课时段</span>
      </p>
      {selected && (
        <ItemDetail item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
function isInWeek(text: string, week: number) {
  const ranges = text.match(/\d+\s*[-~—]\s*\d+|\d+/g);
  if (!ranges) return true;
  const within = ranges.some((range) => {
    const [start, end] = range.split(/[-~—]/).map(Number);
    return end ? week >= start && week <= end : week === start;
  });
  return (
    within &&
    (!text.includes("单") || week % 2 === 1) &&
    (!text.includes("双") || week % 2 === 0)
  );
}

export function Grades({
  data,
  query,
  onCourse,
}: {
  data: CampusData;
  query: string;
  onCourse: (name: string) => void;
}) {
  const [selected, setSelected] = useState<Grade | null>(null);
  const rows = data.grades.filter((g) =>
    `${g.name}${g.teacher}${g.term}`.includes(query),
  );
  return (
    <>
      <PageHeading
        eyebrow="GRADES"
        title="学业成绩"
        description="课程成绩、学分与评分详情。"
      />
      <section className="surface grade-panel">
        <div className="list-top">
          <div>
            <h2>
              全部成绩 <span className="count-pill">{rows.length}</span>
            </h2>
            <p>课程成绩与学分，以教务系统公布为准</p>
          </div>
          <span className="subtle-label">点击课程查看详情</span>
        </div>
        {rows.length ? (
          <Table<Grade>
            className="grades-table"
            data={rows}
            getRowId={(g) => g.id}
            rowHeight={68}
            height={Math.min(600, Math.max(220, rows.length * 68 + 49))}
            columns={[
              {
                key: "name",
                header: "课程名称",
                sortable: true,
                width: "32%",
                cell: (g) => (
                  <button
                    className="table-course-link"
                    onClick={() => onCourse(g.name)}
                  >
                    <span className="course-letter">{g.name.slice(0, 1)}</span>
                    {g.name}
                  </button>
                ),
              },
              { key: "term", header: "学年学期", sortable: true, width: "23%" },
              { key: "teacher", header: "任课教师", width: "18%" },
              { key: "credits", header: "学分", sortable: true, width: "9%" },
              {
                key: "score",
                header: "成绩",
                sortable: true,
                width: "10%",
                cell: (g) => (
                  <span
                    className={`score ${Number(g.score.split(",").at(-1)) >= 90 ? "excellent" : ""}`}
                  >
                    {g.score}
                  </span>
                ),
              },
              {
                key: "detail",
                header: "",
                width: "8%",
                cell: (g) => (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`查看${g.name}成绩详情`}
                    onClick={() => setSelected(g)}
                  >
                    <ChevronRight size={16} />
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <Empty />
        )}
      </section>
      {selected && (
        <Modal
          title={selected.name}
          subtitle="成绩详情"
          onClose={() => setSelected(null)}
        >
          <div className="large-score">
            {selected.score.includes(",")
              ? selected.score.split(",").join(" / ")
              : selected.score}
            <small>课程成绩</small>
          </div>
          <DetailRow label="任课教师">{selected.teacher}</DetailRow>
          <DetailRow label="学年学期">{selected.term}</DetailRow>
          <DetailRow label="课程学分">{selected.credits}</DetailRow>
          {selected.detail && (
            <div className="detail-note">{selected.detail}</div>
          )}
        </Modal>
      )}
    </>
  );
}

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
          <h3>数据留在这台电脑</h3>
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
