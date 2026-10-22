import { expect, it } from "vitest";
import { currentCourseSlot } from "./currentCourse";
const ranges = [
  "08:00–09:50",
  "10:10–12:00",
  "12:10–14:00",
  "14:10–16:00",
  "16:20–18:10",
  "19:00–20:50",
  "21:00–21:50",
];
it("按北京时间显示周四当前课次，开始时进入、结束时退出", () => {
  expect(currentCourseSlot(Date.parse("2026-10-22T00:00:00Z"), ranges)).toEqual(
    { day: 4, period: 1 },
  );
  expect(currentCourseSlot(Date.parse("2026-10-22T01:49:59Z"), ranges)).toEqual(
    { day: 4, period: 1 },
  );
  expect(
    currentCourseSlot(Date.parse("2026-10-22T01:50:00Z"), ranges),
  ).toBeNull();
  expect(currentCourseSlot(Date.parse("2026-10-22T02:10:00Z"), ranges)).toEqual(
    { day: 4, period: 2 },
  );
});
it("课间、晚课结束后不显示上课中", () => {
  expect(
    currentCourseSlot(Date.parse("2026-10-22T10:30:00Z"), ranges),
  ).toBeNull();
  expect(
    currentCourseSlot(Date.parse("2026-10-22T13:50:00Z"), ranges),
  ).toBeNull();
});
it("周日与跨北京时间日期按学校所在时区判断", () => {
  expect(currentCourseSlot(Date.parse("2026-10-25T13:00:00Z"), ranges)).toEqual(
    { day: 7, period: 7 },
  );
  expect(
    currentCourseSlot(Date.parse("2026-10-24T16:10:00Z"), ranges),
  ).toBeNull();
});
