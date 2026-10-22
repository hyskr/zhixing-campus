import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  markMail,
  recipients,
  sendMail,
  type MailDraft,
} from "./mailbox";
import type { Account } from "./types";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./service", () => ({
  withCampusSession: vi.fn((_id: string, operation: () => Promise<unknown>) =>
    operation(),
  ),
}));
const call = vi.mocked(invoke);
const account: Account = {
  id: "test",
  studentId: "test",
  name: "测试",
  department: "学院",
  identity: "学生",
  demo: false,
  color: "blue",
};
const draft: MailDraft = {
  id: "compose-1",
  to: ["recipient@example.invalid"],
  cc: [],
  bcc: [],
  subject: "测试",
  text: "正文",
  attachments: [{ id: 2, name: "附件.txt", size: 3 }],
  replyTo: null,
};
beforeEach(() => call.mockReset());
it("发送结果不明时保留错误且不自动重发", async () => {
  call.mockRejectedValueOnce("network interrupted");
  await expect(sendMail(account, draft)).rejects.toBe("network interrupted");
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith("mail_send", {
    username: account.id,
    draft,
  });
});
it("已读和未读均更新学校服务器上的同一批消息", async () => {
  call.mockResolvedValue(undefined);
  await markMail(account, ["one", "two"], false);
  expect(call).toHaveBeenCalledWith("mail_mark_read", {
    username: "test",
    messageIds: ["one", "two"],
    read: false,
  });
});
it("多个收件人支持中英文分隔符，演示账号不会发送", async () => {
  expect(
    recipients("a@example.invalid; b@example.invalid，c@example.invalid"),
  ).toEqual(["a@example.invalid", "b@example.invalid", "c@example.invalid"]);
  await expect(sendMail({ ...account, demo: true }, draft)).rejects.toThrow(
    "演示账号",
  );
  expect(call).not.toHaveBeenCalled();
});

it("回复地址保留显示名称中的逗号", () => {
  expect(
    recipients('"Zhang, San" <a@example.invalid>; b@example.invalid'),
  ).toEqual(['"Zhang, San" <a@example.invalid>', "b@example.invalid"]);
});

it("已发送分页使用独立接口和偏移，不混入收件箱", async () => {
  const { loadSent } = await import("./mailbox");
  call.mockResolvedValueOnce({ rows: [], total: 60 });
  await loadSent(account, 50);
  expect(call).toHaveBeenCalledWith("mail_sent", {
    username: "test",
    start: 50,
  });
});

