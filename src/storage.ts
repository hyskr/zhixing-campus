import type { AppStore, CampusData, Change, SyncResult } from "./types";
const key = "zhixing.campus.v1";
export function loadStore(): AppStore {
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const value: AppStore = JSON.parse(saved);
      if (Array.isArray(value.accounts) && value.data) {
        const removed = value.accounts.filter((account) => account.demo);
        value.accounts = value.accounts.filter((account) => !account.demo);
        for (const account of removed) delete value.data[account.id];
        if (!value.accounts.some((account) => account.id === value.activeId))
          value.activeId = value.accounts[0]?.id ?? "";
        for (const account of value.accounts.filter(
          (account) => !account.demo,
        )) {
          const data = value.data[account.id];
          if (!data) continue;
          data.resources = data.resources.map((root) =>
            root.children.some((node) => !!node.docType)
              ? root
              : {
                  ...root,
                  loaded: true,
                  children: [
                    ["1", "电子课件"],
                    ["5", "教案设计"],
                    ["10", "实验"],
                    ["12", "教材教辅"],
                    ["13", "MOOC 资源"],
                  ].map(([docType, name]) => ({
                    id: `category-${root.courseId}-${docType}`,
                    name,
                    course: root.name,
                    courseId: root.courseId,
                    sourceId: "0",
                    docType,
                    kind: "folder" as const,
                    loaded: false,
                    children: docType === "1" ? root.children : [],
                  })),
                },
          );
        }
        return value;
      }
    } catch {
      /* 缓存不可读取时从未登录状态开始。 */
    }
  }
  return { accounts: [], activeId: "", data: {} };
}
export function saveStore(store: AppStore) {
  localStorage.setItem(key, JSON.stringify(store));
}
export function applySync(old: CampusData, result: SyncResult): CampusData {
  const time = new Date().toISOString();
  const changes: Change[] = [];
  let homework = result.homework ?? old.homework;
  for (const patch of result.homeworkPatches ?? []) {
    homework = homework
      .filter(
        (item) =>
          !(
            item.type === patch.type &&
            (item.courseId
              ? item.courseId === patch.courseId
              : item.course === patch.course)
          ),
      )
      .concat(patch.items);
  }
  const effective = {
    ...result,
    homework:
      result.homework !== undefined || result.homeworkPatches
        ? homework
        : undefined,
  };
  for (const [field, category] of [
    ["grades", "成绩"],
    ["courses", "课表"],
    ["homework", "作业"],
  ] as const) {
    const next = effective[field];
    if (!next) continue;
    const before = new Map(old[field].map((item) => [item.id, item]));
    const after = new Map(next.map((item) => [item.id, item]));
    for (const item of next) {
      const prev = before.get(item.id);
      const kind = !prev
        ? "新增"
        : JSON.stringify(prev) !== JSON.stringify(item)
          ? "修改"
          : null;
      if (kind)
        changes.push({
          id: `${field}-${item.id}-${time}`,
          category,
          kind,
          title: "title" in item ? item.title : item.name,
          time,
        });
    }
    for (const item of old[field])
      if (!after.has(item.id))
        changes.push({
          id: `${field}-${item.id}-${time}`,
          category,
          kind: "删除",
          title: "title" in item ? item.title : item.name,
          time,
        });
  }
  for (const [field, folder] of [
    ["mailInbox", "inbox"],
    ["mailSent", "sent"],
  ] as const) {
    const next = result[field],
      previous = old[field];
    if (!next || !previous) continue;
    const ids = new Set(previous.map((message) => message.id));
    const timestamp = (value: string) =>
      /^\d{10,13}$/.test(value)
        ? Number(value) * (value.length === 10 ? 1000 : 1)
        : Date.parse(value) || 0;
    const newest = previous.reduce(
      (latest, message) => Math.max(latest, timestamp(message.date)),
      0,
    );
    for (const message of next)
      if (!ids.has(message.id) && timestamp(message.date) >= newest)
        changes.push({
          id: `${field}-${message.id}-${time}`,
          category: "邮箱",
          kind: "新增",
          title: `${folder === "inbox" ? "收到邮件" : "已发送"} · ${message.subject || "无主题"}`,
          time,
          messageId: message.id,
          mailFolder: folder,
        });
  }
  const syncedAt = { ...old.syncedAt };
  for (const [field, key] of [
    ["grades", "grades"],
    ["courses", "schedule"],
    ["homework", "homework"],
    ["resources", "resources"],
    ["mailInbox", "mail"],
    ["balances", "services"],
  ] as const) {
    if (result[field] !== undefined) syncedAt[key] = time;
  }
  if (result.currentWeek !== undefined) syncedAt.currentWeek = time;
  if (result.homeworkPatches?.length) syncedAt.homework = time;
  if (!result.failures.length) syncedAt[result.scope ?? "all"] = time;
  return {
    ...old,
    ...Object.fromEntries(
      Object.entries(result).filter(
        ([k, v]) =>
          ![
            "failures",
            "scope",
            "profile",
            "authExpired",
            "homeworkPatches",
            "retriedCourseId",
          ].includes(k) &&
          v !== undefined &&
          v !== null,
      ),
    ),
    homework,
    homeworkErrors: result.homeworkErrors
      ? result.retriedCourseId
        ? [
            ...(old.homeworkErrors ?? []).filter(
              (error) => error.courseId !== result.retriedCourseId,
            ),
            ...result.homeworkErrors,
          ]
        : result.homeworkErrors
      : old.homeworkErrors,
    resources: result.resources
      ? result.resources.map((root) => ({
          ...root,
          children:
            old.resources.find(
              (previous) =>
                previous.id === root.id &&
                (!previous.term || previous.term === root.term),
            )?.children ?? [],
        }))
      : old.resources,
    lastSync: result.scope && result.scope !== "all" ? old.lastSync : time,
    syncedAt,
    balances: result.balances
      ? {
          card: old.balances?.card ?? "",
          network: old.balances?.network ?? "",
          ...result.balances,
        }
      : old.balances,
    changes: [
      ...changes.filter((change) => change.category === "邮箱"),
      ...changes.filter((change) => change.category !== "邮箱"),
      ...old.changes,
    ].slice(0, 50),
  };
}
