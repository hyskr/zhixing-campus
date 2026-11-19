import { CalendarArrowDown } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/motion/button";
import { Modal, periodTimes, useFeedback } from "./ui";
import { isInWeek } from "./courseWeeks";
import type { Course } from "./types";

const dayMs = 86400000;
export function teachingMonday(now: number, week = 1) {
  const shanghai = new Date(now + 8 * 3600000);
  shanghai.setUTCHours(0, 0, 0, 0);
  return new Date(
    +shanghai - (((shanghai.getUTCDay() + 6) % 7) + 7 * (week - 1)) * dayMs,
  )
    .toISOString()
    .slice(0, 10);
}
const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escapeText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|[\n\r]/g, "\\n")
    .replace(/[,;]/g, (c) => "\\" + c);
function fold(line: string) {
  const encoder = new TextEncoder();
  let length = 0,
    result = "";
  for (const c of line) {
    const size = encoder.encode(c).length;
    if (length + size > 75) {
      result += "\r\n ";
      length = 1;
    }
    result += c;
    length += size;
  }
  return result;
}
function calendar(courses: Course[], monday: string) {
  const first = Date.parse(monday + "T00:00:00Z");
  if (!Number.isFinite(first) || new Date(first).getUTCDay() !== 1)
    throw Error("请选择第一教学周的星期一");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zhixing Campus//Schedule//ZH",
    "CALSCALE:GREGORIAN",
  ];
  const generated = stamp(Date.now());
  let skipped = 0;
  for (const c of courses) {
    const times = periodTimes[c.period - 1]?.split("–");
    if (!times || !/\d/.test(c.weeks) || c.day < 1 || c.day > 7) {
      skipped++;
      continue;
    }
    let count = 0;
    for (let week = 1; week <= 53; week++) {
      if (!isInWeek(c.weeks, week)) continue;
      const date = new Date(first + ((week - 1) * 7 + c.day - 1) * dayMs)
        .toISOString()
        .slice(0, 10);
      const instant = (t: string) =>
        stamp(Date.parse(date + "T" + t + ":00+08:00"));
      lines.push(
        "BEGIN:VEVENT",
        "UID:" +
          encodeURIComponent(c.id) +
          "-" +
          date +
          "-" +
          c.period +
          "@zhixing-campus",
        "DTSTAMP:" + generated,
        "DTSTART:" + instant(times[0]),
        "DTEND:" + instant(times[1]),
        "SUMMARY:" + escapeText(c.name),
        "LOCATION:" + escapeText(c.place),
        "DESCRIPTION:" + escapeText(c.teacher),
        "END:VEVENT",
      );
      count++;
    }
    if (!count) skipped++;
  }
  if (lines.length === 4) throw Error("所选课表没有可导出的有效课次");
  lines.push("END:VCALENDAR");
  return { text: lines.map(fold).join("\r\n") + "\r\n", skipped };
}
export function CalendarExport({
  courses,
  week,
  anchor,
}: {
  courses: Course[];
  week: number;
  anchor?: string;
}) {
  const [open, setOpen] = useState(false),
    [monday, setMonday] = useState(""),
    [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        title="导出整学期课表"
        aria-label="导出整学期课表"
        className="calendar-export-trigger"
        disabled={!courses.length}
        onClick={() => {
          setMonday(
            teachingMonday(Date.parse(anchor ?? "") || Date.now(), week),
          );
          setOpen(true);
        }}
      >
        <CalendarArrowDown size={16} aria-hidden="true" />
        <span>导出课表</span>
      </Button>
      {open && (
        <Modal
          title="导出整学期课表"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <label>
            第一教学周的周一{" "}
            <input
              type="date"
              value={monday}
              onChange={(e) => setMonday(e.target.value)}
            />
          </label>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = calendar(courses, monday);
                if (
                  await invoke<boolean>("export_calendar", {
                    calendar: result.text,
                  })
                ) {
                  feedback(
                    result.skipped
                      ? `课表已导出，跳过 ${result.skipped} 条周次或节次不明的记录`
                      : "课表已导出",
                  );
                  setOpen(false);
                }
              } catch (e) {
                feedback(String(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            保存 .ics 文件
          </Button>
        </Modal>
      )}
    </>
  );
}
