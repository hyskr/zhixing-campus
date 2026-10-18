import { sameCourseName } from "./courseMatching";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/motion/tabs";
// 参考来源：参考将同一课程的作业、资源、回放放在一起的组织方式；以 React 右侧面板实现。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js
import { useState } from "react";
import { BookOpen, MapPin, NotebookPen, Folder } from "lucide-react";
import type { Account, CampusData, Course, Replay, Resource } from "./types";
import { DetailRow, Modal, periodTimes } from "./ui";
import { homeworkState } from "./homework";
import Assignments from "./Assignments";
import LearningResources from "./LearningResources";
export default function CourseDrawer({
  name,
  account,
  data,
  onClose,
  onLoad,
  onRetry,
  onReplayCache,
  onRefreshResources,
}: {
  name: string;
  account: Account;
  data: CampusData;
  onClose: () => void;
  onLoad: (node: Resource) => Promise<Resource[]>;
  onRefreshResources: () => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onReplayCache: (id: string, list: Replay[]) => void;
}) {
  const [tab, setTab] = useState("课程信息");
  const same = (value: string) => sameCourseName(value, name);
  const sessions = data.courses.filter((c) => same(c.name));
  const grades = data.grades.filter((g) => same(g.name));
  const assignments = data.homework.filter((h) => same(h.course));
  const pending = assignments.filter((h) => homeworkState(h) === "pending");
  const panels = [
    {
      id: "课程信息",
      label: "课程信息",
      icon: <BookOpen size={16} />,
      content: (
        <div>
          {sessions.map((c: Course) => (
            <div className="course-session-detail" key={c.id}>
              <div>
                <strong>{c.selection ? "选课任务" : "本学期"}</strong>
                <span>{c.weeks}</span>
              </div>
              <DetailRow label="上课时间">
                周{["一", "二", "三", "四", "五", "六", "日"][c.day - 1]} · 第{" "}
                {c.period} 节 · {periodTimes[c.period - 1]}
              </DetailRow>
              <DetailRow label="上课地点">
                <MapPin size={13} /> {c.place}
              </DetailRow>
              <DetailRow label="任课教师">{c.teacher}</DetailRow>
            </div>
          ))}
          {!sessions.length && (
            <p className="quiet-empty">当前课表中没有这门课的上课安排。</p>
          )}
          {grades.map((g) => (
            <DetailRow label="课程成绩" key={g.id}>
              {g.score} · {g.credits} 学分 · {g.term}
            </DetailRow>
          ))}
        </div>
      ),
    },
    {
      id: "相关作业",
      label: "相关作业",
      icon: <NotebookPen size={16} />,
      content: (
        <Assignments
          account={account}
          data={data}
          query=""
          compact
          courseName={name}
          onRetry={onRetry}
          onCourse={() => setTab("课程信息")}
        />
      ),
    },
    {
      id: "资料与回放",
      label: "资料与回放",
      icon: <Folder size={16} />,
      content: (
        <LearningResources
          account={account}
          data={data}
          query=""
          focusCourse={name}
          compact
          onLoad={onLoad}
          onReplayCache={onReplayCache}
          onRefresh={onRefreshResources}
        />
      ),
    },
  ];
  return (
    <Modal
      title={name}
      subtitle="课程空间 · 把相关内容放在一起"
      onClose={onClose}
      side
    >
      <div className="course-drawer-summary">
        <span className="detail-course-icon blue">
          <BookOpen size={30} />
        </span>
        <div>
          <strong>
            {sessions[0]?.teacher || grades[0]?.teacher || "我的课程"}
          </strong>
          <p>
            {sessions.length} 个上课时段 · {pending.length} 项待完成作业
          </p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} variant="underline" className="course-space-tabs">
        <TabsList aria-label="课程空间导航">
          {panels.map((panel) => <TabsTrigger key={panel.id} value={panel.id}>{panel.icon}{panel.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={tab} className="course-space-content">
          {panels.find((panel) => panel.id === tab)?.content}
        </TabsContent>
      </Tabs>
    </Modal>
  );
}
