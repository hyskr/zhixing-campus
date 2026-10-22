import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Account, CampusData } from "./types";

export default function ReminderBridge({
  account,
  data,
}: {
  account?: Account;
  data: CampusData;
}) {
  useEffect(() => {
    if (!isTauri() || !account || account.demo) return;
    const candidates = [
      data.syncedAt?.currentWeek ?? data.lastSync,
    ]
      .filter((v): v is string => !!v)
      .map((v) => new Date(v))
      .filter((v) => Number.isFinite(v.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    const date = candidates[0];
    if (!date) return;
    const syncedDate = date
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date)
      : undefined;
    void invoke("cache_reminder_data", {
      username: account.id,
      data: {
        grades: data.grades,
        courses: data.courses,
        currentWeek: data.currentWeek,
        syncedDate,
        weekSyncedAt: data.syncedAt?.currentWeek,
      },
    }).catch(() => {});
  }, [
    account?.id,
    data.grades,
    data.courses,
    data.currentWeek,
    data.lastSync,
    data.syncedAt?.currentWeek,
  ]);
  return null;
}
