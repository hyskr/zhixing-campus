import type { CampusData, Page } from "./types";
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
) {
  const stamp = data.syncedAt?.[scope] ?? data.syncedAt?.all ?? data.lastSync;
  const time = stamp ? Date.parse(stamp) : 0;
  return (
    !Number.isFinite(time) ||
    !time ||
    now - time >= (refreshAge[scope] ?? refreshAge.all)
  );
}
