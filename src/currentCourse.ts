// 当前课次的时间区间与每 30 秒更新的交互参考：
// https://github.com/HFDLYS/BJTUselfService/blob/622fb143a30439cea0ba6361c701f8a684a43d2c/app/src/main/java/team/bjtuss/bjtuselfservice/screen/CourseScheduleScreen.kt
// 校园课表按北京时间显示，结束时刻不属于该节次。
export function currentCourseSlot(now: number, ranges: readonly string[]) {
  const local = new Date(now + 8 * 60 * 60 * 1000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const index = ranges.findIndex((range) => {
    const [start, end] = range.split("–").map((value) => {
      const [hour, minute] = value.split(":").map(Number);
      return hour * 60 + minute;
    });
    return minutes >= start && minutes < end;
  });
  return index < 0 ? null : { day: local.getUTCDay() || 7, period: index + 1 };
}
