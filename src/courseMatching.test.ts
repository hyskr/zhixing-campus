import { expect, it } from "vitest";
import { sameCourseName } from "./courseMatching";
it("课表培养层次后缀不阻断智慧课程关联", () => {
  expect(sameCourseName("工程伦理 [研]", "工程伦理")).toBe(true);
  expect(sameCourseName("工程伦理（研究生）", "工程伦理")).toBe(true);
});
it("保留区分课程的标题内容", () => {
  expect(sameCourseName("学术规范（在线课程）", "学术规范")).toBe(false);
  expect(sameCourseName("工程伦理", "科研伦理")).toBe(false);
});
