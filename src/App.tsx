import MobileTopBar from "./MobileTopBar";
import MobileSearch from "./MobileSearch";
import Applications from "./Applications";
import MobileRefreshSurface, {
  pageRefreshHandler,
} from "./MobileRefreshSurface";
import MobileNavigation from "./MobileNavigation";
import { useCompactLayout } from "./platform";
import ReminderBridge from "./ReminderBridge";
import { makeDemoMail } from "./demo";
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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CircleHelp,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  LogOut,
  Mail,
  Plus,
  PanelLeft,
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
  type Change,
  type Resource,
  type Replay,
  type HomeworkPatch,
} from "./types";

export default function App() {
  const compactLayout = useCompactLayout();
  const [store, setStore] = useState(loadStore);
  const { tasks: downloadTasks } = useDownloads();
  const now = useNow();
  const [page, setPage] = useState<Page>("overview");
  const previousPages = useRef<Page[]>([]);
  const scrollPositions = useRef<Partial<Record<Page, number>>>({});
  useLayoutEffect(() => {
    if (!compactLayout) return;
    const main = document.querySelector<HTMLElement>(".main-content");
    if (!main) return;
    main.scrollTop = scrollPositions.current[page] ?? 0;
    return () => {
      scrollPositions.current[page] = main.scrollTop;
    };
  }, [page, compactLayout]);

  const [mailTarget, setMailTarget] = useState<{
    id: string;
    folder: "inbox" | "sent";
  } | null>(null);
  const [deviceView, setDeviceView] = useState(false);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [mobileRefreshing, setMobileRefreshing] = useState(false);
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
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setPage("settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const back = () => {
      const event = new Event("campus:before-back", { cancelable: true });
      window.dispatchEvent(event);
      if (event.defaultPrevented) return true;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return true;
      }
      if (document.querySelector('[role="dialog"]')) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return true;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        return true;
      }
      if (courseName) {
        setCourseName(null);
        return true;
      }
      if (page !== "overview") {
        setPage(previousPages.current.pop() ?? "overview");
        setQuery("");
        return true;
      }
      return false;
    };
    (window as Window & { __campusBack?: () => boolean }).__campusBack = back;
    return () => {
      delete (window as Window & { __campusBack?: () => boolean }).__campusBack;
    };
  }, [page, searchOpen, notificationsOpen, courseName]);
  const navigate = (next: Page, root = false) => {
    if (compactLayout && next !== page) {
      if (root) previousPages.current = [];
      else previousPages.current.push(page);
    }
    setMailTarget(null);
    setPage(next);
    setQuery("");
    window.scrollTo(0, 0);
  };
  function openMail(id?: string, folder: "inbox" | "sent" = "inbox") {
    if (compactLayout && page !== "mail") previousPages.current.push(page);
    setMailTarget(id ? { id, folder } : null);
    setPage("mail");
    setQuery("");
  }
  function openChange(change: Change) {
    setNotificationsOpen(false);
    setDialog(null);
    if (change.category === "邮箱") {
      openMail(change.messageId, change.mailFolder ?? "inbox");
      return;
    }
    const destination: Record<string, Page> = {
      作业: "homework",
      成绩: "grades",
      课表: "schedule",
      资料: "resources",
    };
    if (destination[change.category]) navigate(destination[change.category]);
    else setDialog("changes");
  }
  const switchAccount = (id: string) => {
    previousPages.current = [];
    scrollPositions.current = {};
    setMailTarget(null);
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
  async function refreshMobilePage() {
    if (mobileRefreshing || syncing) return;
    setMobileRefreshing(true);
    try {
      const refresh = pageRefreshHandler();
      if (refresh) await refresh();
      else if (pageScope) await sync();
    } catch (error) {
      setToast(String(error), "error");
    } finally {
      setMobileRefreshing(false);
    }
  }
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
                  [payload.accountId]: applySync(s.data[payload.accountId], {
                    scope: "mail",
                    mailInbox: payload.mail.rows,
                    mailCount: payload.mail.unread,
                    mailTotal: payload.mail.total,
                    failures: [],
                  }),
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
      <ReminderBridge account={account} data={data} />
      {!compactLayout && (
        <CampusSidebar
          page={page}
          unread={data.mailCount}
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
      )}
      <div className="main-shell">
        {compactLayout ? (
          <MobileTopBar
            page={page}
            account={account}
            week={data.currentWeek}
            now={now}
            busy={syncing || mobileRefreshing}
            onBack={() => {
              (
                window as Window & { __campusBack?: () => boolean }
              ).__campusBack?.();
            }}
            onSearch={() => setSearchOpen(true)}
            onAccount={() => (account ? navigate("accounts") : setLogin({}))}
            onRefresh={() => void refreshMobilePage()}
          />
        ) : (
          <header className="topbar">
            <div className="breadcrumb">
              <AnimatedSidebarTrigger
                className="mobile-sidebar-trigger"
                aria-label="展开主导航"
              >
                <PanelLeft size={18} aria-hidden="true" />
              </AnimatedSidebarTrigger>
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
                {data.changes.length > 0 && (
                  <span className="notification-dot" />
                )}
              </button>
              {notificationsOpen && (
                <UpdatesPopover
                  changes={data.changes}
                  trigger={notificationsTrigger}
                  onClose={() => setNotificationsOpen(false)}
                  onSelect={openChange}
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
        )}
        <MobileRefreshSurface
          main
          className="main-content"
          refresh={
            compactLayout &&
            account &&
            [
              "overview",
              "homework",
              "grades",
              "resources",
              "services",
              "classrooms",
            ].includes(page)
              ? refreshMobilePage
              : undefined
          }
          refreshing={mobileRefreshing || syncing}

          disabled={!pageScope && page !== "classrooms"}
        >
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
                  showMail={openMail}
                  onChange={openChange}
                  onHomeworkUpdate={retryCourse}
                  onCourse={setCourseName}
                />
              )}
              {page === "applications" && (
                <Applications
                  account={account}
                  navigate={navigate}
                  onLogin={() => setLogin({})}
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
                  key={account.id}
                  account={account}
                  onRead={(ids, read, displayedRows) =>
                    setStore((s) => {
                      const old = s.data[account.id];
                      if (!old) return s;
                      const inbox = old.mailInbox ?? displayedRows;
                      const changed = inbox.filter(
                        (row) => ids.includes(row.id) && row.read !== read,
                      ).length;
                      return {
                        ...s,
                        data: {
                          ...s.data,
                          [account.id]: {
                            ...old,
                            mailInbox: inbox.map((row) =>
                              ids.includes(row.id) ? { ...row, read } : row,
                            ),
                            mailCount: Math.max(
                              0,
                              (old.mailInbox
                                ? old.mailCount
                                : inbox.filter((row) => !row.read).length) +
                                (read ? -changed : changed),
                            ),
                          },
                        },
                      };
                    })
                  }
                  onLoginRequired={() => setLogin({ studentId: account.id })}
                  target={mailTarget ?? undefined}
                  rows={
                    data.mailInbox ??
                    (account.demo
                      ? makeDemoMail(account.id === "demo-chen")
                      : [])
                  }
                  total={data.mailTotal}
                  sentRows={data.mailSent}
                  sentTotal={data.mailSentTotal}
                  refreshedAt={data.syncedAt?.mail}
                  onSentLoaded={(result) =>
                    setStore((s) =>
                      s.data[account.id]
                        ? {
                            ...s,
                            data: {
                              ...s.data,
                              [account.id]: applySync(s.data[account.id], {
                                scope: "mailSent",
                                mailSent: result.rows,
                                mailSentTotal: result.total,
                                failures: [],
                              }),
                            },
                          }
                        : s,
                    )
                  }
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
        </MobileRefreshSurface>
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
          presentation="dialog"
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
                <button
                  className="change-row"
                  key={c.id}
                  onClick={() => openChange(c)}
                >
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
                </button>
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
            <p>添加校园账号后，点击“全部同步”获取学校系统的数据。</p>
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
      {compactLayout && searchOpen && (
        <MobileSearch
          items={searchItems}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <FeedbackAlerts />
      {compactLayout && (
        <MobileNavigation
          page={page}
          navigate={navigate}
          unread={data.mailCount}
        />
      )}
    </AnimatedSidebarProvider>
  );
}
