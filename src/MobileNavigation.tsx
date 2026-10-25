import { Home, CalendarDays, NotebookPen, Mail, Grid2X2 } from "lucide-react";
import { Button } from "@/components/motion/button";
import type { Page } from "./types";
const primary = [
  { id: "overview", label: "首页", icon: Home },
  { id: "schedule", label: "课表", icon: CalendarDays },
  { id: "applications", label: "应用", icon: Grid2X2 },
  { id: "homework", label: "作业", icon: NotebookPen },
  { id: "mail", label: "邮箱", icon: Mail },
] as const;
export default function MobileNavigation({
  page,
  navigate,
  unread,
}: {
  page: Page;
  navigate: (page: Page, root?: boolean) => void;
  unread: number;
}) {
  return (
    <nav className="mobile-navigation" aria-label="底部导航">
      {primary.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant="ghost"
          className={`mobile-nav-item ${id === "applications" ? "mobile-nav-apps" : ""}`}
          aria-label={label}
          aria-current={page === id ? "page" : undefined}
          onClick={() => {
            if (page === id)
              window.dispatchEvent(
                new CustomEvent("campus:tab-reselect", { detail: id }),
              );
            navigate(id, true);
          }}
        >
          <span>
            <Icon size={23} />
            {id === "mail" && unread > 0 && (
              <b>{unread > 99 ? "99+" : unread}</b>
            )}
          </span>
          <small>{label}</small>
        </Button>
      ))}
    </nav>
  );
}
