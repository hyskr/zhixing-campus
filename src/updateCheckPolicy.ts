import pkg from "../package.json";

type Channel = "app" | "frontend";
const nextChecks = new Map<Channel, number>();
const storageKey = (channel: Channel) =>
  `zhixing.update-check.${pkg.version}.${channel}`;

export function updateCheckDue(channel: Channel) {
  if (!nextChecks.has(channel)) {
    let next = 0;
    try {
      next = Number(localStorage.getItem(storageKey(channel))) || 0;
    } catch {}
    nextChecks.set(channel, next);
  }
  return Date.now() >= nextChecks.get(channel)!;
}

export function deferUpdateCheck(channel: Channel, succeeded: boolean) {
  const next = Date.now() + (succeeded ? 6 * 60 : 15) * 60_000;
  nextChecks.set(channel, next);
  try {
    localStorage.setItem(storageKey(channel), String(next));
  } catch {}
}

// 等页面恢复后再检测版本；切到后台时取消尚未开始的检测。
export function scheduleUpdateChecks(check: () => void, delay: number) {
  let pending: number | undefined;
  const schedule = () => {
    window.clearTimeout(pending);
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    pending = window.setTimeout(check, delay);
  };
  schedule();
  const interval = window.setInterval(schedule, 60_000);
  window.addEventListener("online", schedule);
  document.addEventListener("visibilitychange", schedule);
  return () => {
    window.clearTimeout(pending);
    window.clearInterval(interval);
    window.removeEventListener("online", schedule);
    document.removeEventListener("visibilitychange", schedule);
  };
}
