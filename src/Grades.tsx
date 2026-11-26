import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ArrowUpRight,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CollapsibleIndicator,
} from "@/components/motion/collapsible";
import { useCompactLayout } from "./platform";
import { DetailRow, Empty, Modal } from "./ui";
import { PageHeading } from "./Pages";
import {
  calculateGradeStats,
  gradePointText,
  numericScore,
} from "./gradeStats";
import type { CampusData, Grade } from "./types";

function semesterLabel(term: string) {
  const match = term.match(/^(\d{4})-(\d{4})-([12])$/);
  return match
    ? `${match[1]}–${match[2]} · 第${match[3] === "1" ? "一" : "二"}学期`
    : term || "学期未提供";
}
function creditsTotal(rows: Grade[]) {
  return rows
    .reduce((total, row) => total + (Number(row.credits) || 0), 0)
    .toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
function scoreClass(score: string) {
  const value = numericScore(score);
  return value !== null
    ? value < 60
      ? "is-low"
      : value >= 90
        ? "is-high"
        : ""
    : "";
}
function Score({ grade }: { grade: Grade }) {
  const display = grade.score.replaceAll(",", " / ");
  return (
    <span
      className={`grade-result ${scoreClass(grade.score)} ${display.length > 5 ? "is-text" : ""}`}
      title={grade.score}
    >
      <strong>{display || "—"}</strong>
    </span>
  );
}

export default function Grades({
  data,
  query,
  onCourse,
}: {
  data: CampusData;
  query: string;
  onCourse: (name: string) => void;
}) {
  const compact = useCompactLayout();
  const [selected, setSelected] = useState<Grade | null>(null);
  const [term, setTerm] = useState("all");
  const [search, setSearch] = useState("");
  const terms = [...new Set(data.grades.map((grade) => grade.term))].sort(
    (a, b) => b.localeCompare(a),
  );
  const rows = data.grades.filter(
    (grade) =>
      (term === "all" || grade.term === term) &&
      `${grade.name} ${grade.teacher} ${grade.term}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      `${grade.name} ${grade.teacher}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = terms
    .map((value) => ({
      term: value,
      rows: rows.filter((grade) => grade.term === value),
    }))
    .filter((group) => group.rows.length);
  if (!compact)
    return <DesktopGrades data={data} query={query} onCourse={onCourse} />;
  const stats = calculateGradeStats(rows);
  return (
    <div className="grades-page">
      <PageHeading
        eyebrow="GRADES"
        title="学业成绩"
        description="按学期查看课程成绩与评分明细。"
      />
      <div className="grade-overview" aria-label="成绩汇总">
        <div>
          <span>课程记录</span>
          <strong>
            {rows.length}
            <small>门</small>
          </strong>
        </div>
        <div>
          <span>课程学分</span>
          <strong>
            {creditsTotal(rows)}
            <small>学分</small>
          </strong>
        </div>
        <p>
          加权均分 {stats.weightedAverage} · 绩点 {stats.gpa}
        </p>
      </div>
      <div className="grade-filter-bar">
        <Input
          type="search"
          value={search}
          onChange={setSearch}
          placeholder="搜索课程或教师"
          aria-label="搜索成绩课程"
          leftIcon={<Search size={16} />}
        />
        <Select
          value={term}
          onValueChange={setTerm}
          className="grade-semester-picker"
        >
          <SelectTrigger>
            <SlidersHorizontal size={14} />
            <span className="sr-only">成绩学期：</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部学期</SelectItem>
            {terms.map((value) => (
              <SelectItem key={value} value={value}>
                {semesterLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grade-semesters">
        {groups.map((group) => (
          <Collapsible key={group.term} defaultOpen className="grade-semester">
            <CollapsibleTrigger className="grade-semester-heading">
              <span>
                <strong>{semesterLabel(group.term)}</strong>
                <small>
                  {group.rows.length} 门课程 · {creditsTotal(group.rows)} 学分
                </small>
              </span>
              <CollapsibleIndicator />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mobile-grade-list" aria-label="成绩列表">
                {group.rows.map((grade) => (
                  <button
                    className="mobile-grade-row"
                    key={grade.id}
                    onClick={() => setSelected(grade)}
                    aria-label={`查看${grade.name}成绩详情`}
                  >
                    <span className="mobile-grade-copy">
                      <strong>{grade.name}</strong>
                      <small>
                        {grade.teacher || "教师未提供"}
                        <i /> {grade.credits || "—"} 学分
                      </small>
                    </span>
                    <Score grade={grade} />
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
        {!groups.length && (
          <Empty
            title={search || query ? "没有匹配的课程" : "暂无成绩记录"}
            detail={
              search || query
                ? "试试其他课程名或教师名。"
                : "同步教务成绩后，会按学期显示在这里。"
            }
          />
        )}
      </div>
      {selected && (
        <Modal
          title={selected.name}
          subtitle={semesterLabel(selected.term)}
          onClose={() => setSelected(null)}
        >
          <div className="grade-detail-hero">
            <span>课程成绩</span>
            <Score grade={selected} />
            <small>
              {selected.credits || "—"} 学分 ·{" "}
              {selected.teacher || "教师未提供"}
            </small>
          </div>
          <DetailRow label="任课教师">{selected.teacher || "未提供"}</DetailRow>
          <DetailRow label="课程学分">{selected.credits || "未提供"}</DetailRow>
          <DetailRow label="折算绩点">
            {gradePointText(selected.score)}
          </DetailRow>
          {selected.detail && (
            <section className="grade-detail-breakdown">
              <h3>评分明细</h3>
              {selected.detail
                .split(/\n|；/)
                .filter(Boolean)
                .map((line, index) => {
                  const at = line.indexOf("：");
                  return at > 0 ? (
                    <DetailRow key={index} label={line.slice(0, at)}>
                      {line.slice(at + 1)}
                    </DetailRow>
                  ) : (
                    <p key={index}>{line}</p>
                  );
                })}
            </section>
          )}
          <Button
            variant="secondary"
            className="grade-open-course"
            onClick={() => {
              setSelected(null);
              onCourse(selected.name);
            }}
          >
            进入课程空间
            <ArrowUpRight size={15} />
          </Button>
        </Modal>
      )}
    </div>
  );
}

function GradeDetailModal({
  grade,
  onClose,
  onCourse,
}: {
  grade: Grade;
  onClose: () => void;
  onCourse: (name: string) => void;
}) {
  return (
    <Modal
      title={grade.name}
      subtitle={semesterLabel(grade.term)}
      onClose={onClose}
    >
      <div className="grade-detail-hero">
        <span>课程成绩</span>
        <Score grade={grade} />
        <small>
          {grade.credits || "—"} 学分 · {grade.teacher || "教师未提供"}
        </small>
      </div>
      <DetailRow label="任课教师">{grade.teacher || "未提供"}</DetailRow>
      <DetailRow label="学年学期">{semesterLabel(grade.term)}</DetailRow>
      <DetailRow label="课程学分">{grade.credits || "未提供"}</DetailRow>
      <DetailRow label="折算绩点">{gradePointText(grade.score)}</DetailRow>
      {grade.detail && (
        <section className="grade-detail-breakdown">
          <h3>评分明细</h3>
          {grade.detail
            .split(/\n|；/)
            .filter(Boolean)
            .map((line, index) => {
              const at = line.indexOf("：");
              return at > 0 ? (
                <DetailRow key={index} label={line.slice(0, at)}>
                  {line.slice(at + 1)}
                </DetailRow>
              ) : (
                <p key={index}>{line}</p>
              );
            })}
        </section>
      )}
      <div className="grade-detail-actions">
        <Button
          variant="secondary"
          className="grade-open-course"
          onClick={() => {
            onClose();
            onCourse(grade.name);
          }}
        >
          进入课程空间
          <ArrowUpRight size={15} />
        </Button>
      </div>
    </Modal>
  );
}

function DesktopGrades({
  data,
  query,
  onCourse,
}: {
  data: CampusData;
  query: string;
  onCourse: (name: string) => void;
}) {
  const [selected, setSelected] = useState<Grade | null>(null);
  const [term, setTerm] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: "term" | "name" | "credits" | "score";
    dir: "asc" | "desc";
  }>({ key: "term", dir: "desc" });

  const terms = useMemo(
    () =>
      [...new Set(data.grades.map((grade) => grade.term))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [data.grades],
  );

  const rows = useMemo(() => {
    const keyword = `${query} ${search}`.trim().toLowerCase();
    const filtered = data.grades.filter(
      (g) =>
        (term === "all" || g.term === term) &&
        (!keyword ||
          `${g.name} ${g.teacher} ${g.term}`.toLowerCase().includes(keyword)),
    );
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "credits")
        return ((Number(a.credits) || 0) - (Number(b.credits) || 0)) * factor;
      if (sort.key === "score")
        return (
          ((numericScore(a.score) ?? -1) - (numericScore(b.score) ?? -1)) *
          factor
        );
      if (sort.key === "name")
        return a.name.localeCompare(b.name, "zh-CN") * factor;
      return a.term.localeCompare(b.term) * factor;
    });
  }, [data.grades, query, search, term, sort]);

  function toggleSort(key: "term" | "name" | "credits" | "score") {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }
  const stats = useMemo(() => calculateGradeStats(rows), [rows]);

  return (
    <div className="grades-page desktop-grades-page">
      <PageHeading eyebrow="GRADES" title="学业成绩" />
      <div className="grades-summary-strip" aria-label="成绩概览">
        <div className="grades-summary-cell">
          <span>课程数量</span>
          <strong>
            {rows.length}
            <small>门</small>
          </strong>
        </div>
        <div className="grades-summary-cell">
          <span>累计学分</span>
          <strong>
            {creditsTotal(rows)}
            <small>学分</small>
          </strong>
        </div>
        <div className="grades-summary-cell">
          <span>加权均分</span>
          <strong>
            {stats.weightedAverage}
            <small>分</small>
          </strong>
        </div>
        <div className="grades-summary-cell">
          <span>平均绩点</span>
          <strong>
            {stats.gpa}
            <small>/ 4.0</small>
          </strong>
        </div>
      </div>

      <div className="grades-toolbar">
        <div className="grades-search-box">
          <Input
            type="search"
            value={search}
            onChange={setSearch}
            placeholder="搜索课程名称或任课教师"
            aria-label="搜索课程名称或任课教师"
            leftIcon={<Search size={15} />}
          />
        </div>
        <Select
          value={term}
          onValueChange={setTerm}
          className="grade-semester-picker"
        >
          <SelectTrigger>
            <SlidersHorizontal size={14} />
            <span className="sr-only">成绩学期：</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部学期</SelectItem>
            {terms.map((value) => (
              <SelectItem key={value} value={value}>
                {semesterLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section className="surface grade-panel">
        {rows.length ? (
          <div className="grades-table-wrap">
            <table className="grades-modern-table">
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>
                    <button
                      type="button"
                      className={`grades-sort-btn ${sort.key === "name" ? "is-active" : ""}`}
                      onClick={() => toggleSort("name")}
                    >
                      课程名称 <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th style={{ width: "24%" }}>
                    <button
                      type="button"
                      className={`grades-sort-btn ${sort.key === "term" ? "is-active" : ""}`}
                      onClick={() => toggleSort("term")}
                    >
                      学年学期 <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th style={{ width: "16%" }}>任课教师</th>
                  <th style={{ width: "10%" }} className="is-num">
                    <button
                      type="button"
                      className={`grades-sort-btn ${sort.key === "credits" ? "is-active" : ""}`}
                      onClick={() => toggleSort("credits")}
                    >
                      学分 <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th style={{ width: "12%" }} className="is-num">
                    <button
                      type="button"
                      className={`grades-sort-btn ${sort.key === "score" ? "is-active" : ""}`}
                      onClick={() => toggleSort("score")}
                    >
                      成绩 <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th style={{ width: "4%" }} aria-label="详情" />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const tone = scoreClass(g.score);
                  return (
                    <tr
                      key={g.id}
                      className="grades-modern-row"
                      tabIndex={0}
                      onClick={() => setSelected(g)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(g);
                        }
                      }}
                    >
                      <td>
                        <span className="grades-course-title">{g.name}</span>
                      </td>
                      <td className="grades-cell-muted">
                        {semesterLabel(g.term)}
                      </td>
                      <td className="grades-cell-muted">
                        {g.teacher || "未提供"}
                      </td>
                      <td className="grades-cell-num">{g.credits || "—"}</td>
                      <td className="grades-cell-num">
                        <span className={`grades-score-pill ${tone}`}>
                          {g.score.replaceAll(",", " / ") || "—"}
                        </span>
                      </td>
                      <td className="grades-cell-chevron">
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={search || query ? "没有匹配的课程" : "暂无成绩记录"}
            detail={
              search || query
                ? "试试其他课程名或教师名。"
                : "同步教务成绩后，会显示在这里。"
            }
          />
        )}
      </section>
      {selected && (
        <GradeDetailModal
          grade={selected}
          onClose={() => setSelected(null)}
          onCourse={onCourse}
        />
      )}
    </div>
  );
}
