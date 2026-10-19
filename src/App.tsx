import Classrooms from "./Classrooms";
import UpdatesPopover from "./UpdatesPopover";
import { FeedbackAlerts, useFeedback } from "./ui";
import { TextReveal } from "@/components/motion/text-reveal";
import {
  MorphingSearch,
  type MorphingSearchItem,
} from "@/components/motion/morphing-search";
import CampusSidebar from "./CampusSidebar";
import {
  AnimatedSidebarProvider,
  AnimatedSidebarTrigger,
} from "@/components/motion/animated-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/motion/breadcrumb";
import { Input } from "@/components/motion/input";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Accounts, Grades, Overview, Schedule } from "./Pages";
import { icons, Modal, SyncButton, fullDate } from "./ui";
import { applySync, loadStore, saveStore } from "./storage";
import {
  syncCampus,
  loadCourseware,
  retryHomework,
  ManualCaptchaRequired,
  withCampusSession,
} from "./service";
import LoginModal from "./Login";
import Assignments from "./Assignments";
import LearningResources from "./LearningResources";
import CourseDrawer from "./CourseDrawer";
import Downloads, { useDownloads } from "./Downloads";
import FileSpace from "./FileSpace";
import Settings from "./Settings";
import MailPage from "./Mail";
import Services from "./Services";
import { listen } from "@tauri-apps/api/event";
import { Settings2 } from "lucide-react";
import { homeworkState, useNow } from "./homework";
import {
  emptyData,
  navItems,
  type Account,
  type Page,
  type Resource,
  type Replay,
  type HomeworkPatch,
} from "./types";

