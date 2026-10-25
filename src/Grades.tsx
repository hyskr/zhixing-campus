import { useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Table } from "@/components/motion/table";
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
  const value = Number(score.split(",").at(-1));
  return Number.isFinite(value) && score.trim()
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
          {term === "all" ? `${terms.length} 个学期` : semesterLabel(term)}
          <small>成绩与考核明细以教务系统公布为准</small>
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
