import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { solveCaptcha } from "./captcha";
import {
  authenticateLegacyCampus as authenticateCampus,
  ManualCaptchaRequired,
  syncCampus,
  openSchoolPage,
} from "./service";
const { stop } = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => stop) }));
vi.mock("./ssoCrypto", () => ({
  encryptSsoPassword: vi.fn(async () => "encrypted-password"),
}));
vi.mock("./captcha", () => ({ solveCaptcha: vi.fn() }));
const call = vi.mocked(invoke);
const profile = {
  id: "10001",
  name: "测试同学",
  studentId: "10001",
  department: "计算机学院",
  identity: "本科生",
  demo: false,
  color: "blue",
};
const snapshot = {
  grades: [],
  courses: [],
  homework: [],
  resources: [],
  mailCount: 2,
  failures: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  call.mockReset();
  vi.mocked(solveCaptcha).mockReset();
  vi.mocked(solveCaptcha).mockResolvedValue({
    expression: "1+10=",
    answer: "11",
  });
});
describe("校园登录与会话恢复", () => {
  it("验证码识别后提交学校认证表单", async () => {
    call
      .mockResolvedValueOnce({ image: "captcha-image" })
      .mockResolvedValueOnce(profile);
    expect(await authenticateCampus("10001", "test-password", false)).toEqual(
      profile,
    );
    expect(call).toHaveBeenNthCalledWith(2, "finish_login", {
      username: "10001",
      password: "test-password",
      answer: "11",
      remember: false,
    });
  });
  it("识别失败时保留当前验证码供人工输入", async () => {
    call.mockResolvedValueOnce({ image: "captcha-image" });
    vi.mocked(solveCaptcha).mockRejectedValueOnce(
      new Error("unknown expression"),
    );
    await expect(
      authenticateCampus("10001", "test-password", false),
    ).rejects.toBeInstanceOf(ManualCaptchaRequired);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("验证码被拒后换图，不重复提交相同验证码", async () => {
    call
      .mockResolvedValueOnce({ image: "first" })
      .mockRejectedValueOnce("验证码未通过，请刷新后重试")
      .mockResolvedValueOnce({ image: "second" })
      .mockResolvedValueOnce(profile);
    await authenticateCampus("10001", "test-password", false);
    expect(vi.mocked(solveCaptcha).mock.calls.map((call) => call[0])).toEqual([
      "first",
      "second",
    ]);
  });
  it("密码错误直接返回，不进行验证码重试", async () => {
    call
      .mockResolvedValueOnce({ image: "first" })
      .mockRejectedValueOnce("账号或密码错误，请检查后重试");
    await expect(
      authenticateCampus("10001", "test-password", false),
    ).rejects.toBe("账号或密码错误，请检查后重试");
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("有效会话同步不读取密码", async () => {
    call.mockResolvedValueOnce(snapshot);
    expect(await syncCampus("10001")).toEqual(snapshot);
    expect(call).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it("会话失效后使用已保存凭据登录再同步", async () => {
    call
      .mockRejectedValueOnce("登录状态已失效，请重新登录校园账号")
      .mockResolvedValueOnce({ publicKey: "sso-key", credentialMode: "file" })
      .mockResolvedValueOnce("test-password")
      .mockResolvedValueOnce({ profile })
      .mockResolvedValueOnce(snapshot);
    expect(await syncCampus("10001")).toEqual(snapshot);
    expect(call.mock.calls.map((args) => args[0])).toEqual([
      "sync_account",
      "begin_sso",
      "saved_password",
      "finish_sso",
      "sync_account",
    ]);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledWith(
      "finish_sso",
      expect.objectContaining({ credentialMode: "file" }),
    );
  });
  it("子系统会话失效且未保存密码时保留成功的数据", async () => {
    const partial = {
      grades: [{ id: "g1" }],
      authExpired: true,
      failures: ["作业：登录状态已失效"],
    };
    call
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce({ publicKey: "key" })
      .mockResolvedValueOnce(null);
    expect(await syncCampus("10001")).toEqual(partial);
    expect(call).toHaveBeenCalledTimes(3);
  });
});
it("成绩页刷新只请求成绩同步范围", async () => {
  call.mockResolvedValueOnce({ ...snapshot, scope: "grades" });
  await syncCampus(
    "10001",
    () => {},
    () => {},
    "grades",
  );
  expect(call).toHaveBeenCalledWith("sync_account", {
    username: "10001",
    scope: "grades",
  });
});
it("同账号的并发过期请求共用一次登录恢复", async () => {
  let attempts = 0;
  const operation = vi.fn(async () => {
    if (attempts++ < 2) throw "登录状态已失效";
    return "ok";
  });
  call.mockImplementation(async (command) => {
    if (command === "saved_password") return "test-password";
    if (command === "begin_sso") return { publicKey: "sso-key" };
    if (command === "finish_sso") return { profile };
    throw Error(String(command));
  });
  const { withCampusSession } = await import("./service");
  expect(
    await Promise.all([
      withCampusSession("10001", operation),
      withCampusSession("10001", operation),
    ]),
  ).toEqual(["ok", "ok"]);
  expect(
    call.mock.calls.filter(([command]) => command === "begin_sso"),
  ).toHaveLength(1);
});
it("连续三次验证码校验失败后换新图交给手动输入", async () => {
  call.mockImplementation(async (command) => {
    if (command === "begin_login") return { image: "fresh-captcha" };
    if (command === "finish_login") throw "验证码未通过";
    throw Error(String(command));
  });
  await expect(
    authenticateCampus("10001", "test-password", false),
  ).rejects.toBeInstanceOf(ManualCaptchaRequired);
  expect(
    call.mock.calls.filter(([command]) => command === "finish_login"),
  ).toHaveLength(3);
  expect(
    call.mock.calls.filter(([command]) => command === "begin_login"),
  ).toHaveLength(4);
});

it("快捷入口会话失效时，先恢复认证再重试原页面与邮件编号", async () => {
  call
    .mockRejectedValueOnce("登录状态已失效，请重新登录校园账号")
    .mockResolvedValueOnce({ publicKey: "key" })
    .mockResolvedValueOnce("test-password")
    .mockResolvedValueOnce({ profile })
    .mockResolvedValueOnce(undefined);
  await openSchoolPage("10001", "mail", "mail-42");
  expect(call.mock.calls.map(([command]) => command)).toEqual([
    "open_school_page",
    "begin_sso",
    "saved_password",
    "finish_sso",
    "open_school_page",
  ]);
  expect(call).toHaveBeenLastCalledWith("open_school_page", {
    username: "10001",
    target: "mail",
    messageId: "mail-42",
  });
});
it("无法恢复登录时不继续打开快捷入口", async () => {
  call
    .mockRejectedValueOnce("登录状态已失效，请重新登录校园账号")
    .mockResolvedValueOnce({ publicKey: "key" })
    .mockResolvedValueOnce(null);
  await expect(openSchoolPage("10001", "academic")).rejects.toThrow(
    "登录状态已失效",
  );
  expect(call.mock.calls.map(([command]) => command)).toEqual([
    "open_school_page",
    "begin_sso",
    "saved_password",
  ]);
});

it("新登录默认直接完成 MIS SSO，不再衔接旧 CAS", async () => {
  const { authenticateCampus: login } = await import("./service");
  call
    .mockResolvedValueOnce({ publicKey: "key" })
    .mockResolvedValueOnce({ profile });
  expect(await login("10001", "test-password", false)).toEqual(profile);
  expect(call.mock.calls.map((c) => c[0])).toEqual(["begin_sso", "finish_sso"]);
  expect(call).toHaveBeenLastCalledWith(
    "finish_sso",
    expect.objectContaining({
      credentialMode: "session",
      encryptedPassword: "encrypted-password",
    }),
  );
});
it("SSO 仍有效时恢复不读取密码", async () => {
  call
    .mockRejectedValueOnce("登录状态已失效")
    .mockResolvedValueOnce({ profile })
    .mockResolvedValueOnce(undefined);
  await openSchoolPage("10001", "academic");
  expect(call.mock.calls.map((c) => c[0])).toEqual([
    "open_school_page",
    "begin_sso",
    "open_school_page",
  ]);
});
it("学校要求字母验证码时交给手动输入，不使用旧 OCR", async () => {
  const { authenticateSso } = await import("./service");
  const challenge = {
    publicKey: "key",
    captchaRequired: true,
    image: "data:image/png;base64,test",
  };
  call
    .mockResolvedValueOnce({ publicKey: "key" })
    .mockResolvedValueOnce(challenge);
  const error = await authenticateSso("10001", "password", "file").catch(
    (e) => e,
  );
  expect(error).toBeInstanceOf(ManualCaptchaRequired);
  expect(error.ssoChallenge).toEqual(challenge);
  expect(solveCaptcha).not.toHaveBeenCalled();
  call.mockResolvedValueOnce({ profile });
  await authenticateSso(
    "10001",
    "password",
    "file",
    () => {},
    error.ssoChallenge,
    "AbCd",
  );
  expect(call).toHaveBeenLastCalledWith(
    "finish_sso",
    expect.objectContaining({ answer: "AbCd", credentialMode: "file" }),
  );
});

it("SSO 密码错误不自动重试或回退 CAS", async () => {
  const { authenticateCampus: login } = await import("./service");
  call
    .mockResolvedValueOnce({ publicKey: "key" })
    .mockRejectedValueOnce("账号或密码错误，请检查后重试");
  await expect(login("10001", "bad-password", false)).rejects.toBe(
    "账号或密码错误，请检查后重试",
  );
  expect(call.mock.calls.map((c) => c[0])).toEqual(["begin_sso", "finish_sso"]);
});
