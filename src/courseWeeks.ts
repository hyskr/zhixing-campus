// https://github.com/HFDLYS/BJTUselfService/commit/6c6f856e90cb69670b91165b8d563840716a6bca
export function isInWeek(text: string, week: number) {
  const normalized = text
    .replace(/[\s第周]/g, "")
    .replace(/[，、]/g, ",")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[－—~～至]/g, "-");
  if (!/\d/.test(normalized)) return true;
  return normalized.split(",").some((part) => {
    const match = /^(\d+)(?:-(\d+))?(?:\(([单双])\)|([单双]))?$/.exec(part);
    if (!match) return false;
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    const parity = match[3] ?? match[4];
    return (
      week >= start &&
      week <= end &&
      (!parity || week % 2 === (parity === "单" ? 1 : 0))
    );
  });
}
