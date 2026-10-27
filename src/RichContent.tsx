import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Account } from "./types";
import "./rich-content.css";
export default function RichContent({
  content,
  account,
}: {
  content: string;
  account: Account;
}) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let active = true;
    const doc = new DOMParser().parseFromString(
      DOMPurify.sanitize(content, {
        FORBID_TAGS: ["form", "input", "button", "iframe"],
      }),
      "text/html",
    );
    doc.querySelectorAll("img,a").forEach((node) => {
      const attr = node.tagName === "IMG" ? "src" : "href";
      const raw = node.getAttribute(attr);
      if (raw && !raw.startsWith("data:"))
        node.setAttribute(
          attr,
          new URL(
            raw,
            account.demo
              ? window.location.origin
              : "http://123.121.147.7:88/ve/",
          ).href,
        );
    });
    setHtml(doc.body.innerHTML);
    if (!account.demo && isTauri())
      void Promise.all(
        [...doc.images].map(async (img) => {
          const url = img.src;
          if (url.startsWith("data:")) return;
          try {
            img.src = await invoke<string>("inline_image", {
              username: account.id,
              url,
            });
          } catch {
            img.alt = img.alt || "图片暂时无法加载";
          }
        }),
      ).then(() => {
        if (active) setHtml(doc.body.innerHTML);
      });
    return () => {
      active = false;
    };
  }, [content, account.id, account.demo]);
  return (
    <div
      className="typeset typeset-docs homework-rich-content"
      onClick={(event) => {
        const a = (event.target as HTMLElement).closest("a");
        if (a) {
          event.preventDefault();
          void openUrl(a.href);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
