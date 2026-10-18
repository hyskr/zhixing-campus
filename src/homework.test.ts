import { describe, expect, it } from "vitest";
import { byDeadline, homeworkState, timeRemaining } from "./homework";
import type { Homework } from "./types";
const now = new Date("2026-10-16T12:00:00+08:00").getTime();
const item: Homework = {
  id: "1",
  course: "课程",
  title: "任务",
  type: "作业",
  deadline: "2026-10-17T06:00:00+08:00",
  status: "未提交",
  content: "",
};
describe("作业状态与剩余时间", () => {
  it("未截止未提交是待完成，跨过截止时间后是逾期", () => {
    expect(homeworkState(item, now)).toBe("pending");
    expect(homeworkState(item, new Date(item.deadline).getTime())).toBe(
      "overdue",
    );
  });
  it("已提交任务不会因截止时间过去而变成逾期", () => {
    expect(homeworkState({ ...item, status: "已提交" }, now + 864000000)).toBe(
      "submitted",
    );
    expect(
      homeworkState(
        { ...item, submittedAt: "2026-10-16 10:00" },
        now + 864000000,
      ),
    ).toBe("submitted");
  });
  it("没有截止日期仍能正常展示", () => {
    expect(homeworkState({ ...item, deadline: "" }, now)).toBe("pending");
    expect(timeRemaining("", now)).toBe("未提供截止时间");
  });
  it("用实际小时表达剩余时间，向下分解天数", () => {
    expect(timeRemaining(item.deadline, now)).toBe("剩余 18 小时 0 分钟");
    expect(timeRemaining(new Date(now + 54 * 3600000).toISOString(), now)).toBe(
      "剩余 2 天 6 小时",
    );
    expect(timeRemaining(item.deadline, now + 17 * 3600000 + 40 * 60000)).toBe(
      "剩余 20 分钟",
    );
  });
  it("时间推进会改变倒计时，截止后明确提示", () => {
    expect(timeRemaining(item.deadline, now + 3600000)).toBe(
      "剩余 17 小时 0 分钟",
    );
    expect(timeRemaining(item.deadline, now + 19 * 3600000)).toBe("已截止");
  });
  it("没有截止时间的任务排在有截止时间的任务后面", () => {
    const items = [
      { ...item, id: "none", deadline: "" },
      item,
      { ...item, id: "early", deadline: "2026-10-16T14:00:00+08:00" },
    ];
    expect(items.sort(byDeadline).map((v) => v.id)).toEqual([
      "early",
      "1",
      "none",
    ]);
  });
});
