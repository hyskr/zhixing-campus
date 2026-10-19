export function isInWeek(text: string, week: number) {
  const ranges = text.match(/\d+\s*[-~—]\s*\d+|\d+/g);
  if (!ranges) return true;
  const within = ranges.some((range) => {
    const [start, end] = range.split(/[-~—]/).map(Number);
    return end ? week >= start && week <= end : week === start;
  });
  return (
    within &&
    (!text.includes("单") || week % 2 === 1) &&
    (!text.includes("双") || week % 2 === 0)
  );
}