export default function App() {
  const [store, setStore] = useState(loadStore);
  const { tasks: downloadTasks } = useDownloads();
  const now = useNow();
  const [page, setPage] = useState<Page>("overview");
  const [deviceView, setDeviceView] = useState(false);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState("");
  const [accountMenu, setAccountMenu] = useState(false);
  const [login, setLogin] = useState<{ studentId?: string } | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"changes" | "mail" | "help" | null>(
    null,
  );
  const setToast = useFeedback("success");
  const notificationsTrigger = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const account =
    store.accounts.find((a) => a.id === store.activeId) ?? store.accounts[0];
  const data = store.data[account?.id] ?? emptyData();
  useEffect(() => {
    try {
      saveStore(store);
    } catch {
      setToast("本机存储空间不足，最新数据暂未保存", "error");
    }
  }, [store]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const navigate = (next: Page) => {
    setPage(next);
    setQuery("");
    window.scrollTo(0, 0);
  };
  const switchAccount = (id: string) => {
    setCourseName(null);
    setStore((s) => ({ ...s, activeId: id }));
    setAccountMenu(false);
    setQuery("");
    setToast("已切换账号");
    window.scrollTo(0, 0);
  };
  const pageScope =
    page === "services" && deviceView
      ? undefined
      : (
          {
            overview: "all",
            grades: "grades",
            schedule: "schedule",
            homework: "homework",
            resources: "resources",
            mail: "mail",
            services: "services",
          } as Record<string, string>
        )[page];
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const off = listen<{
      accountId: string;
      mail: {
        rows: import("./types").MailMessage[];
        unread: number;
        total: number;
      };
    }>("campus-mail-updated", ({ payload }) => {
      if (active)
        setStore((s) =>
          s.data[payload.accountId]
            ? {
                ...s,
                data: {
                  ...s.data,
                  [payload.accountId]: {
                    ...s.data[payload.accountId],
                    mailInbox: payload.mail.rows,
                    mailCount: payload.mail.unread,
                    mailTotal: payload.mail.total,
                  },
                },
              }
            : s,
        );
    });
    return () => {
      active = false;
      void off.then((stop) => stop());
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const off = listen<{ accountId: string; message: string }>(
      "campus-mail-error",
      ({ payload }) => {
        if (!payload.message.includes("登录状态已失效")) return;
        void withCampusSession(payload.accountId, () =>
          invoke("refresh_mailbox", { username: payload.accountId }),
        ).catch(() => {
          if (active)
            setToast("校园邮箱需要重新登录后继续后台检查", "error", {
              label: "重新登录",
              onClick: () => setLogin({ studentId: payload.accountId }),
            });
        });
      },
    );
    return () => {
      active = false;
      void off.then((stop) => stop());
    };
  }, []);
  async function sync(target = account, scope = pageScope ?? "all") {
    if (!target || syncing) return;
    setSyncing(true);
    setSyncLabel("正在连接校园系统");
    try {
      if (target.demo) {
        setStore((s) => ({
          ...s,
          data: {
            ...s.data,
            [target.id]: {
              ...s.data[target.id],
              lastSync:
                scope === "all"
                  ? new Date().toISOString()
                  : s.data[target.id].lastSync,
              syncedAt: {
                ...s.data[target.id].syncedAt,
                [scope]: new Date().toISOString(),
              },
            },
          },
        }));
        setToast("演示数据已刷新；添加校园账号可同步真实数据");
      } else {
        const result = await syncCampus(
          target.id,
          setSyncLabel,
          (patch) => {
            setStore((s) =>
              s.data[target.id]
                ? {
                    ...s,
                    data: {
                      ...s.data,
                      [target.id]: applySync(s.data[target.id], {
                        homeworkPatches: [patch],
                        failures: [],
                        scope: "homework",
                      }),
                    },
                  }
                : s,
            );
          },
          scope,
        );
        setStore((s) =>
          s.accounts.some((a) => a.id === target.id)
            ? {
                ...s,
                accounts: result.profile
                  ? s.accounts.map((a) =>
                      a.id === target.id ? result.profile! : a,
                    )
                  : s.accounts,
                data: {
                  ...s.data,
                  [target.id]: applySync(
                    s.data[target.id] ?? emptyData(),
                    result,
                  ),
                },
              }
            : s,
        );
        setToast(
          result.failures.length
            ? `部分同步完成：${result.failures.join("；")}`
            : scope === "all"
              ? "校园数据已同步"
              : "当前页面已同步",
          result.failures.length ? "info" : "success",
          result.failures.length
            ? {
                label: "重试同步",
                onClick: () => {
                  void sync(target, scope);
                },
              }
            : undefined,
        );
      }
    } catch (error) {
      const message =
        error instanceof ManualCaptchaRequired
          ? "验证码需要手动填写，请重新登录"
          : String(error);
      setToast(message, "error");
      if (
        message.includes("登录状态已失效") ||
        error instanceof ManualCaptchaRequired
      )
        setLogin({ studentId: target.id });
    } finally {
      setSyncing(false);
      setSyncLabel("");
    }
  }
  async function loadResource(node: Resource) {
    const target = account;
    if (!target || target.demo) return node.children;
    let children: Resource[];
    try {
      children = await loadCourseware(target.id, node);
    } catch (error) {
      if (String(error).includes("登录状态已失效"))
        setLogin({ studentId: target.id });
      throw error;
    }
    const update = (nodes: Resource[]): Resource[] =>
      nodes.map((item) =>
        item.id === node.id
          ? { ...item, children, loaded: true }
          : { ...item, children: update(item.children) },
      );
    setStore((s) =>
      s.data[target.id]
        ? {
            ...s,
            data: {
              ...s.data,
              [target.id]: {
                ...s.data[target.id],
                resources: update(s.data[target.id].resources),
              },
            },
          }
        : s,
    );
    return children;
  }
  async function retryCourse(id: string) {
    if (!account || account.demo) return;
    const target = account.id;
    const result = await retryHomework(target, id);
    setStore((s) =>
      s.data[target]
        ? {
            ...s,
            data: {
              ...s.data,
              [target]: applySync(s.data[target], {
                ...result,
                scope: "homework",
              }),
            },
          }
        : s,
    );
    setToast(
      result.failures.length ? result.failures.join("；") : "课程作业已刷新",
      result.failures.length ? "error" : "success",
    );
  }
  function replayCache(id: string, list: Replay[]) {
    if (!account) return;
    const target = account.id;
    setStore((s) =>
      s.data[target]
        ? {
            ...s,
            data: {
              ...s.data,
              [target]: {
                ...s.data[target],
                replays: { ...s.data[target].replays, [id]: list },
              },
            },
          }
        : s,
    );
  }
  async function removeAccount(id: string) {
    try {
      if (!store.accounts.find((a) => a.id === id)?.demo && isTauri())
        await invoke("remove_account", { username: id });
      setStore((s) => {
        const { [id]: _, ...data } = s.data;
        const accounts = s.accounts.filter((a) => a.id !== id);
        return {
          accounts,
          data,
          activeId: s.activeId === id ? (accounts[0]?.id ?? "") : s.activeId,
        };
      });
      setRemoveId(null);
      setToast("账号及本机缓存已移除");
    } catch (error) {
      setToast(String(error), "error");
    }
  }
  function accountAdded(added: Account) {
    setStore((s) => ({
      accounts: [...s.accounts.filter((a) => a.id !== added.id), added],
      activeId: added.id,
      data: { ...s.data, [added.id]: s.data[added.id] ?? emptyData() },
    }));
    setLogin(null);
    setPage("overview");
    setToast("登录成功，正在同步校园数据");
    window.scrollTo(0, 0);
    void sync(added, "all");
  }
  const courseNames = [
    ...new Set([
      ...data.courses.map((item) => item.name),
      ...data.grades.map((item) => item.name),
      ...data.resources.map((item) => item.name),
    ]),
  ];
  const searchItems: MorphingSearchItem[] = [
    ...navItems.map((item) => ({
      id: `page-${item.id}`,
      title: item.label,
      description: "页面",
      icon: icons[item.icon as keyof typeof icons],
      onSelect: () => navigate(item.id),
    })),
    ...courseNames.map((name, index) => ({
      id: `course-${index}`,
      title: name,
      description: "课程空间",
      icon: BookOpen,
      onSelect: () => setCourseName(name),
    })),
    ...data.homework.map((item) => ({
      id: `homework-${item.id}`,
      title: item.title,
      description: item.course,
      icon: BookOpen,
      onSelect: () => {
        navigate("homework");
        setQuery(item.title);
      },
    })),
  ];
  return (
    <AnimatedSidebarProvider
      className="app-shell"
      style={{ "--sidebar-width": "236px", "--sidebar-width-icon": "68px" }}
    >
      <CampusSidebar
        page={page}
        account={account}
        accounts={store.accounts}
        navigate={navigate}
        onSwitch={switchAccount}
        onAdd={() => setLogin({})}
        pending={
          data.homework.filter((h) => homeworkState(h, now) === "pending")
            .length
        }
        downloading={
          downloadTasks.filter(
            (t) =>
              t.accountId === account?.id &&
              (t.state === "queued" || t.state === "downloading"),
          ).length
        }
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <AnimatedSidebarTrigger
              className="mobile-sidebar-trigger"
              aria-label="展开主导航"
            />
            <Breadcrumb className="workspace-breadcrumb">
              <BreadcrumbList maxItems={3}>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href="#overview"
                    onClick={(event) => {
                      event.preventDefault();
                      navigate("overview");
                    }}
                  >
                    工作空间
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbPage>
                    {page === "settings"
                      ? "设置"
                      : page === "accounts"
                        ? "账号与数据"
                        : navItems.find((item) => item.id === page)?.label}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="topbar-actions">
            <MorphingSearch
              items={searchItems}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              shortcut=""
              placeholder="搜索课程、作业或页面"
              emptyMessage="没有找到匹配内容"
              className="global-morphing-search"
            />
            {query && (
              <Button size="sm" variant="ghost" onClick={() => setQuery("")}>
                清除筛选
              </Button>
            )}
            <button
              className="topbar-icon"
              aria-label="打开校园邮箱"
              onClick={() => navigate("mail")}
            >
              <Mail size={19} />
              {data.mailCount > 0 && <span className="notification-dot" />}
            </button>
            <button
              className="topbar-icon"
              aria-label="查看数据变更"
              ref={notificationsTrigger}
              onClick={() => setNotificationsOpen((value) => !value)}
              aria-expanded={notificationsOpen}
            >
              <Bell size={19} />
              {data.changes.length > 0 && <span className="notification-dot" />}
            </button>
            {notificationsOpen && (
              <UpdatesPopover
                changes={data.changes}
                trigger={notificationsTrigger}
                onClose={() => setNotificationsOpen(false)}
                onSelect={(change) => {
                  setNotificationsOpen(false);
                  const destinations: Record<string, Page> = {
                    作业: "homework",
                    成绩: "grades",
                    课表: "schedule",
                    资料: "resources",
                    邮箱: "mail",
                  };
                  if (destinations[change.category])
                    navigate(destinations[change.category]);
                  else setDialog("changes");
                }}
                onViewAll={() => {
                  setNotificationsOpen(false);
                  setDialog("changes");
                }}
              />
            )}
            <span
              className="header-sync"
              title={
                (data.syncedAt?.[pageScope ?? "all"] ?? data.lastSync)
                  ? `上次同步 ${new Date(data.syncedAt?.[pageScope ?? "all"] ?? data.lastSync).toLocaleString("zh-CN")}`
                  : "尚未同步"
              }
            >
              {" "}
              {account?.demo && (
                <Button
                  className="connect-campus"
                  size="sm"
                  onClick={() => setLogin({})}
                >
                  <Plus size={14} />
                  连接校园账号
                </Button>
              )}
              {pageScope && (
                <SyncButton
                  idleLabel={pageScope === "all" ? "全部同步" : "刷新本页"}
                  syncing={syncing}
                  label={syncLabel}
                  onPress={() => void sync()}
                />
              )}
            </span>
            <span className="topbar-divider" />
            <button
              className="topbar-icon"
              aria-label="使用帮助"
              onClick={() => setDialog("help")}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {page === "settings" ? (
            <div className="page-content">
              <Settings account={account} />
            </div>
          ) : page === "downloads" ? (
            <div className="page-content">
              <Downloads account={account} />
            </div>
          ) : !account ? (
            <div className="no-account">
              <span className="brand-mark">
                <BookOpen size={32} />
              </span>
              <TextReveal
                as="h1"
                text="你的校园生活，从这里开始"
                split="char"
                stagger={0.025}
                blur={4}
              />
              <p>连接校园账号，查看课表、成绩、作业和课程资料。</p>
              <Button onClick={() => setLogin({})}>
                <Plus size={16} />
                添加校园账号
              </Button>
            </div>
          ) : (
            <div key={`${account.id}-${page}`} className="page-content">
              {page === "overview" && (
                <Overview
                  account={account}
                  data={data}
                  navigate={navigate}
                  showChanges={() => setDialog("changes")}
                  showMail={() => navigate("mail")}
                  onHomeworkUpdate={retryCourse}
                  onCourse={setCourseName}
                />
              )}
              {page === "schedule" && (
                <Schedule data={data} query={query} onCourse={setCourseName} />
              )}
              {page === "grades" && (
                <Grades data={data} query={query} onCourse={setCourseName} />
              )}
              {page === "homework" && (
                <Assignments
                  account={account}
                  data={data}
                  query={query}
                  onRetry={retryCourse}
                  onCourse={setCourseName}
                />
              )}
              {page === "resources" && (
                <LearningResources
                  account={account}
                  data={data}
                  query={query}
                  onLoad={loadResource}
                  onRefresh={() => sync(account, "resources")}
                  onReplayCache={replayCache}
                />
              )}
              {page === "mail" && (
                <MailPage
                  account={account}
                  onLoginRequired={() => setLogin({ studentId: account.id })}
                  rows={
                    data.mailInbox ??
                    (account.demo
                      ? [
                          {
                            id: "mail-demo-1",
                            subject: "课程教学安排通知",
                            from: "教务办公室",
                            summary:
                              "请同学们查看本周课程与教学安排。教学周和教室安排请以教务平台公布的信息为准。",
                            date: new Date().toISOString(),
                            read: false,
                            attached: true,
                          },
                          {
                            id: "mail-demo-2",
                            subject: "实验课程资料已更新",
                            from: "计算机网络课程组",
                            summary:
                              "本周的实验指导书和参考资料已上传至智慧课程平台，请课前阅读并准备实验环境。",
                            date: new Date(
                              Date.now() - 3600000 * 5,
                            ).toISOString(),
                            read: false,
                            attached: false,
                          },
                          {
                            id: "mail-demo-3",
                            subject: "校园网服务提醒",
                            from: "信息中心",
                            summary:
                              "校园网服务将于周末进行例行维护，相关说明可在学校官网查看。",
                            date: new Date(Date.now() - 86400000).toISOString(),
                            read: false,
                            attached: false,
                          },
                          {
                            id: "mail-demo-4",
                            subject: "课程成绩发布",
                            from: "教务处",
                            summary:
                              "本学期部分课程成绩已发布，请通过教务系统查看成绩和学分详情。",
                            date: new Date(
                              Date.now() - 86400000 * 2,
                            ).toISOString(),
                            read: true,
                            attached: false,
                          },
                          {
                            id: "mail-demo-5",
                            subject: "图书馆借阅到期提示",
                            from: "图书馆",
                            summary:
                              "您借阅的图书即将到期，可登录图书馆系统续借或按时归还。",
                            date: new Date(
                              Date.now() - 86400000 * 4,
                            ).toISOString(),
                            read: true,
                            attached: false,
                          },
                        ]
                      : [])
                  }
                  total={data.mailTotal}
                  onRefresh={() => sync(account, "mail")}
                />
              )}
              {page === "services" && (
                <Services
                  account={account}
                  onLoginRequired={() => setLogin({ studentId: account.id })}
                  data={data}
                  onDeviceView={setDeviceView}
                  onRefresh={() => sync(account, "services")}
                />
              )}
              {page === "classrooms" && (
                <Classrooms
                  key={account.id}
                  account={account}
                  currentWeek={data.currentWeek}
                  onLoginRequired={() => setLogin({ studentId: account.id })}
                />
              )}
              {page === "files" && <FileSpace account={account} />}

              {page === "accounts" && (
                <Accounts
                  accounts={store.accounts}
                  activeId={account.id}
                  onSwitch={switchAccount}
                  onAdd={() => setLogin({})}
                  onRemove={setRemoveId}
                  onLogin={(a) => setLogin({ studentId: a.id })}
                  onLogout={async (a) => {
                    try {
                      await invoke("remove_account", { username: a.id });
                      setToast("已退出登录，本机缓存可继续查看");
                    } catch (error) {
                      setToast(String(error), "error");
                    }
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>
      {courseName && account && (
        <CourseDrawer
          key={`${account.id}-${courseName}`}
          name={courseName}
          account={account}
          data={data}
          onClose={() => setCourseName(null)}
          onLoad={loadResource}
          onRefreshResources={() => sync(account, "resources")}
          onRetry={retryCourse}
          onReplayCache={replayCache}
        />
      )}
      {login && (
        <LoginModal
          studentId={login.studentId}
          onClose={() => setLogin(null)}
          onSuccess={accountAdded}
        />
      )}
      {removeId && (
        <Modal
          title="移除这个账号？"
          subtitle="此账号在本机的登录状态与缓存也会一并清除。"
          onClose={() => setRemoveId(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemoveId(null)}>
              取消
            </Button>
            <Button
              className="danger-button"
              onClick={() => removeAccount(removeId)}
            >
              移除账号
            </Button>
          </div>
        </Modal>
      )}
      {dialog === "changes" && (
        <Modal
          title="校园动态"
          subtitle="最近同步发现的数据变化"
          onClose={() => setDialog(null)}
        >
          <div className="changes-modal">
            {data.changes.length ? (
              data.changes.map((c) => (
                <div className="change-row" key={c.id}>
                  <span
                    className={`soft-tag ${c.kind === "删除" ? "orange" : "blue"}`}
                  >
                    {c.kind}
                  </span>
                  <div>
                    <h3>{c.title}</h3>
                    <p>
                      {c.category} · {fullDate(c.time)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="quiet-empty">目前没有新的数据变化。</p>
            )}
          </div>
        </Modal>
      )}
      {dialog === "mail" && (
        <Modal
          title="校园邮箱"
          subtitle="MIS 校园邮箱状态"
          onClose={() => setDialog(null)}
        >
          <div className="mail-preview">
            <span className="mail-illustration">
              <Mail size={39} strokeWidth={1.4} />
            </span>
            <strong>
              {data.mailCount}
              <small>封未读邮件</small>
            </strong>
            <p>
              {account?.demo
                ? "当前数量来自演示数据。"
                : "同步数据可获取最新的未读邮件数量。"}
            </p>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="你好，这里是知行"
          subtitle="把校园里的重要事情，放在一起。"
          onClose={() => setDialog(null)}
        >
          <div className="help-content">
            <p>
              侧边栏切换课表、成绩、作业与课程资料，点击内容查看详情。右上角可以搜索当前账号的校园数据。
            </p>
            <p>
              演示账号可直接体验界面。添加校园账号后，点击“同步数据”获取学校系统的内容。
            </p>
            <p>各账号独立保存登录状态与缓存，同步过的数据可离线查看。</p>
            <Button
              onClick={() => {
                setDialog(null);
                setLogin({});
              }}
            >
              连接校园账号
              <ChevronRight size={16} />
            </Button>
          </div>
        </Modal>
      )}
      <FeedbackAlerts />
    </AnimatedSidebarProvider>
  );
}
