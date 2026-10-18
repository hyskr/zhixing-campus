/** 教务的培养层次后缀不属于智慧课程平台的课程名称。 */
export function courseNameKey(name: string): string {
  return name.replace(/\s/g, "").replace(/(?:\[(?:研|本)\]|【(?:研|本)】|[（(](?:研究生|本科生)[）)])$/, "");
}
export function sameCourseName(left: string, right: string): boolean {
  return courseNameKey(left) === courseNameKey(right);
}
