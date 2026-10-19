import type { MailMessage } from "./types";
import type { Account, AppStore, CampusData, Course, Resource } from "./types";

export const demoAccounts: Account[] = [
  {
    id: "demo-lin",
    name: "林同学",
    studentId: "演示账户 · 本科生",
    department: "计算机与信息技术学院",
    identity: "本科生",
    demo: true,
    color: "blue",
  },
  {
    id: "demo-chen",
    name: "陈同学",
    studentId: "演示账户 · 研究生",
    department: "电子信息工程学院",
    identity: "研究生",
    demo: true,
    color: "purple",
  },
];
const courses: Course[] = [
  {
    id: "c1",
    name: "计算机网络",
    teacher: "王老师",
    place: "思源西楼 302",
    day: 1,
    period: 1,
    weeks: "第1-16周",
    selection: false,
    color: "blue",
  },
  {
    id: "c2",
    name: "操作系统",
    teacher: "李老师",
    place: "逸夫教学楼 203",
    day: 1,
    period: 3,
    weeks: "第1-16周",
    selection: false,
    color: "purple",
  },
  {
    id: "c3",
    name: "数据库原理",
    teacher: "张老师",
    place: "思源东楼 401",
    day: 2,
    period: 2,
    weeks: "第1-16周",
    selection: false,
    color: "teal",
  },
  {
    id: "c4",
    name: "软件工程",
    teacher: "赵老师",
    place: "第九教学楼 105",
    day: 2,
    period: 4,
    weeks: "第1-16周",
    selection: false,
    color: "orange",
  },
  {
    id: "c5",
    name: "计算机网络",
    teacher: "王老师",
    place: "思源西楼 302",
    day: 3,
    period: 1,
    weeks: "第1-16周",
    selection: false,
    color: "blue",
  },
  {
    id: "c6",
    name: "大学英语 III",
    teacher: "陈老师",
    place: "思源楼 206",
    day: 3,
    period: 3,
    weeks: "第1-16周",
    selection: false,
    color: "rose",
  },
  {
    id: "c7",
    name: "操作系统",
    teacher: "李老师",
    place: "逸夫教学楼 203",
    day: 4,
    period: 2,
    weeks: "第1-16周",
    selection: false,
    color: "purple",
  },
  {
    id: "c8",
    name: "数据库原理",
    teacher: "张老师",
    place: "思源东楼 401",
    day: 4,
    period: 4,
    weeks: "第1-16周",
    selection: false,
    color: "teal",
  },
  {
    id: "c9",
    name: "软件工程",
    teacher: "赵老师",
    place: "第九教学楼 105",
    day: 5,
    period: 1,
    weeks: "第1-16周",
    selection: false,
    color: "orange",
  },
  {
    id: "c10",
    name: "计算机网络实验",
    teacher: "王老师",
    place: "计算机实验中心 501",
    day: 5,
    period: 3,
    weeks: "第3-12周",
    selection: false,
    color: "blue",
  },
  {
    id: "n1",
    name: "人工智能导论",
    teacher: "刘老师",
    place: "思源东楼 502",
    day: 2,
    period: 1,
    weeks: "第1-16周",
    selection: true,
    color: "purple",
  },
];
const file = (
  id: string,
  name: string,
  course: string,
  size: string,
): Resource => ({ id, name, course, kind: "file", size, children: [] });
export function makeDemoData(second = false): CampusData {
  const now = new Date();
  const due = (days: number, hour = 23) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 59, 0, 0);
    return d.toISOString();
  };
  const names = second
    ? ["模式识别", "数字信号处理", "矩阵分析", "学术英语", "信息论基础"]
    : [
        "数据结构",
        "高等数学 II",
        "面向对象程序设计",
        "线性代数",
        "大学物理 II",
        "离散数学",
        "大学英语 II",
        "概率论与数理统计",
      ];
  const data: CampusData = {
    grades: names.map((name, i) => ({
      id: `g${i}`,
      name,
      teacher: ["李老师", "张老师", "王老师", "赵老师"][i % 4],
      score: String([94, 91, 96, 88, 90, 93, 89, 92][i]),
      credits: String([4, 5, 3, 3, 4, 3, 2, 3][i]),
      term: "2025-2026-2",
      detail: "平时成绩：92\n期末成绩：95\n考核方式：考试\n课程性质：专业必修",
    })),
    courses: second
      ? courses.slice(0, 7).map((c, i) => ({
          ...c,
          id: `r${i}`,
          name: names[i % names.length],
          place: "思源东楼 502",
        }))
      : courses,
    homework: [
      {
        id: "h1",
        course: second ? "模式识别" : "计算机网络",
        title: "实验三：TCP 协议分析",
        type: "实验",
        deadline: due(1),
        status: "未提交",
        content:
          "使用 Wireshark 分析 TCP 连接建立与释放过程，记录数据包并完成实验报告。",
      },
      {
        id: "h2",
        course: second ? "矩阵分析" : "数据库原理",
        title: "第六章：关系数据库理论",
        type: "作业",
        deadline: due(3),
        status: "未提交",
        content:
          "完成教材第六章课后习题 1、3、5、8，说明函数依赖与范式分解的过程。",
      },
      {
        id: "h3",
        course: second ? "数字信号处理" : "软件工程",
        title: "校园服务系统 · 需求分析",
        type: "课程设计",
        deadline: due(5),
        status: "未提交",
        content: "以小组为单位，提交校园服务系统的需求规格说明书与原型设计。",
      },
      {
        id: "h4",
        course: "操作系统",
        title: "实验二：进程调度",
        type: "实验",
        deadline: due(-2),
        status: "已提交",
        content: "实现 FCFS 与短作业优先调度算法，对比平均周转时间。",
      },
    ],
    resources: names.slice(0, 3).map((name, i) => ({
      id: `root${i}`,
      name: i === 0 && !second ? "计算机网络" : name,
      course: name,
      kind: "course",
      children: [
        {
          id: `folder${i}`,
          name: "课程课件",
          course: name,
          kind: "folder",
          children: [
            file(`f${i}a`, "第一章 · 课程概述.pdf", name, "2.4 MB"),
            file(`f${i}b`, "第二章 · 基础理论.pdf", name, "4.8 MB"),
            file(`f${i}c`, "第三章 · 核心方法.pptx", name, "6.2 MB"),
          ],
        },
        {
          id: `lab${i}`,
          name: "实验资料",
          course: name,
          kind: "folder",
          children: [file(`f${i}d`, "实验指导书.pdf", name, "1.6 MB")],
        },
        file(`f${i}e`, "课程教学大纲.pdf", name, "326 KB"),
      ],
    })),
    mailCount: second ? 1 : 3,
    mailInbox: makeDemoMail(second),
    mailTotal: 5,
    currentWeek: 7,
    lastSync: new Date().toISOString(),
    changes: [
      {
        id: "change-mail-demo",
        category: "邮箱",
        kind: "新增",
        title: "收到邮件 · 课程教学安排通知",
        time: new Date().toISOString(),
        messageId: "mail-demo-1",
        mailFolder: "inbox",
      },
      {
        id: "ch1",
        category: "作业",
        kind: "新增",
        title: "计算机网络发布了「实验三：TCP 协议分析」",
        time: due(0, 9),
      },
      {
        id: "ch2",
        category: "课表",
        kind: "修改",
        title: "软件工程 · 上课地点更新为第九教学楼 105",
        time: due(-1, 16),
      },
      {
        id: "ch3",
        category: "成绩",
        kind: "新增",
        title: "数据结构成绩已发布",
        time: due(-1, 10),
      },
    ],
  };
  data.homework.push({
    id: "demo-overdue",
    course: second ? "矩阵分析" : "数据库原理",
    title: "第一章补充练习",
    type: "作业",
    deadline: due(-4),
    status: "未提交",
    content: "课程课后练习。",
  });
  data.resources = data.resources.map((root, index) => ({
    ...root,
    loaded: true,
    courseId: `demo-course-${index}`,
    children: [
      ["1", "电子课件"],
      ["5", "教案设计"],
      ["10", "实验"],
      ["12", "教材教辅"],
      ["13", "MOOC 资源"],
    ].map(([docType, name]) => ({
      id: `demo-category-${index}-${docType}`,
      name,
      course: root.course,
      courseId: `demo-course-${index}`,
      docType,
      kind: "folder" as const,
      loaded: true,
      children:
        docType === "1"
          ? root.children.map((child) => ({ ...child, loaded: true, docType }))
          : docType === "10"
            ? [
                {
                  id: `demo-lab-${index}`,
                  name: "实验指导书.pdf",
                  course: root.course,
                  docType,
                  kind: "file" as const,
                  size: "1.6 MB",
                  children: [],
                },
              ]
            : [],
    })),
  }));
  return data;
}
export function initialStore(): AppStore {
  return {
    accounts: demoAccounts,
    activeId: demoAccounts[0].id,
    data: { "demo-lin": makeDemoData(), "demo-chen": makeDemoData(true) },
  };
}

