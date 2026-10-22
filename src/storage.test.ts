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

describe("邮箱动态", () => {
  const row = {
    id: "mail-one",
    subject: "课程通知",
    from: "教务",
    summary: "安排",
    date: "2026-10-19T08:00:00Z",
    read: false,
    attached: false,
  };
  it("首次仅建立邮件基线，新邮件进入动态且重复同步与已读变化不重复提醒", () => {
    const first = applySync(
      { ...emptyData(), changes: [] },
      { scope: "mail", mailInbox: [row], failures: [] },
    );
    expect(first.changes).toEqual([]);
    const second = applySync(first, {
      scope: "mail",
      mailInbox: [
        {
          ...row,
          id: "mail-two",
          subject: "新的课程安排",
          date: "2026-10-19T09:00:00Z",
        },
        row,
      ],
      failures: [],
    });
    expect(second.changes).toHaveLength(1);
    expect(second.changes[0]).toMatchObject({
      category: "邮箱",
      messageId: "mail-two",
      mailFolder: "inbox",
    });
    const third = applySync(second, {
      scope: "mail",
      mailInbox: second.mailInbox!.map((item) => ({ ...item, read: true })),
      failures: [],
    });
    expect(third.changes).toEqual(second.changes);
  });
  it("加载更早的已发送记录不会制造新动态", () => {
    const old = { ...emptyData(), mailSent: [row], changes: [] };
    const next = applySync(old, {
      scope: "mail",
      mailSent: [row, { ...row, id: "older", date: "2026-10-18T08:00:00Z" }],
      failures: [],
    });
    expect(next.changes).toEqual([]);
    const sent = applySync(next, {
      scope: "mail",
      mailSent: [
        { ...row, id: "new-sent", date: "2026-10-19T09:00:00Z" },
        ...next.mailSent!,
      ],
      failures: [],
    });
    expect(sent.changes[0]).toMatchObject({
      category: "邮箱",
      messageId: "new-sent",
      mailFolder: "sent",
    });
  });
});

it("已发送缓存更新保留收件箱同步时间，避免触发重复刷新", () => {
  const old = { ...emptyData(), syncedAt: { mail: "2026-10-19T08:00:00Z" } };
  const next = applySync(old, {
    scope: "mailSent",
    mailSent: [],
    mailSentTotal: 0,
    failures: [],
  });
  expect(next.syncedAt?.mail).toBe(old.syncedAt.mail);
  expect(next.syncedAt?.mailSent).toBeTruthy();
});

it("教务不可达保留成绩和课表，邮箱仍可同步", () => {
  const old = makeDemoData();
  const next = applySync(old, {
    scope: "all",
    mailInbox: [],
    mailCount: 0,
    failures: ["教务：连接被拒绝"],
  });
  expect(next.grades).toEqual(old.grades);
  expect(next.courses).toEqual(old.courses);
  expect(next.mailInbox).toEqual([]);
  expect(next.mailCount).toBe(0);
});

it("分页同步只有取得教学周时更新提醒周次时间", () => {
 const old=emptyData();old.currentWeek=6;old.syncedAt={currentWeek:"2026-10-19T00:00:00Z"};
 const mail=applySync(old,{scope:"mail",mailInbox:[],failures:[]});
 expect(mail.syncedAt?.currentWeek).toBe(old.syncedAt.currentWeek);
 const course=applySync(mail,{scope:"resources",currentWeek:7,failures:[]});
 expect(course.syncedAt?.currentWeek).not.toBe(old.syncedAt.currentWeek);
 expect(course.currentWeek).toBe(7);
});
