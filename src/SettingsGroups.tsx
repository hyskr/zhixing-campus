import { useCompactLayout } from "./platform";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  Bell,
  Download,
  KeyRound,
  Palette,
  Stethoscope,
  Wifi,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/motion/button";
const sections = [
  {
    id: "updates",
    title: "应用更新",
    description: "版本与发布说明",
    icon: ArrowUpCircle,
  },
  {
    id: "appearance",
    title: "外观",
    description: "界面风格与阅读体验",
    icon: Palette,
  },
  {
    id: "notifications",
    title: "通知与提醒",
    description: "邮件、成绩与上课提醒",
    icon: Bell,
  },
  {
    id: "files",
    title: "下载与文件",
    description: "下载任务、课件与上传记录",
    icon: Download,
  },
  {
    id: "connection",
    title: "登录与网络",
    description: "课程连接与校园网",
    icon: Wifi,
  },
  {
    id: "credentials",
    title: "账号与凭据",
    description: "当前账号的保存方式",
    icon: KeyRound,
  },
  {
    id: "diagnostics",
    title: "环境诊断",
    description: "检查连接与本地环境",
    icon: Stethoscope,
  },
];
const category: Record<string, string> = {
  appearance: "appearance",
  notifications: "notifications",
  mail: "notifications",
  login: "connection",
  network: "connection",
  downloads: "files",
  uploads: "files",
  credentials: "credentials",
  diagnostics: "diagnostics",
};
const SettingsGroupContext = createContext("appearance");
export function SettingsGroups({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("appearance");
  const compact = useCompactLayout();
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    if (!compact || !detail) return;
    const back = (event: Event) => {
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setDetail(false);
    };
    window.addEventListener("campus:before-back", back);
    return () => window.removeEventListener("campus:before-back", back);
  }, [compact, detail]);
  const current = sections.find((s) => s.id === active)!;
  return (
    <SettingsGroupContext.Provider value={active}>
      <div
        className={`settings-workspace ${compact ? "mobile-settings-workspace" : ""} ${detail ? "is-detail" : ""}`}
      >
        <nav className="settings-navigation" aria-label="设置分类">
          {sections.map(({ id, title, description, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className="settings-category"
              aria-current={!compact && id === active ? "page" : undefined}
              onClick={() => {
                setActive(id);
                setDetail(true);
              }}
            >
              {compact ? (
                <>
                  <span className="settings-category-icon">
                    <Icon size={19} />
                  </span>
                  <span className="settings-category-copy">
                    <strong>{title}</strong>
                    {compact && <small>{description}</small>}
                  </span>
                </>
              ) : (
                <>
                  <Icon size={16} />
                  {title}
                </>
              )}
              {compact && (
                <ChevronRight size={16} className="settings-category-chevron" />
              )}
            </Button>
          ))}
        </nav>
        <div className="settings-pane" key={active}>
          <header className="settings-pane-heading">
            {compact && (
              <Button
                variant="ghost"
                className="settings-back"
                onClick={() => setDetail(false)}
              >
                <ChevronLeft size={18} />
                全部设置
              </Button>
            )}
            {compact ? (
              <div>
                <h2>{current.title}</h2>
                <p>{current.description}</p>
              </div>
            ) : (
              <>
                <h2>{current.title}</h2>
                <p>{current.description}</p>
              </>
            )}
          </header>
          <div className="settings-groups">{children}</div>
        </div>
      </div>
    </SettingsGroupContext.Provider>
  );
}
export function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const active = useContext(SettingsGroupContext);
  if ((category[id] ?? id) !== active) return null;
  return (
    <section
      className="campus-settings-group"
      aria-labelledby={`settings-${id}`}
    >
      <header className="settings-section-heading">
        <h3 id={`settings-${id}`}>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="settings-group-content">{children}</div>
    </section>
  );
}
