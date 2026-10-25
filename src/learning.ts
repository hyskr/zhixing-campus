import { queueDownloads } from "./downloadFeedback";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type {
  Account,
  Attachment,
  DownloadItem,
  Homework,
  HomeworkDetailData,
  SpaceFile,
  UploadedFile,
} from "./types";
import { withCampusSession } from "./service";
export function homeworkIds(h: Homework) {
  return {
    courseId: h.courseId ?? h.id.split("|")[0],
    sourceId: h.sourceId ?? h.id.split("|")[2],
    kind: ["作业", "课程设计", "实验"].indexOf(h.type),
  };
}
export async function loadHomeworkDetail(
  account: Account,
  h: Homework,
): Promise<HomeworkDetailData> {
  if (account.demo)
    return {
      content: `<p>${h.content}</p><p>请结合课堂内容完成任务，整理实验过程与结论。</p><img src="/icon.svg" alt="课程示意图" width="100"/>`,
      attachments: [
        {
          id: "demo-attachment",
          name: "实验说明.pdf",
          size: 204800,
          url: "/demo/document.pdf",
        },
      ],
      submittedContent:
        h.status === "已提交" ? "<p>实验报告已完成，请老师查收。</p>" : "",
      submittedAttachments:
        h.status === "已提交"
          ? [
              {
                id: "demo-submitted",
                name: "实验报告.pdf",
                size: 512000,
                url: "/demo/document.pdf",
              },
            ]
          : [],
      submittedAt: h.submittedAt ?? "",
      status: h.status,
      score: h.status === "已提交" ? "92" : "",
      comment: h.status === "已提交" ? "分析完整，结论清晰。" : "",
      openedAt: "",
      deadline: h.deadline,
      submitCount: 24,
      allCount: 36,
      reviewStatus: h.status === "已提交" ? "已批改" : "未批改",
      repeatAllowed: true,
      reviewError: "",
    };
  return withCampusSession(account.id, () =>
    invoke("homework_detail", { username: account.id, ...homeworkIds(h) }),
  );
}
export function submitHomework(
  account: Account,
  h: Homework,
  content: string,
  files: UploadedFile[],
) {
  if (account.demo)
    return Promise.reject(
      new Error("演示账户可预览提交内容，真实提交请连接校园账号。"),
    );
  return withCampusSession(account.id, () =>
    invoke("submit_homework", {
      username: account.id,
      ...homeworkIds(h),
      content,
      files,
    }),
  );
}
export type LinkFile = {
  downloadAllowed?: boolean;
  id: string;
  name: string;
  url?: string;
  rpId?: string;
  courseId?: string;
};
export async function getLinks(
  account: Account,
  items: LinkFile[],
): Promise<{ id: string; name: string; url: string }[]> {
  if (account.demo || !isTauri())
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      url: i.url || `https://example.com/campus/${encodeURIComponent(i.name)}`,
    }));
  return withCampusSession(account.id, () =>
    invoke("resource_links", { username: account.id, items }),
  );
}
export async function copyText(text: string) {
  if (isTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
  } else await navigator.clipboard.writeText(text);
}
export async function copyLinks(account: Account, items: LinkFile[]) {
  const links = await getLinks(account, items);
  await copyText(links.map((i) => i.url).join("\n"));
  return links;
}
export async function downloadFiles(account: Account, items: LinkFile[]) {
  if (account.demo || !isTauri())
    throw new Error("请在应用中连接校园账号后下载文件。");
  const values: DownloadItem[] = items.map((i) => ({
    ...i,
    id: crypto.randomUUID(),
    kind: "resource",
  }));
  return queueDownloads(account.id, values);
}
export async function loadSpace(
  account: Account,
  query: string,
): Promise<SpaceFile[]> {
  if (account.demo)
    return [
      {
        id: "space-demo",
        name: "课程笔记.pdf",
        url: "/demo/document.pdf",
        rpId: "demo",
        size: "1.20 MB",
        inputTime: "2026-10-16",
      },
    ].filter((i) => i.name.includes(query));
  return withCampusSession(account.id, () =>
    invoke("resource_space", { username: account.id, query }),
  );
}
const cache = new Map<string, UploadedFile[]>();
const storageKey = (id: string) => `zhixing.uploads.${id}`;
function readUploads(id: string): UploadedFile[] {
  if (cache.has(id)) return cache.get(id)!;
  try {
    return JSON.parse(localStorage.getItem(storageKey(id)) || "[]");
  } catch {
    return [];
  }
}
export function useUploads(accountId: string) {
  const [files, setFiles] = useState<UploadedFile[]>(() =>
    readUploads(accountId),
  );
  useEffect(() => {
    setFiles(readUploads(accountId));
    const handler = () => setFiles([...readUploads(accountId)]);
    window.addEventListener(`uploads:${accountId}`, handler);
    return () => window.removeEventListener(`uploads:${accountId}`, handler);
  }, [accountId]);
  function update(next: UploadedFile[], persist = true) {
    cache.set(accountId, next);
    if (persist)
      localStorage.setItem(storageKey(accountId), JSON.stringify(next));
    else {
      const saved: UploadedFile[] = JSON.parse(
        localStorage.getItem(storageKey(accountId)) || "[]",
      );
      localStorage.setItem(
        storageKey(accountId),
        JSON.stringify(
          saved.filter((file) => next.some((value) => value.id === file.id)),
        ),
      );
    }
    window.dispatchEvent(new Event(`uploads:${accountId}`));
  }
  return { files, update };
}
export function fileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
export async function uploadFile(
  account: Account,
  file: File,
  noteId?: string,
): Promise<UploadedFile> {
  if (account.demo) throw new Error("请连接校园账号后上传文件。");
  const data = await fileData(file);
  const value = await withCampusSession(account.id, () =>
    invoke<UploadedFile>("upload_file", {
      username: account.id,
      name: file.name,
      data,
      noteId: noteId ?? null,
    }),
  );
  return {
    ...value,
    lastModified: file.lastModified,
    uploadedAt: new Date().toISOString(),
    noteId,
  };
}
export const attachmentLinks = (files: Attachment[]) =>
  files.map((f) => ({ id: f.id, name: f.name, url: f.url }));
