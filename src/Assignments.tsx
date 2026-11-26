import { invoke } from "@tauri-apps/api/core";
import { homeworkIds } from "./learning";
import { withCampusSession } from "./service";
import { useFeedback } from "./ui";
import { schoolTime } from "./schoolTime";
import { useErrorState } from "./ui";
import { sameCourseName } from "./courseMatching";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/motion/collapsible";
import {
  MultiSelect,
  MultiSelectTrigger,
  MultiSelectValue,
  MultiSelectInput,
  MultiSelectContent,
  MultiSelectList,
  MultiSelectItem,
  MultiSelectEmpty,
} from "@/components/motion/multi-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
// 参考来源：参考课程级加载进度及已加载内容先展示的交互；单课重试由本项目实现。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/app/app.js
import { useState } from "react";
import { Checkbox } from "@/components/motion/checkbox";
import { Input } from "@/components/motion/input";
import { Button } from "@/components/motion/button";
import {
  Archive,
  Download,
  X,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Account, CampusData, Homework } from "./types";
import { byDeadline, homeworkState, timeRemaining, useNow } from "./homework";
import { Empty, fullDate } from "./ui";
import { PageHeading } from "./Pages";
import HomeworkDetail from "./HomeworkDetail";

export default function Assignments({
  account,
  data,
  query,
  onIgnore,
  onRetry,
  onCourse,
  compact = false,
  courseName,
}: {
  account: Account;
  data: CampusData;
  query: string;
  onIgnore: (id: string, ignored: boolean) => void;
  onRetry: (id: string) => Promise<void>;
  onCourse: (name: string) => void;
  compact?: boolean;
  courseName?: string;
}) {
  const [type, setType] = useState("全部任务");
  const [keyword, setKeyword] = useState("");
  const [chosenCourses, setChosenCourses] = useState<string[]>([]);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Homework | null>(null);
  const [retrying, setRetrying] = useState("");
  const [error, setError] = useErrorState();
  const now = useNow();
  const [dateMode, setDateMode] = useState("全部日期");
  const [customDate, setCustomDate] = useState("");
  const [archiveMode, setArchiveMode] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);
  const feedback = useFeedback();
  function localDay(ms: number) {
    const date = new Date(ms);
    return Number.isFinite(ms)
      ? new Date(ms - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 10)
      : "";
  }
  function matchesDate(deadline: string) {
    if (dateMode === "全部日期") return true;
    const ms = schoolTime(deadline);
    if (!Number.isFinite(ms)) return false;
    if (dateMode === "今天") return localDay(ms) === localDay(now);
    if (dateMode === "指定日期")
      return !customDate || localDay(ms) === customDate;
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const days = dateMode === "3 天内" ? 3 : 7;
    return ms >= todayStart.getTime() && ms <= now + days * 86400000;
  }
  const hasActiveFilter =
    type !== "全部任务" ||
    Boolean(keyword.trim()) ||
    chosenCourses.length > 0 ||
    dateMode !== "全部日期";
  function resetFilters() {
    setType("全部任务");
    setKeyword("");
    setChosenCourses([]);
    setDateMode("全部日期");
    setCustomDate("");
  }
  const searchTerm = `${query} ${keyword}`.trim().toLowerCase();
  const courses = [...new Set(data.homework.map((h) => h.course))];
  const rows = data.homework.filter(
    (h) =>
      matchesDate(h.deadline) &&
      (!courseName || sameCourseName(h.course, courseName)) &&
      (type === "全部任务" || h.type === type) &&
      (!chosenCourses.length || chosenCourses.includes(h.course)) &&
      (!searchTerm ||
        `${h.course} ${h.title} ${h.content}`
          .toLowerCase()
          .includes(searchTerm)),
  );
  const groups = [
    { id: "pending", label: "待完成", color: "orange" },
    { id: "submitted", label: "已提交", color: "teal" },
    { id: "ignored", label: "已忽略", color: "gray" },
    { id: "overdue", label: "已逾期", color: "rose" },
  ] as const;
  const submitted = rows.filter((h) => homeworkState(h, now) === "submitted");
  const archiveItems = submitted.filter((h) => checked.includes(h.id));
  const grouped = groups.map((group) => ({
    group,
    items: rows
      .filter(
        (h) =>
          (data.ignoredHomework?.includes(h.id) &&
          homeworkState(h, now) !== "submitted"
            ? "ignored"
            : homeworkState(h, now)) === group.id,
      )
      .sort(byDeadline),
  }));
  const visibleGroups = grouped.filter(
    ({ group, items }) =>
      !hasActiveFilter ||
      items.length > 0 ||
      (group.id === "submitted" && archiveMode),
  );
  async function archive() {
    setArchiving(true);
    try {
      const items = archiveItems.map((h) => ({
        ...homeworkIds(h),
        title: h.title,
        course: h.course,
      }));
      const saved = await withCampusSession(account.id, () =>
        invoke<boolean>("archive_homework", { username: account.id, items }),
      );
      if (saved) {
        feedback(`已导出 ${items.length} 项作业`);
        setArchiveMode(false);
        setChecked([]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setArchiving(false);
    }
  }
  async function retry(id: string) {
    setRetrying(id);
    setError("");
    try {
      await onRetry(id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRetrying("");
    }
  }
  return (
    <div data-tab-swipe-surface="" style={{ display: "contents" }}>
      {!compact && (
        <PageHeading
          eyebrow="ASSIGNMENTS"
          title="课程作业"
          description="按课程、类型与截止时间追踪待办任务。"
        />
      )}
      <div className="assignment-toolbar">
        <Tabs
          value={type}
          onValueChange={(next) => setType(next)}
          variant="underline"
          className="assignment-type-tabs"
        >
          <TabsList>
            {["全部任务", "作业", "实验", "课程设计"].map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="assignment-filters">
          <div className="assignment-search-box">
            <Input
              type="search"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索作业标题、课程或内容"
              aria-label="搜索作业"
              leftIcon={<Search size={15} />}
            />
          </div>
          {!courseName && (
            <MultiSelect
              value={chosenCourses}
              onValueChange={setChosenCourses}
              className="assignment-course-multiselect"
            >
              <MultiSelectTrigger className="assignment-course-trigger">
                <MultiSelectValue
                  placeholder={null}
                  chipClassName="assignment-course-chip"
                />
                <MultiSelectInput
                  aria-label="按课程筛选作业"
                  placeholder="筛选课程"
                />
              </MultiSelectTrigger>
              <MultiSelectContent>
                <MultiSelectList>
                  {courses.map((name) => (
                    <MultiSelectItem key={name} value={name}>
                      {name}
                    </MultiSelectItem>
                  ))}
                  <MultiSelectEmpty>没有匹配课程</MultiSelectEmpty>
                </MultiSelectList>
              </MultiSelectContent>
            </MultiSelect>
          )}
          <Select
            className="assignment-date-select"
            value={dateMode}
            onValueChange={setDateMode}
          >
            <SelectTrigger aria-label="按截止日期筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["全部日期", "3 天内", "7 天内", "今天", "指定日期"].map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dateMode === "指定日期" && (
            <Input
              className="assignment-date-input"
              type="date"
              aria-label="截止日期"
              value={customDate}
              onChange={setCustomDate}
            />
          )}
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="assignment-reset-btn"
              onClick={resetFilters}
            >
              <X size={14} />
              清空筛选
            </Button>
          )}
        </div>
      </div>
      {!!data.homeworkErrors?.length && (
        <div className="course-errors">
          {[
            ...new Set(
              data.homeworkErrors
                .filter((e) => !courseName || e.course === courseName)
                .map((e) => e.courseId),
            ),
          ].map((id) => {
            const errors = data.homeworkErrors!.filter(
              (e) => e.courseId === id,
            );
            return (
              <div className="course-error-row" key={id}>
                <div>
                  <strong>{errors[0].course}</strong>
                  <p>
                    {errors.map((e) => `${e.type}：${e.message}`).join("；")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!!retrying}
                  onClick={() => retry(id)}
                >
                  <RefreshCw
                    size={13}
                    className={retrying === id ? "spin" : ""}
                  />
                  {retrying === id ? "正在重试" : "重试该课程"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {visibleGroups.map(({ group, items }) => {
        const expanded =
          opened[group.id] ?? (group.id === "pending" || hasActiveFilter);
        return (
          <Collapsible
            className={`assignment-group ${group.color}`}
            key={group.id}
            open={expanded}
            onOpenChange={(open) =>
              setOpened((current) => ({ ...current, [group.id]: open }))
            }
          >
            <div className="assignment-group-titlebar">
              <CollapsibleTrigger className="assignment-group-heading">
                {expanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <strong>{group.label}</strong>
                <span className="count-pill">{items.length}</span>
              </CollapsibleTrigger>
              {group.id === "submitted" &&
                (items.length > 0 || archiveMode) && (
                  <Button
                    className="campus-toolbar-action"
                    variant="ghost"
                    size="sm"
                    aria-label={
                      archiveMode ? "退出导出" : "批量导出已交作业"
                    }
                    disabled={archiving}
                    onClick={() => {
                      setArchiveMode(!archiveMode);
                      setChecked([]);
                      if (!archiveMode)
                        setOpened((v) => ({ ...v, submitted: true }));
                    }}
                  >
                    {archiveMode ? <X size={15} /> : <Archive size={15} />}
                    {archiveMode ? "取消" : "导出已交"}
                  </Button>
                )}
            </div>
            <CollapsibleContent>
              {group.id === "submitted" && archiveMode && (
                <div
                  className="assignment-selection-bar"
                  role="group"
                  aria-label="作业导出"
                >
                  <Checkbox
                    label="全选"
                    disabled={!items.length || archiving}
                    checked={
                      !!items.length && archiveItems.length === items.length
                    }
                    indeterminate={
                      archiveItems.length > 0 &&
                      archiveItems.length < items.length
                    }
                    onCheckedChange={(select) =>
                      setChecked(select ? items.map((h) => h.id) : [])
                    }
                  />
                  <span className="selection-status" role="status">
                    已选 {archiveItems.length} 项
                  </span>
                  <Button
                    className="campus-toolbar-action"
                    size="sm"
                    disabled={!archiveItems.length || archiving}
                    onClick={() => void archive()}
                  >
                    <Download size={15} />
                    {archiving ? "导出中…" : "导出 ZIP"}
                  </Button>
                </div>
              )}
              <div className="homework-grid">
                {items.map((h) => {
                  const hasSubmitCount =
                    h.submitCount !== undefined || h.allCount !== undefined;
                  const showReview =
                    Boolean(h.reviewStatus) &&
                    (group.id === "submitted" || h.reviewStatus !== "未批改");
                  return (
                    <article
                      className="homework-card"
                      key={h.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(h)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(h);
                        }
                      }}
                    >
                      <div className="homework-card-top">
                        {group.id === "submitted" && archiveMode && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              aria-label={`选择 ${h.title}`}
                              disabled={archiving}
                              checked={checked.includes(h.id)}
                              onCheckedChange={(select) =>
                                setChecked((previous) =>
                                  select
                                    ? [...previous, h.id]
                                    : previous.filter((id) => id !== h.id),
                                )
                              }
                            />
                          </span>
                        )}
                        <span className="homework-type">
                          <FileText size={15} />
                          {h.type}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="course-name-link homework-course"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCourse(h.course);
                        }}
                      >
                        {h.course}
                        <ChevronRight size={12} />
                      </button>
                      <div className="homework-title-block">
                        <h2>{h.title}</h2>
                        <p className="homework-excerpt">
                          {h.content || "查看任务的时间和提交状态"}
                        </p>
                      </div>
                      {(hasSubmitCount || showReview || h.score) && (
                        <div className="homework-extra-meta">
                          {hasSubmitCount && (
                            <span>
                              {h.submitCount ?? "—"}/{h.allCount ?? "—"} 人提交
                            </span>
                          )}
                          {h.score ? (
                            <span className="homework-score-tag">
                              成绩 {h.score}
                            </span>
                          ) : (
                            showReview && <span>{h.reviewStatus}</span>
                          )}
                        </div>
                      )}
                      <div className="homework-card-bottom">
                        <span>
                          <Clock3 size={13} />
                          {fullDate(h.deadline)}
                        </span>
                        {group.id === "pending" && (
                          <span
                            className={
                              schoolTime(h.deadline) - now < 86400000
                                ? "orange-text"
                                : "homework-countdown"
                            }
                          >
                            {timeRemaining(h.deadline, now)}
                          </span>
                        )}
                        {group.id === "overdue" && (
                          <span className="homework-overdue-text">已逾期</span>
                        )}
                        {group.id !== "submitted" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="homework-ignore-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const ignored = group.id !== "ignored";
                              onIgnore(h.id, ignored);
                              if (ignored)
                                feedback("已从待办中忽略", "info", {
                                  label: "撤销",
                                  onClick: () => onIgnore(h.id, false),
                                });
                            }}
                          >
                            {group.id === "ignored" ? "恢复" : "忽略"}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!items.length && (
                <div className="group-empty">
                  {group.id === "pending" ? "没有待完成的任务" : "暂无相关作业"}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {data.homework.length > 0 && visibleGroups.length === 0 && (
        <Empty
          title="没有匹配的作业"
          detail="试试调整搜索关键词、课程或截止日期筛选。"
        />
      )}
      {!data.homework.length && (
        <Empty
          title="暂无作业数据"
          detail="同步后按课程显示作业、实验与课程设计。"
        />
      )}
      {selected && (
        <HomeworkDetail
          account={account}
          item={selected}
          onUpdated={onRetry}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
