import { useRef, useState } from "react";
import { BookOpen, MapPin, UserRound, ArrowUpRight } from "lucide-react";
import MobileDetailPage from "./MobileDetailPage";
import { Button } from "@/components/motion/button";
import type { Course } from "./types";
import { periodTimes } from "./ui";

const days = ["一", "二", "三", "四", "五", "六", "日"];
export default function MobileWeekSchedule({
  courses,
  monday,
  week,
  current,
  onCourse,
  onWeekChange,
}: {
  courses: Course[];
  monday: Date;
  week: number;
  current: { day: number; period: number } | null;
  onCourse: (name: string) => void;
  onWeekChange: (direction: number) => void;
}) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [cell, setCell] = useState<{ day: number; period: number } | null>(
    null,
  );
  const selected = cell
    ? courses.filter((c) => c.day === cell.day && c.period === cell.period)
    : [];
  return (
    <>
      <section
        className="mobile-week-grid"
        onTouchStart={(event) => {
          const p = event.touches[0];
          touch.current = { x: p.clientX, y: p.clientY };
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const p = event.changedTouches[0],
            dx = p.clientX - start.x,
            dy = p.clientY - start.y;
          if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            event.preventDefault();
            onWeekChange(dx < 0 ? 1 : -1);
          }
        }}
        aria-label={`第 ${week} 周完整课表`}
      >
        <div className="mobile-week-corner">
          {monday.getMonth() + 1}
          <small>月</small>
        </div>
        {days.map((name, index) => {
          const date = new Date(monday);
          date.setDate(date.getDate() + index);
          const today = date.toDateString() === new Date().toDateString();
          return (
            <div
              className={`mobile-week-day ${today ? "is-today" : ""}`}
              key={name}
            >
              <span>周{name}</span>
              <strong>{date.getDate()}</strong>
            </div>
          );
        })}
        {periodTimes.map((time, index) => (
          <div className="mobile-week-row" key={time}>
            <div className="mobile-week-time">
              <strong>{index + 1}</strong>
              <span>{time.split("–")[0]}</span>
              <span>{time.split("–")[1]}</span>
            </div>
            {days.map((name, d) => {
              const items = courses.filter(
                (c) => c.day === d + 1 && c.period === index + 1,
              );
              const active =
                current?.day === d + 1 && current.period === index + 1;
              return (
                <div
                  className={`mobile-week-cell ${d > 4 ? "is-weekend" : ""}`}
                  key={name}
                >
                  {!!items.length && (
                    <button
                      type="button"
                      className={`mobile-week-course ${items[0].color} ${items.length > 1 ? "has-multiple" : ""} ${active ? "is-ongoing" : ""}`}
                      onClick={() => setCell({ day: d + 1, period: index + 1 })}
                      aria-label={`周${name}第 ${index + 1} 节，${items.map((c) => `${c.name}，${c.place || "地点待定"}，${c.teacher || "教师待定"}`).join("；")}`}
                    >
                      {items.slice(0, 2).map((c) => (
                        <span
                          className={`mobile-week-course-line ${c.color}`}
                          key={c.id}
                        >
                          <strong>{c.name.replace(/\s*\[研\]/g, "")}</strong>
                          <small>{c.place || "地点待定"}</small>
                        </span>
                      ))}
                      {items.length > 2 && (
                        <em>共 {items.length} 门 · 点开查看</em>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </section>
      <div className="mobile-week-caption">
        <span>
          <i />
          左右滑动切周 · 点按课程详情
        </span>
        <span>
          {new Set(courses.map((c) => `${c.day}:${c.period}`)).size} 个时段
        </span>
      </div>
      {cell && (
        <MobileDetailPage
          onBack={() => setCell(null)}
          title={`周${days[cell.day - 1]} · ${periodTimes[cell.period - 1]}`}
          subtitle={
            selected.length > 1
              ? `${selected.length} 门课程安排在同一时段`
              : `第 ${week} 教学周`
          }
        >
          {selected.map((c) => (
            <article className="mobile-slot-detail" key={c.id}>
              <span className={`mobile-slot-icon ${c.color}`}>
                <BookOpen size={21} />
              </span>
              <div>
                <h3>{c.name}</h3>
                <p>
                  <MapPin size={14} />
                  {c.place || "地点待定"}
                </p>
                <p>
                  <UserRound size={14} />
                  {c.teacher || "教师待定"}
                </p>
                <small>{c.weeks}</small>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setCell(null);
                  onCourse(c.name);
                }}
              >
                课程空间
                <ArrowUpRight size={14} />
              </Button>
            </article>
          ))}
        </MobileDetailPage>
      )}
    </>
  );
}
