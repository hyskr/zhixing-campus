import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/motion/button";
import type { Account } from "./types";
import RichContent from "./RichContent";
import { withCampusSession } from "./service";

type Notice = {
  title: string;
  author: string;
  date: string;
  content: string;
};

export default function CourseNotices({
  account,
  courseId,
  showGroup,
}: {
  account: Account;
  courseId: string;
  showGroup: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (account.demo) return;
    let active = true;
    setError("");
    void withCampusSession(account.id, () =>
      invoke<Notice[]>("course_notices", { username: account.id, courseId }),
    )
      .then((items) => {
        if (active) setRows(items);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [account.id, account.demo, courseId, revision]);

  if (error)
    return (
      <div className="course-notices-error" role="status">
        <span>课程通知读取失败 · {error}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={14} /> 重试
        </Button>
      </div>
    );
  if (!rows.length) return null;
  return (
    <details
      className="course-notices"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        课程通知{showGroup ? ` · 教学班 ${courseId}` : ""}（{rows.length}）
      </summary>
      {expanded &&
        rows.map((notice, index) => (
          <article key={index}>
            <strong>{notice.title || "课程通知"}</strong>
            <small>
              {[notice.author, notice.date].filter(Boolean).join(" · ")}
            </small>
            <RichContent content={notice.content} account={account} />
          </article>
        ))}
    </details>
  );
}
