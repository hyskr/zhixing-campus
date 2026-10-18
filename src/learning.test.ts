import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getLinks, loadHomeworkDetail, submitHomework } from "./learning";
import type { Account, Homework, UploadedFile } from "./types";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
const call = vi.mocked(invoke);
const account: Account = {
  id: "10001",
  name: "测试",
  studentId: "10001",
  department: "学院",
  identity: "学生",
  demo: false,
  color: "blue",
};
const homework: Homework = {
  id: "123|2|456",
  courseId: "123",
  course: "实验课程",
  title: "实验",
  type: "实验",
  deadline: "2026-10-30",
  status: "未提交",
  content: "说明",
};
beforeEach(() => call.mockReset());
it("未开放标记不会阻止本人请求学校资源链接", async () => {
  const resource = {
    id: "res-1",
    name: "课件.pdf",
    rpId: "rp-1",
    courseId: "123",
    downloadAllowed: false,
  };
  call.mockResolvedValueOnce([
    { id: "res-1", name: "课件.pdf", url: "http://school/file" },
  ]);
  await expect(getLinks(account, [resource])).resolves.toHaveLength(1);
  expect(call).toHaveBeenCalledWith("resource_links", {
    username: "10001",
    items: [resource],
  });
});
it("作业详情从旧缓存 ID 恢复课程、类型与作业标识", async () => {
  call.mockResolvedValueOnce({ content: "<p>作业正文</p>" });
  await loadHomeworkDetail(account, homework);
  expect(call).toHaveBeenCalledWith("homework_detail", {
    username: "10001",
    courseId: "123",
    sourceId: "456",
    kind: 2,
  });
});
it("提交保留实验类型、正文与多文件回执", async () => {
  const files: UploadedFile[] = [
    {
      id: "f1",
      name: "报告.pdf",
      size: 12,
      url: "http://school/f1",
      visitName: "/rp/f1",
      uploadedAt: "2026-10-17",
    },
    {
      id: "f2",
      name: "数据.zip",
      size: 20,
      url: "http://school/f2",
      visitName: "/rp/f2",
      uploadedAt: "2026-10-17",
    },
  ];
  call.mockResolvedValueOnce(true);
  await submitHomework(account, homework, "实验说明", files);
  expect(call).toHaveBeenCalledWith("submit_homework", {
    username: "10001",
    courseId: "123",
    sourceId: "456",
    kind: 2,
    content: "实验说明",
    files,
  });
});
it("演示账号不会提交真实作业", async () => {
  await expect(
    submitHomework({ ...account, demo: true }, homework, "内容", []),
  ).rejects.toThrow("演示账户");
  expect(call).not.toHaveBeenCalled();
});
