import { ChevronRight, Settings2, UserRound } from "lucide-react";
import { Button } from "@/components/motion/button";
import { Card } from "@/components/motion/card";
import { icons } from "./ui";
import { navItems, type Account, type Page } from "./types";
export default function Applications({
  account,
  navigate,
  onLogin,
}: {
  account?: Account;
  navigate: (page: Page) => void;
  onLogin: () => void;
}) {
  return (
    <div className="applications-page">
      {[
        { title: "学习", pages: ["grades", "resources", "classrooms"] },
        { title: "校园与文件", pages: ["services", "files", "downloads"] },
      ].map((group) => (
        <section className="applications-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="applications-grid">
            {group.pages.map((id) => {
              const item = navItems.find((item) => item.id === id)!;
              const Icon = icons[item.icon as keyof typeof icons];
              return (
                <Card key={id} className="application-card">
                  <Button variant="ghost" onClick={() => navigate(item.id)}>
                    <span>
                      <Icon size={24} />
                    </span>
                    <strong>{item.label}</strong>
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
      <section className="applications-group">
        <h2>我的</h2>
        <div className="application-personal-list">
          <Button
            variant="ghost"
            aria-label="账号与数据"
            onClick={() => (account ? navigate("accounts") : onLogin())}
          >
            <UserRound size={22} />
            <span>
              <strong>{account?.name ?? "连接校园账号"}</strong>
              <small>{account ? "账号与数据" : "登录后同步校园数据"}</small>
            </span>
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="ghost"
            aria-label="设置"
            onClick={() => navigate("settings")}
          >
            <Settings2 size={22} />
            <span>
              <strong>设置</strong>
              <small>提醒、显示与应用更新</small>
            </span>
            <ChevronRight size={18} />
          </Button>
        </div>
      </section>
    </div>
  );
}
