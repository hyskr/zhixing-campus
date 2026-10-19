// BeUI 侧栏源码：https://beui.dev/components/motion/animated-sidebar
import {
  BookOpen,
  Check,
  ChevronDown,
  PanelLeftClose,
  Plus,
  Settings2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import {
  AnimatedSidebar,
  AnimatedSidebarHeader,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuItem,
  AnimatedSidebarMenuButton,
  AnimatedSidebarTrigger,
} from "@/components/motion/animated-sidebar";
import { Button } from "@/components/motion/button";
import type { Account, Page } from "./types";
import { navItems } from "./types";
import { icons } from "./ui";
export default function CampusSidebar({
  page,
  account,
  accounts,
  navigate,
  onSwitch,
  onAdd,
  pending,
  downloading,
  unread,
}: {
  page: Page;
  account?: Account;
  accounts: Account[];
  navigate: (page: Page) => void;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  pending: number;
  downloading: number;
  unread: number;
}) {
  const [menu, setMenu] = useState(false);
  const mainItems = [
    "overview",
    "mail",
    "schedule",
    "homework",
    "grades",
    "resources",
  ].map((id) => navItems.find((item) => item.id === id)!);
  const tools = navItems.filter(
    (item) => !mainItems.some((main) => main.id === item.id),
  );
  return (
    <AnimatedSidebar ariaLabel="主导航" panelClassName="campus-sidebar-panel">
      <AnimatedSidebarHeader className="campus-sidebar-header">
        <button
          className="campus-brand"
          aria-label="知行首页"
          onClick={() => navigate("overview")}
        >
          <span className="brand-symbol">
            <BookOpen size={21} strokeWidth={1.7} />
          </span>
          <span className="sidebar-expanded">
            <strong>
              知行 <i>Campus</i>
            </strong>
          </span>
        </button>
        <AnimatedSidebarTrigger className="sidebar-fold" aria-label="切换侧栏">
          <PanelLeftClose size={16} />
        </AnimatedSidebarTrigger>
      </AnimatedSidebarHeader>
      <AnimatedSidebarContent className="campus-sidebar-content">
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupLabel>学习与消息</AnimatedSidebarGroupLabel>
          <AnimatedSidebarMenu>
            {mainItems.map((item) => {
              const Icon = icons[item.icon as keyof typeof icons];
              return (
                <AnimatedSidebarMenuItem key={item.id}>
                  <AnimatedSidebarMenuButton
                    className="campus-nav-link"
                    isActive={page === item.id}
                    icon={<Icon size={18} strokeWidth={1.7} />}
                    onSelect={() => navigate(item.id)}
                    badge={
                      item.id === "mail" && unread > 0 ? (
                        <span
                          className="nav-count mail-count"
                          aria-label={`${unread} 封未读`}
                        >
                          {unread}
                        </span>
                      ) : item.id === "homework" && pending > 0 ? (
                        <span className="nav-count">{pending}</span>
                      ) : undefined
                    }
                  >
                    {item.label}
                  </AnimatedSidebarMenuButton>
                </AnimatedSidebarMenuItem>
              );
            })}
          </AnimatedSidebarMenu>
        </AnimatedSidebarGroup>
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupLabel>校园与工具</AnimatedSidebarGroupLabel>
          <AnimatedSidebarMenu>
            {tools.map((item) => {
              const Icon = icons[item.icon as keyof typeof icons];
              return (
                <AnimatedSidebarMenuItem key={item.id}>
                  <AnimatedSidebarMenuButton
                    className="campus-nav-link"
                    isActive={page === item.id}
                    icon={<Icon size={18} strokeWidth={1.7} />}
                    onSelect={() => navigate(item.id)}
                    badge={
                      item.id === "downloads" && downloading > 0 ? (
                        <span className="nav-count">{downloading}</span>
                      ) : undefined
                    }
                  >
                    {item.label}
                  </AnimatedSidebarMenuButton>
                </AnimatedSidebarMenuItem>
              );
            })}
          </AnimatedSidebarMenu>
        </AnimatedSidebarGroup>
      </AnimatedSidebarContent>
      <AnimatedSidebarFooter className="campus-sidebar-footer">
        <div className="workspace-status sidebar-expanded">
          <span className="status-dot" />
          <span>
            {account?.demo ? "演示工作空间" : "北京交通大学"}
            <small>
              {account?.demo ? "连接账号后获取真实数据" : "校园数据 · 本机保存"}
            </small>
          </span>
        </div>
        <AnimatedSidebarMenu>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              className="campus-nav-link"
              isActive={page === "accounts"}
              onSelect={() => navigate("accounts")}
              icon={<UserRound size={18} />}
            >
              账号与数据
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              className="campus-nav-link"
              isActive={page === "settings"}
              onSelect={() => navigate("settings")}
              icon={<Settings2 size={18} />}
            >
              设置
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </AnimatedSidebarMenu>
        <div className="account-switcher-wrap">
          <button
            className="account-switcher"
            aria-label="切换校园账号"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <span className={`avatar ${account?.color ?? "blue"}`}>
              {account?.name.slice(0, 1) ?? <Plus size={17} />}
            </span>
            <span className="account-name sidebar-expanded">
              <strong>{account?.name ?? "连接校园账号"}</strong>
              <small>
                {account?.demo ? "演示账户" : (account?.studentId ?? "未登录")}
              </small>
            </span>
            <ChevronDown size={14} className="sidebar-expanded" />
          </button>
          {menu && (
            <>
              <button
                className="menu-backdrop"
                aria-label="关闭账号菜单"
                onClick={() => setMenu(false)}
              />
              <div className="account-popover">
                <div className="menu-label">校园账号</div>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      onSwitch(a.id);
                      setMenu(false);
                    }}
                  >
                    <span className={`avatar small ${a.color}`}>
                      {a.name.slice(0, 1)}
                    </span>
                    <span>
                      {a.name}
                      <small>{a.demo ? "演示账户" : a.studentId}</small>
                    </span>
                    {account?.id === a.id && <Check size={15} />}
                  </button>
                ))}
                <Button
                  variant="ghost"
                  className="menu-add"
                  onClick={() => {
                    onAdd();
                    setMenu(false);
                  }}
                >
                  <Plus size={16} />
                  添加校园账号
                </Button>
              </div>
            </>
          )}
        </div>
      </AnimatedSidebarFooter>
    </AnimatedSidebar>
  );
}
