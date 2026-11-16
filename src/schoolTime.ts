// 学校未携带时区的日期时间统一按北京时间解析，设备时区只影响显示。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/commit/d3efadbd96f0ccf2abc4b2fe9c8a53090227f550
export function schoolTime(value: string): number {
  const text = value.trim();
  const local =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(text);
  return Date.parse(local ? `${local[1]}T${local[2]}+08:00` : text);
}
