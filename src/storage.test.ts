import { describe, expect, it } from "vitest";
import { applySync } from "./storage";
import { emptyData } from "./types";
import { makeDemoData } from "./demo";
describe("同步快照与缓存", () => {
  it("失败的数据源保留旧数据，正常空列表清除已删除项目", () => {
    const old = makeDemoData();
    const next = applySync(old, {
      grades: [],
      failures: ["作业：学校连接超时"],
    });
    expect(next.grades).toEqual([]);
    expect(next.homework).toEqual(old.homework);
    expect(next.courses).toEqual(old.courses);
    expect(
      next.changes.some((c) => c.category === "成绩" && c.kind === "删除"),
    ).toBe(true);
  });
  it("课程目录刷新仍保留已加载的文件供离线查看", () => {
    const old = makeDemoData();
    const roots = old.resources.map((root) => ({
      ...root,
      children: [],
      loaded: false,
    }));
    const next = applySync(old, { resources: roots, failures: [] });
    expect(next.resources[0].children).toEqual(old.resources[0].children);
    expect(next.resources[0].loaded).toBe(false);
  });
  it("个人资料与认证状态不会混入校园数据缓存", () => {
    const next = applySync(makeDemoData(), {
      profile: {
        id: "10001",
        name: "测试",
        studentId: "10001",
        department: "学院",
        identity: "本科生",
        color: "blue",
        demo: false,
      },
      authExpired: true,
      failures: [],
    });
    expect(next).not.toHaveProperty("profile");
    expect(next).not.toHaveProperty("authExpired");
  });
});

describe("按课程逐步更新作业", () => {
  it("一个课程类型更新不会删除其他课程和失败类型的旧缓存", () => {
    const old = makeDemoData();
    const unchanged = old.homework.filter(
      (item) => item.course !== "数据库原理" || item.type !== "作业",
    );
    const next = applySync(old, {
      homeworkPatches: [
        { courseId: "db", course: "数据库原理", type: "作业", items: [] },
      ],
      failures: [],
    });
    expect(next.homework).toEqual(unchanged);
  });
  it("重试单门课程成功只清除这门课程的错误", () => {
    const old = makeDemoData();
    old.homeworkErrors = [
      {
        courseId: "db",
        course: "数据库原理",
        type: "作业",
        message: "timeout",
      },
      {
        courseId: "net",
        course: "计算机网络",
        type: "实验",
        message: "timeout",
      },
    ];
    const next = applySync(old, {
      retriedCourseId: "db",
      homeworkPatches: [],
      homeworkErrors: [],
      failures: [],
    });
    expect(next.homeworkErrors).toEqual([old.homeworkErrors[1]]);
  });
  it("重复最终快照不会制造重复任务", () => {
    const old = makeDemoData();
    const item = { ...old.homework[0], id: "real-h1", courseId: "net" };
    const patch = {
      courseId: "net",
      course: item.course,
      type: item.type,
      items: [item],
    };
    const once = applySync(old, { homeworkPatches: [patch], failures: [] });
    const twice = applySync(once, { homeworkPatches: [patch], failures: [] });
    expect(twice.homework.filter((h) => h.id === item.id)).toHaveLength(1);
    expect(twice.changes).toEqual(once.changes);
  });
});

it("局部刷新保留全量同步时间与其他页面数据", () => {
  const old = emptyData();
  old.lastSync = "2026-10-17T00:00:00Z";
  const next = applySync(old, { scope: "grades", grades: [], failures: [] });
  expect(next.lastSync).toBe(old.lastSync);
  expect(next.syncedAt?.grades).toBeTruthy();
  expect(next.homework).toEqual(old.homework);
});
it("全量同步更新成功模块的各自时间", () => {
  const old = emptyData();
  old.syncedAt = {
    grades: "2026-10-17T00:00:00Z",
    mail: "2026-10-17T00:00:00Z",
  };
  const next = applySync(old, {
    scope: "all",
    grades: [],
    failures: ["邮箱暂不可用"],
  });
  expect(next.syncedAt?.grades).toBe(next.lastSync);
  expect(next.syncedAt?.mail).toBe(old.syncedAt.mail);
});
it("一项余额更新不清除另一项缓存", () => {
  const old = emptyData();
  old.balances = { card: "128.50", network: "35.00" };
  const next = applySync(old, {
    scope: "services",
    balances: { network: "40.00" },
    failures: ["校园卡余额暂不可用"],
  });
  expect(next.balances).toEqual({ card: "128.50", network: "40.00" });
});
