import { useEffect, useState } from "react";
import {
  Home,
  CalendarDays,
  NotebookPen,
  Mail,
  Grid2X2,
  Settings2,
  UserRound,
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
  navigate: (page: Page) => void;
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
  function go(next: Page) {
    setMore(false);
    navigate(next);
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
            onClick={() => go(id)}
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
        snapPoints={[0.82]}
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
        <div className="mobile-more-grid">
          {navItems
            .filter((item) => !primary.some((p) => p.id === item.id))
            .map((item) => {
              const Icon = icons[item.icon as keyof typeof icons];
              return (
                <Button
                  key={item.id}
                  variant="secondary"
                  onClick={() => go(item.id)}
                >
                  <Icon size={22} />
                  {item.label}
                </Button>
              );
            })}
          <Button variant="secondary" onClick={() => go("settings")}>
            <Settings2 size={22} />
            设置
          </Button>
          <Button variant="secondary" onClick={() => go("accounts")}>
            <UserRound size={22} />
            账号与数据
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
