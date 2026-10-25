import { useEffect, useState } from "react";
import {
  Home,
  CalendarDays,
  NotebookPen,
  Mail,
  Grid2X2,
  Settings2,
  UserRound,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import { BottomSheet } from "@/components/motion/bottom-sheet";
import { icons } from "./ui";
import { navItems, type Page, type Account } from "./types";

const primary = [
  { id: "overview", label: "首页", icon: Home },
  { id: "schedule", label: "课表", icon: CalendarDays },
  { id: "homework", label: "作业", icon: NotebookPen },
  { id: "mail", label: "邮箱", icon: Mail },
] as const;
export default function MobileNavigation({
  page,
  navigate,
  account,
  unread,
  onLogin,
}: {
  page: Page;
  navigate: (page: Page, root?: boolean) => void;
  account?: Account;
  unread: number;
  onLogin: () => void;
}) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!more) return;
    const back = (event: Event) => {
      event.preventDefault();
      setMore(false);
    };
    window.addEventListener("campus:before-back", back);
    return () => window.removeEventListener("campus:before-back", back);
  }, [more]);
  function go(next: Page, root = false) {
    if (root && next === page)
      window.dispatchEvent(
        new CustomEvent("campus:tab-reselect", { detail: next }),
      );
    setMore(false);
    navigate(next, root);
  }
  return (
    <>
      <nav className="mobile-navigation" aria-label="底部导航">
        {primary.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            className="mobile-nav-item"
            aria-label={label}
            aria-current={page === id ? "page" : undefined}
            onClick={() => go(id, true)}
          >
            <span>
              <Icon size={22} />
              {id === "mail" && unread > 0 && (
                <b>{unread > 99 ? "99+" : unread}</b>
              )}
            </span>
            <small>{label}</small>
          </Button>
        ))}
        <Button
          variant="ghost"
          className="mobile-nav-item"
          aria-current={
            !primary.some((item) => item.id === page) ? "page" : undefined
          }
          onClick={() => setMore(true)}
          aria-label="更多功能"
        >
          <Grid2X2 size={22} />
          <small>更多</small>
        </Button>
      </nav>
      <BottomSheet
        open={more}
        onOpenChange={setMore}
        snapPoints={[0.9]}
        title="更多功能"
        description="学习资料、校园服务和个人设置"
        className="mobile-more-sheet"
      >
        <Button
          variant="secondary"
          className="mobile-account"
          onClick={() => {
            setMore(false);
            if (account) go("accounts");
            else onLogin();
          }}
        >
          <UserRound size={21} />
          <span>
            <strong>{account?.name ?? "连接校园账号"}</strong>
            <small>{account?.studentId ?? "登录后同步校园数据"}</small>
          </span>
        </Button>
        <div className="mobile-more-groups">
          {[
            { label: "学习", pages: ["resources", "grades", "classrooms"] },
            { label: "工具", pages: ["downloads", "files", "services"] },
          ].map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              <div className="mobile-more-list">
                {group.pages.map((id) => {
                  const item = navItems.find((item) => item.id === id)!;
                  const Icon = icons[item.icon as keyof typeof icons];
                  return (
                    <Button
                      key={id}
                      variant="ghost"
                      onClick={() => go(item.id)}
                    >
                      <span className="mobile-more-icon">
                        <Icon size={20} />
                      </span>
                      <span>{item.label}</span>
                      <ChevronRight size={16} />
                    </Button>
                  );
                })}
              </div>
            </section>
          ))}
          <section>
            <h3>个人</h3>
            <div className="mobile-more-list">
              <Button variant="ghost" onClick={() => go("settings")}>
                <span className="mobile-more-icon">
                  <Settings2 size={20} />
                </span>
                <span>设置</span>
                <ChevronRight size={16} />
              </Button>
              <Button variant="ghost" onClick={() => go("accounts")}>
                <span className="mobile-more-icon">
                  <UserRound size={20} />
                </span>
                <span>账号与数据</span>
                <ChevronRight size={16} />
              </Button>
            </div>
          </section>
        </div>
      </BottomSheet>
    </>
  );
}
