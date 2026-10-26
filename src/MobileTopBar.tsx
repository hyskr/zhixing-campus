import {
  ChevronLeft,
  Bell,
  Download,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import type { Account, Page } from "./types";
import { navItems } from "./types";
const titles: Partial<Record<Page, string>> = {
  overview: "今天",
  schedule: "课表",
  applications: "应用",
  homework: "作业",
  mail: "邮箱",
  accounts: "账号与数据",
  settings: "设置",
};
const roots: Page[] = [
  "overview",
  "schedule",
  "applications",
  "homework",
  "mail",
];
export default function MobileTopBar({
  page,
  account,
  week,
  now,
  busy,
  onBack,
  onSearch,
  onAccount,
  onRefresh,
  downloadCount = 0,
  onDownloads,
  onChanges,
  changeCount = 0,
}: {
  page: Page;
  account?: Account;
  week: number;
  now: number;
  busy: boolean;
  onBack: () => void;
  onSearch: () => void;
  onAccount: () => void;
  onRefresh: () => void;
  downloadCount?: number;
  onDownloads: () => void;
  onChanges: () => void;
  changeCount?: number;
}) {
  const home = page === "overview";
  const subtitle = home
    ? `${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(now)} · 第 ${week} 周`
    : page === "applications"
      ? "学习与校园服务"
      : undefined;
  return (
    <header
      className={`mobile-topbar ${subtitle ? "has-subtitle" : ""} ${home ? "is-home" : ""}`}
    >
      {!roots.includes(page) && (
        <Button
          variant="ghost"
          className="mobile-up-button"
          aria-label="返回上一页"
          onClick={onBack}
        >
          <ChevronLeft size={24} />
        </Button>
      )}
      <div className="mobile-topbar-copy">
        <h1>
          {titles[page] ?? navItems.find((item) => item.id === page)?.label}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="mobile-topbar-actions">
        <Button
          variant="ghost"
          className="mobile-changes-button"
          aria-label={`校园动态${changeCount ? `，${changeCount} 条更新` : ""}`}
          onClick={onChanges}
        >
          <Bell size={21} />
          {changeCount > 0 && (
            <span className="mobile-changes-dot" aria-hidden="true" />
          )}
        </Button>
        {downloadCount > 0 && (
          <Button
            variant="ghost"
            className="mobile-download-status"
            aria-label={`查看下载，${downloadCount} 个任务进行中`}
            onClick={onDownloads}
          >
            <Download size={21} />
            <small>{downloadCount}</small>
          </Button>
        )}
        {home ? (
          <Button
            variant="ghost"
            className="mobile-profile-button"
            aria-label="账号与数据"
            onClick={onAccount}
          >
            <span>{account?.name.slice(0, 1) ?? <UserRound size={20} />}</span>
          </Button>
        ) : page === "schedule" ? (
          <Button
            variant="ghost"
            aria-label="刷新本页"
            disabled={busy || !account}
            onClick={onRefresh}
          >
            <RefreshCw size={21} className={busy ? "spin" : ""} />
          </Button>
        ) : ["applications", "homework", "resources", "grades"].includes(
            page,
          ) ? (
          <Button
            variant="ghost"
            aria-label="搜索课程与作业"
            onClick={onSearch}
          >
            <Search size={22} />
          </Button>
        ) : null}
      </div>
      {busy && (
        <span
          className="mobile-topbar-progress"
          role="status"
          aria-label="正在同步"
        />
      )}
    </header>
  );
}
