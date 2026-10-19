import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Checkbox } from "@/components/motion/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { Loader } from "@/components/motion/loader";
import { PageHeading } from "./Pages";
import { Modal, periodTimes, useErrorState } from "./ui";
import { ManualCaptchaRequired, withCampusSession } from "./service";
import type { Account, Classroom, ClassroomPage, RoomStatus } from "./types";

const names: Record<RoomStatus, string> = {
  free: "空闲",
  scheduled: "排课",
  rescheduled: "调课",
  exam: "考试",
  experiment: "实验",
  other: "其他占用",
  unknown: "未知",
};
const days = ["一", "二", "三", "四", "五", "六", "日"];
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label className="room-choice">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function demo(week: number, building: string): ClassroomPage {
  return {
    week,
    building,
    buildings: [
      { id: "1", name: "思源楼" },
      { id: "11", name: "逸夫教学楼" },
    ],
    semesters: [{ id: "demo-term", name: "演示学期" }],
    rooms: Array.from({ length: 12 }, (_, i) => ({
      id: `demo-room-${i}`,
      name: `${building === "1" ? "SY" : "YF"}${101 + i}`,
      capacity: 30 + i * 10,
      cells: Array.from({ length: 49 }, (_, j) =>
        i % 3 === 0
          ? "free"
          : (
              [
                "free",
                "scheduled",
                "exam",
                "experiment",
                "other",
              ] as RoomStatus[]
            )[(i + j) % 5],
      ),
    })),
  };
}
export default function Classrooms({
  account,
  currentWeek,
  onLoginRequired,
}: {
  account: Account;
  currentWeek: number;
  onLoginRequired: () => void;
}) {
  const [week, setWeek] = useState(String(currentWeek)),
    [building, setBuilding] = useState("1"),
    [semester, setSemester] = useState("current"),
    [day, setDay] = useState(String(new Date().getDay() || 7)),
    [period, setPeriod] = useState("all"),
    [query, setQuery] = useState(""),
    [minimum, setMinimum] = useState(""),
    [free, setFree] = useState(false),
    [page, setPage] = useState<ClassroomPage | null>(null),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<Classroom | null>(null);
  const [, setError] = useErrorState();
  useEffect(() => {
    let active = true;
    setBusy(true);
    const load = account.demo
      ? Promise.resolve(demo(Number(week), building))
      : withCampusSession(account.id, () =>
          invoke<ClassroomPage>("classroom_occupancy", {
            username: account.id,
            week: Number(week),
            building,
            semester: semester === "current" ? null : semester,
          }),
        );
    void load
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((error) => {
        if (active) {
          setError(String(error));
          if (
            error instanceof ManualCaptchaRequired ||
            String(error).includes("登录状态已失效")
          )
            onLoginRequired();
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [account.id, week, building, semester, revision]);
  const periods =
    period === "all" ? [0, 1, 2, 3, 4, 5, 6] : [Number(period) - 1];
  const rooms = (page?.rooms ?? []).filter(
    (room) =>
      room.name.toLowerCase().includes(query.toLowerCase()) &&
      room.capacity >= Number(minimum || 0) &&
      (!free ||
        periods.every(
          (slot) => room.cells[(Number(day) - 1) * 7 + slot] === "free",
        )),
  );
  return (
    <div className="classrooms-page">
      <PageHeading
        title="教室占用"
        eyebrow="CLASSROOMS"
        description="按教学周、教学楼和时段查找空闲教室，点击教室查看整周。"
      />
      <div className="rooms-toolbar">
        <Choice
          label="教学周"
          value={week}
          onChange={setWeek}
          options={Array.from({ length: 53 }, (_, i) => ({
            id: String(i + 1),
            name: `第 ${i + 1} 周`,
          }))}
        />
        <Choice
          label="教学楼"
          value={building}
          onChange={setBuilding}
          options={
            page?.buildings.length
              ? page.buildings
              : [{ id: "1", name: "思源楼" }]
          }
        />
        <Choice
          label="学期"
          value={semester}
          onChange={setSemester}
          options={[
            { id: "current", name: "当前学期" },
            ...(page?.semesters ?? []),
          ]}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={14} className={busy ? "spin" : ""} />
          刷新占用
        </Button>
      </div>
      <div className="rooms-filters">
        <Input
          aria-label="搜索教室"
          placeholder="搜索教室编号"
          leftIcon={<Search size={14} />}
          value={query}
          onChange={setQuery}
        />
        <Choice
          label="星期"
          value={day}
          onChange={setDay}
          options={days.map((name, i) => ({
            id: String(i + 1),
            name: `周${name}`,
          }))}
        />
        <Choice
          label="时段"
          value={period}
          onChange={setPeriod}
          options={[
            { id: "all", name: "全天" },
            ...periodTimes.map((time, i) => ({
              id: String(i + 1),
              name: `第 ${i + 1} 节 · ${time}`,
            })),
          ]}
        />
        <Input
          type="number"
          aria-label="最低座位数"
          placeholder="最低座位数"
          value={minimum}
          onChange={setMinimum}
        />
        <Checkbox label="仅空闲" checked={free} onCheckedChange={setFree} />
      </div>
      <div className="rooms-summary">
        <span>
          {busy ? (
            <>
              <Loader size={14} label="读取教室占用" />
              正在更新，保留已加载结果
            </>
          ) : (
            `${rooms.length} 间教室 · 第 ${page?.week ?? week} 周 · 周${days[Number(day) - 1]}`
          )}
        </span>
        <div className="rooms-legend">
          {Object.entries(names).map(([status, name]) => (
            <span key={status}>
              <i className={`room-mark ${status}`} />
              {name}
            </span>
          ))}
        </div>
      </div>
      <div className="surface rooms-results">
        <table className="rooms-table">
          <thead>
            <tr>
              <th>教室 / 座位</th>
              {periodTimes.map((time, i) => (
                <th key={time}>
                  第 {i + 1} 节<small>{time}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <th>
                  <button onClick={() => setSelected(room)}>{room.name}</button>
                  <small>
                    {room.capacity ? `${room.capacity} 座` : "座位未提供"}
                  </small>
                </th>
                {periodTimes.map((_, i) => {
                  const state = room.cells[(Number(day) - 1) * 7 + i];
                  return (
                    <td
                      key={i}
                      className={`room-cell ${state}`}
                      title={`${room.name} · 周${days[Number(day) - 1]}第 ${i + 1} 节 · ${names[state]}`}
                    >
                      {names[state]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!rooms.length && !busy && (
          <div className="quiet-empty">
            {page
              ? "没有符合条件的教室，可调整星期、时段或空闲筛选。"
              : "尚未读取教室占用。"}
          </div>
        )}
      </div>
      {selected && (
        <Modal
          title={`${selected.name} · 第 ${page?.week ?? week} 周`}
          subtitle={`${selected.capacity || "未知"} 座 · 整周占用`}
          onClose={() => setSelected(null)}
          wide
        >
          <table className="rooms-table room-week-table">
            <thead>
              <tr>
                <th>时段</th>
                {days.map((name) => (
                  <th key={name}>周{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodTimes.map((time, p) => (
                <tr key={time}>
                  <th>
                    第 {p + 1} 节<small>{time}</small>
                  </th>
                  {days.map((_, d) => {
                    const state = selected.cells[d * 7 + p];
                    return (
                      <td key={d} className={`room-cell ${state}`}>
                        {names[state]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
