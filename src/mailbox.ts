import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { withCampusSession } from "./service";
import type { Account, MailMessage } from "./types";
export interface MailAttachment {
  id: string;
  name: string;
  size: number;
  contentType?: string;
  contentId?: string;
  url: string;
}
export interface MailDetail {
  id: string;
  subject: string;
  from: string[];
  to: string[];
  cc: string[];
  html: string;
  attachments: MailAttachment[];
}
export interface ComposeAttachment {
  id: number;
  name: string;
  size: number;
}
export interface MailDraft {
  id: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  attachments: ComposeAttachment[];
  replyTo: string | null;
}
export async function readMail(
  account: Account,
  message: MailMessage,
): Promise<MailDetail> {
  if (account.demo)
    return {
      id: message.id,
      subject: message.subject,
      from: [message.from],
      to: [message.to ?? "demo@bjtu.edu.cn"],
      cc: [],
      html: `<h2>${DOMPurify.sanitize(message.subject, { ALLOWED_TAGS: [] })}</h2><p>${DOMPurify.sanitize(message.summary, { ALLOWED_TAGS: [] })}</p><p>这是一封演示邮件，可体验完整阅读、回复与已读同步界面。</p>`,
      attachments: message.attached
        ? [
            {
              id: "demo-file",
              name: "课程通知.pdf",
              size: 1024,
              url: "/demo/document.pdf",
            },
          ]
        : [],
    };
  return withCampusSession(account.id, () =>
    invoke("mail_detail", { username: account.id, messageId: message.id }),
  );
}
export async function markMail(account: Account, ids: string[], read: boolean) {
  if (!account.demo)
    await withCampusSession(account.id, () =>
      invoke("mail_mark_read", { username: account.id, messageIds: ids, read }),
    );
}
export async function beginMail(
  account: Account,
  reply?: MailDetail,
): Promise<MailDraft> {
  if (account.demo)
    return {
      id: crypto.randomUUID(),
      to: reply?.from ?? [],
      cc: [],
      bcc: [],
      subject: reply ? `Re: ${reply.subject}` : "",
      text: "",
      attachments: [],
      replyTo: reply?.id ?? null,
    };
  const value = await withCampusSession(account.id, () =>
    invoke<{
      id: string;
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      html: string;
    }>("mail_begin_compose", {
      username: account.id,
      replyTo: reply?.id ?? null,
    }),
  );
  const parsed = new DOMParser().parseFromString(value.html, "text/html");
  parsed.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
  parsed.querySelectorAll("p,div").forEach((el) => el.append("\n"));
  return {
    ...value,
    text: parsed.body.textContent?.trim() ?? "",
    attachments: [],
    replyTo: reply?.id ?? null,
  };
}
export async function uploadMail(
  account: Account,
  id: string,
  file: File,
): Promise<ComposeAttachment> {
  if (account.demo) return { id: Date.now(), name: file.name, size: file.size };
  return invoke("mail_upload", {
    username: account.id,
    composeId: id,
    name: file.name,
    contentType: file.type || "application/octet-stream",
    data: Array.from(new Uint8Array(await file.arrayBuffer())),
  });
}
export async function sendMail(account: Account, draft: MailDraft) {
  if (account.demo) throw Error("演示账号不会发送邮件，请连接校园账号。");
  await invoke("mail_send", { username: account.id, draft });
}
export async function cancelMail(account: Account, id: string) {
  if (!account.demo)
    await invoke("mail_cancel_compose", {
      username: account.id,
      composeId: id,
    });
}
export function recipients(value: string) {
  return (value.match(/(?:"[^"]*"|[^,;，；\n])+/g) ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
}
// Coremail 有时返回整段实体转义 HTML；只解码一次，再按邮件正文规则净化。
// https://github.com/HFDLYS/BJTUselfService/blob/622fb143a30439cea0ba6361c701f8a684a43d2c/app/src/main/java/team/bjtuss/bjtuselfservice/utils/HtmlEmailRenderer.kt
export function normalizeMailHtml(html: string) {
  if (!html.includes("<") && html.includes("&lt;")) {
    return (
      new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
    );
  }
  return html;
}
function sanitizeMailHtml(html: string) {
  return DOMPurify.sanitize(normalizeMailHtml(html), {
    FORBID_TAGS: ["form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcset"],
  });
}
export function mailDocument(html: string) {
  const clean = sanitizeMailHtml(html);
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light}body{font:14px/1.7 system-ui,sans-serif;color:#303630;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#426d9a}</style></head><body>${doc.body.innerHTML}</body></html>`;
}
export async function prepareMailHtml(account: Account, detail: MailDetail) {
  const doc = new DOMParser().parseFromString(
    sanitizeMailHtml(detail.html),
    "text/html",
  );
  await Promise.all(
    [...doc.querySelectorAll("img")].map(async (img) => {
      const src = img.getAttribute("src") ?? "";
      const attachment = src.startsWith("cid:")
        ? detail.attachments.find(
            (a) => a.contentId?.replace(/^<|>$/g, "") === src.slice(4),
          )
        : undefined;
      const url =
        attachment?.url ??
        (src && !src.startsWith("cid:")
          ? new URL(src, "https://mail.bjtu.edu.cn/coremail/").href
          : "");
      if (!url) {
        img.removeAttribute("src");
        return;
      }
      if (
        !account.demo &&
        new URL(url, location.href).host === "mail.bjtu.edu.cn"
      ) {
        try {
          const data = new Uint8Array(
            await invoke<ArrayBuffer>("file_bytes", {
              username: account.id,
              url,
            }),
          );
          let binary = "";
          for (let i = 0; i < data.length; i += 8192)
            binary += String.fromCharCode(...data.subarray(i, i + 8192));
          img.src = `data:${attachment?.contentType ?? "image/png"};base64,${btoa(binary)}`;
        } catch {
          img.removeAttribute("src");
          img.alt = img.alt || "图片加载失败，可在学校邮箱查看";
        }
      } else img.src = url;
    }),
  );
  return mailDocument(doc.body.innerHTML);
}

export interface SentPage {
  rows: MailMessage[];
  total: number;
}
export async function loadSent(account: Account, start = 0): Promise<SentPage> {
  if (account.demo)
    return {
      total: 2,
      rows: start
        ? []
        : [
            {
              id: "sent-demo-1",
              subject: "实验报告提交说明",
              from: "demo@bjtu.edu.cn",
              to: "课程教师 <teacher@example.invalid>",
              summary: "老师您好，实验报告见附件。",
              date: new Date().toISOString(),
              read: true,
              attached: true,
            },
            {
              id: "sent-demo-2",
              subject: "课程安排咨询",
              from: "demo@bjtu.edu.cn",
              to: "教务办公室 <office@example.invalid>",
              summary: "您好，希望确认下周课程安排。",
              date: new Date(Date.now() - 86400000).toISOString(),
              read: true,
              attached: false,
            },
          ],
    };
  return withCampusSession(account.id, () =>
    invoke("mail_sent", { username: account.id, start }),
  );
}
