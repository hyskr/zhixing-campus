import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Account,
  Resource,
  SyncResult,
  HomeworkPatch,
  Replay,
  ReplayLink,
} from "./types";

export class ManualCaptchaRequired extends Error {
  constructor(
    public image: string,
    message: string,
  ) {
    super(message);
  }
}
export async function authenticateCampus(
  username: string,
  password: string,
  remember: boolean,
  progress: (label: string) => void = () => {},
  preview: (
    image: string,
    answer: string,
    expression: string,
  ) => void = () => {},
  options?: { credentialMode: string; loginMethod: string },
): Promise<Account> {
  for (let attempt = 0; attempt < 3; attempt++) {
    progress(attempt ? "正在重新获取验证码" : "正在连接学校认证中心");
    const { image } = await invoke<{ image: string }>("begin_login", {
      username,
    });
    preview(image, "", "");
    progress("正在本地识别验证码");
    let solved: { answer: string; expression: string };
    try {
      const { solveCaptcha } = await import("./captcha");
      solved = await solveCaptcha(image);
    } catch {
      throw new ManualCaptchaRequired(
        image,
        "自动识别未完成，请填写图片中的算式结果",
      );
    }
    preview(image, solved.answer, solved.expression);
    progress("正在验证校园账号");
    try {
      return await invoke<Account>("finish_login", {
        username,
        password,
        answer: solved.answer,
        remember,
        ...(options ? options : {}),
      });
    } catch (error) {
      if (!String(error).includes("验证码未通过")) throw error;
      if (attempt === 2) {
        const { image } = await invoke<{ image: string }>("begin_login", {
          username,
        });
        throw new ManualCaptchaRequired(
          image,
          "连续识别未通过，请手动填写新的验证码结果",
        );
      }
    }
  }
  throw new Error("验证码校验未通过，请重试");
}
const reauthenticating = new Map<string, Promise<Account>>();
async function renewCampus(
  username: string,
  progress: (label: string) => void = () => {},
): Promise<Account> {
  const pending = reauthenticating.get(username);
  if (pending) return pending;
  const job = (async () => {
    const password = await invoke<string | null>("saved_password", {
      username,
    });
    if (!password) throw new Error("登录状态已失效，请重新登录校园账号");
    return authenticateCampus(username, password, true, progress);
  })();
  reauthenticating.set(username, job);
  try {
    return await job;
  } finally {
    reauthenticating.delete(username);
  }
}
export async function syncCampus(
  username: string,
  progress: (label: string) => void = () => {},
  onPatch: (patch: HomeworkPatch) => void = () => {},
  scope?: string,
): Promise<SyncResult> {
  const stop = await listen<{ accountId: string; label: string }>(
    "campus-sync-progress",
    ({ payload }) => {
      if (payload.accountId === username) progress(payload.label);
    },
  );
  const stopPatch = await listen<{ accountId: string; patch: HomeworkPatch }>(
    "campus-homework-patch",
    ({ payload }) => {
      if (payload.accountId === username) onPatch(payload.patch);
    },
  );
  try {
    let result: SyncResult | undefined;
    let firstError: unknown;
    try {
      result = await invoke<SyncResult>("sync_account", {
        username,
        ...(scope ? { scope } : {}),
      });
    } catch (error) {
      if (!String(error).includes("登录状态已失效")) throw error;
      firstError = error;
    }
    if (result && !result.authExpired) return result;
    try {
      await renewCampus(username, progress);
    } catch (error) {
      if (result) return result;
      throw error ?? firstError;
    }
    return await invoke<SyncResult>("sync_account", {
      username,
      ...(scope ? { scope } : {}),
    });
  } finally {
    stop();
    stopPatch();
  }
}
export async function loadCourseware(
  username: string,
  node: Resource,
): Promise<Resource[]> {
  return withCampusSession(username, () =>
    invoke<Resource[]>("courseware_children", {
      username,
      courseId: node.courseId,
      parentId: node.sourceId ?? "0",
      docType: node.docType ?? null,
    }),
  );
}

export async function withCampusSession<T>(
  username: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!String(error).includes("登录状态已失效")) throw error;
    await renewCampus(username);
    return operation();
  }
}
/** 原生端更新平台会话后再创建或导航网页窗口；MIS 失效时先恢复登录。 */
export function openSchoolPage(
  username: string,
  target: string,
  messageId?: string,
): Promise<void> {
  return withCampusSession(username, () =>
    invoke<void>("open_school_page", {
      username,
      target,
      messageId: messageId ?? null,
    }),
  );
}
export const loadReplays = (username: string, courseId: string) =>
  withCampusSession(username, () =>
    invoke<Replay[]>("course_replays", { username, courseId }),
  );
export const loadReplayLinks = (username: string, replay: Replay) =>
  withCampusSession(username, () =>
    invoke<ReplayLink[]>("replay_links", {
      username,
      courseId: replay.courseId,
      videoId: replay.videoId,
      teacherId: replay.teacherId,
    }),
  );
export const retryHomework = (username: string, courseId: string) =>
  withCampusSession(username, () =>
    invoke<SyncResult>("sync_homework_course", { username, courseId }),
  );
