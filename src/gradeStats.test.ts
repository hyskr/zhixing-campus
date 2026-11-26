import { describe, expect, it } from "vitest";
import {
  calculateGradeStats,
  gradePointText,
  parseGradeValue,
  percentageGradePoint,
} from "./gradeStats";
import type { Grade } from "./types";

function makeGrade(overrides: Partial<Grade> & { score: string; credits: string }): Grade {
  return {
    id: overrides.id ?? Math.random().toString(),
    name: overrides.name ?? "测试课程",
    teacher: overrides.teacher ?? "张老师",
    term: overrides.term ?? "2025-2026-2",
    detail: overrides.detail ?? "",
    score: overrides.score,
    credits: overrides.credits,
  };
}

describe("percentageGradePoint", () => {
  it("maps BJTU percentage thresholds to official 4.0 points", () => {
    expect(percentageGradePoint(100)).toBe(4.0);
    expect(percentageGradePoint(90)).toBe(4.0);
    expect(percentageGradePoint(89)).toBe(3.7);
    expect(percentageGradePoint(85)).toBe(3.7);
    expect(percentageGradePoint(84)).toBe(3.3);
    expect(percentageGradePoint(81)).toBe(3.3);
    expect(percentageGradePoint(80)).toBe(3.0);
    expect(percentageGradePoint(78)).toBe(3.0);
    expect(percentageGradePoint(75)).toBe(2.7);
    expect(percentageGradePoint(71)).toBe(2.3);
    expect(percentageGradePoint(68)).toBe(2.0);
    expect(percentageGradePoint(65)).toBe(1.7);
    expect(percentageGradePoint(61)).toBe(1.3);
    expect(percentageGradePoint(60)).toBe(1.0);
    expect(percentageGradePoint(59)).toBe(0);
    expect(percentageGradePoint(0)).toBe(0);
  });
});

describe("parseGradeValue", () => {
  it("parses numeric scores, 5-level letters, and comma-formatted strings", () => {
    expect(parseGradeValue("94")).toEqual({ point: 4.0, score: 94 });
    expect(parseGradeValue("87.5")).toEqual({ point: 3.7, score: 87.5 });
    expect(parseGradeValue("A")).toEqual({ point: 4.0, score: 95 });
    expect(parseGradeValue("A-")).toEqual({ point: 3.7, score: 87 });
    expect(parseGradeValue("B+")).toEqual({ point: 3.3, score: 83 });
    expect(parseGradeValue("F")).toEqual({ point: 0.0, score: 30 });
    expect(parseGradeValue("A,94")).toEqual({ point: 4.0, score: 94 });
    expect(parseGradeValue("A-,87")).toEqual({ point: 3.7, score: 87 });
    expect(gradePointText("A-,87")).toBe("3.7");
  });

  it("returns null for two-level pass/fail and empty values", () => {
    expect(parseGradeValue("通过")).toBeNull();
    expect(parseGradeValue("不通过")).toBeNull();
    expect(parseGradeValue("P")).toBeNull();
    expect(parseGradeValue("NP")).toBeNull();
    expect(parseGradeValue("—")).toBeNull();
    expect(parseGradeValue("")).toBeNull();
    expect(gradePointText("通过")).toBe("—");
  });
});

describe("calculateGradeStats", () => {
  it("calculates weighted average and 4.0 GPA while excluding two-level grades", () => {
    const rows = [
      makeGrade({ name: "数据结构", credits: "4", score: "94" }),
      makeGrade({ name: "线性代数", credits: "3", score: "88" }),
      makeGrade({ name: "实验研讨", credits: "2", score: "通过" }),
      makeGrade({ name: "专题课", credits: "2", score: "A-" }),
    ];
    // Counted credits = 4 + 3 + 2 = 9
    // Weighted score = (94*4 + 88*3 + 87*2) / 9 = (376 + 264 + 174) / 9 = 814 / 9 = 90.444 -> "90.4"
    // Weighted point = (4.0*4 + 3.7*3 + 3.7*2) / 9 = (16 + 11.1 + 7.4) / 9 = 34.5 / 9 = 3.8333 -> "3.83"
    expect(calculateGradeStats(rows)).toEqual({
      weightedAverage: "90.4",
      gpa: "3.83",
      countedCredits: 9,
      countedCourses: 3,
    });
  });

  it("returns placeholders when no countable grades exist", () => {
    expect(
      calculateGradeStats([makeGrade({ credits: "2", score: "通过" })]),
    ).toEqual({
      weightedAverage: "—",
      gpa: "—",
      countedCredits: 0,
      countedCourses: 0,
    });
  });
});