export function makeDemoMail(second = false): MailMessage[] {
  return [
    {
      id: "mail-demo-1",
      subject: "课程教学安排通知",
      from: "教务办公室",
      summary:
        "请查看本周课程与教学安排，教学周及教室以教务平台公布的信息为准。",
      date: new Date().toISOString(),
      read: false,
      attached: true,
    },
    {
      id: "mail-demo-2",
      subject: "实验课程资料已更新",
      from: "计算机网络课程组",
      summary: "本周实验指导书和参考资料已上传，请课前阅读并准备实验环境。",
      date: new Date(Date.now() - 3600000 * 5).toISOString(),
      read: second,
      attached: false,
    },
    {
      id: "mail-demo-3",
      subject: "校园网服务提醒",
      from: "信息中心",
      summary: "校园网服务将于周末例行维护，详见服务通知。",
      date: new Date(Date.now() - 86400000).toISOString(),
      read: second,
      attached: false,
    },
    {
      id: "mail-demo-4",
      subject: "课程成绩发布",
      from: "教务处",
      summary: "部分课程成绩已发布，请查看成绩及学分详情。",
      date: new Date(Date.now() - 86400000 * 2).toISOString(),
      read: true,
      attached: false,
    },
    {
      id: "mail-demo-5",
      subject: "图书馆借阅到期提示",
      from: "图书馆",
      summary: "您借阅的图书即将到期，可登录系统续借。",
      date: new Date(Date.now() - 86400000 * 4).toISOString(),
      read: true,
      attached: false,
    },
  ];
}
