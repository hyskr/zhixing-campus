import type { CampusData, Page, Preferences } from "./types";
export const refreshScopes: Partial<Record<Page, string>> = {
  overview: "all",
  mail: "mail",
  homework: "homework",
  grades: "grades",
  schedule: "schedule",
  resources: "resources",
  services: "services",
};
export const refreshAge: Record<string, number> = {
  all: 15 * 60_000,
  mail: 60_000,
  homework: 5 * 60_000,
  grades: 10 * 60_000,
  schedule: 6 * 60 * 60_000,
  resources: 15 * 60_000,
  services: 5 * 60_000,
};
export function needsRefresh(
  data: CampusData,
  scope: string,
  now = Date.now(),
  maxAge = refreshAge[scope] ?? refreshAge.all,
) {
  const stamp = data.syncedAt
    ? (data.syncedAt[scope] ??
      (scope === "all" ? undefined : data.syncedAt.all))
    : data.lastSync;
  const time = stamp ? Date.parse(stamp) : 0;
  return !Number.isFinite(time) || !time || now - time >= maxAge;
}

export function mobileRefreshScopes(page: Page): string[] {
  if (page === "overview") return ["mail", "schedule", "homework"];
  const scope = refreshScopes[page];
  return scope ? [scope] : [];
}

export function mobileRefreshAge(scope: string, preferences: Preferences) {
  if (scope === "mail") return preferences.mailInterval * 60_000;
  if (scope === "grades") return preferences.gradeInterval * 60_000;
  return refreshAge[scope] ?? refreshAge.all;
}
