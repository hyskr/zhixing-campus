import type { Grade } from "./types";

const FIVE_LEVEL_GRADE_VALUES: Record<string, { point: number; score: number }> = {
  A: { point: 4.0, score: 95 },
  "A-": { point: 3.7, score: 87 },
  "B+": { point: 3.3, score: 83 },
  B: { point: 3.0, score: 79 },
  "B-": { point: 2.7, score: 76 },
  "C+": { point: 2.3, score: 73 },
  C: { point: 2.0, score: 69 },
  "C-": { point: 1.7, score: 66 },
  "D+": { point: 1.3, score: 63 },
  D: { point: 1.0, score: 60 },
  F: { point: 0.0, score: 30 },
};

/**
 * Convert a 0-100 percentage score to BJTU's official 4.0 grade point scale.
 */
export function percentageGradePoint(score: number): number {
  if (score >= 90) return 4.0;
  if (score >= 85) return 3.7;
  if (score >= 81) return 3.3;
  if (score >= 78) return 3.0;
  if (score >= 75) return 2.7;
  if (score >= 71) return 2.3;
  if (score >= 68) return 2.0;
  if (score >= 65) return 1.7;
  if (score >= 61) return 1.3;
  if (score >= 60) return 1.0;
  return 0;
}

/**
 * Parse a stored grade score (numeric, 5-level letter, or "letter,score") into
 * both a representative 100-point score and its 4.0 GPA point. Returns null for
 * pass/fail (two-level) or ungraded entries excluded from GPA calculation.
 */
export function parseGradeValue(
  rawScore: string,
): { point: number; score: number } | null {
  const tokens = String(rawScore ?? "")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (/^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)$/.test(token)) {
      const score = Number(token);
      if (Number.isFinite(score) && score >= 0 && score <= 100) {
        return { point: percentageGradePoint(score), score };
      }
    }
    if (Object.prototype.hasOwnProperty.call(FIVE_LEVEL_GRADE_VALUES, token)) {
      return FIVE_LEVEL_GRADE_VALUES[token];
    }
  }
  return null;
}

/**
 * Return the numeric 0-100 score for a grade record, or null if non-numeric/ungraded.
 */
export function numericScore(rawScore: string): number | null {
  return parseGradeValue(rawScore)?.score ?? null;
}

/**
 * Format a single course's 4.0 grade point with one decimal place.
 */
export function gradePointText(rawScore: string): string {
  const value = parseGradeValue(rawScore);
  return value ? value.point.toFixed(1) : "—";
}

/**
 * Compute credit-weighted average score (1 decimal) and 4.0-scale GPA (2 decimals).
 */
export function calculateGradeStats(rows: Grade[]): {
  weightedAverage: string;
  gpa: string;
  countedCredits: number;
  countedCourses: number;
} {
  let weightedScores = 0;
  let weightedPoints = 0;
  let countedCredits = 0;
  let countedCourses = 0;
  for (const row of rows) {
    const credit = Number.parseFloat(String(row.credits ?? "").trim());
    const parsed = parseGradeValue(row.score);
    if (!Number.isFinite(credit) || credit <= 0 || !parsed) continue;
    countedCredits += credit;
    countedCourses += 1;
    weightedScores += parsed.score * credit;
    weightedPoints += parsed.point * credit;
  }
  if (countedCredits <= 0) {
    return {
      weightedAverage: "—",
      gpa: "—",
      countedCredits: 0,
      countedCourses: 0,
    };
  }
  return {
    weightedAverage: (weightedScores / countedCredits).toFixed(1),
    gpa: (weightedPoints / countedCredits).toFixed(2),
    countedCredits,
    countedCourses,
  };
}
